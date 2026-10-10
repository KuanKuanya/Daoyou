#!/usr/bin/env bash
# Called over SSH by the production workflow; all runtime secrets stay on host.
set -Eeuo pipefail

DEPLOY_ROOT=/opt/daoyou
ENV_FILE="$DEPLOY_ROOT/.env.production"
APP_NETWORK=daoyou-runtime
GAME_ROOT=/srv/jiuxiaodaoji/game
UPSTREAM_CONF=/etc/nginx/conf.d/upstream/backend.conf
NGINX_SITE_CONF=/etc/nginx/conf.d/daoyou-ip.conf
PUBLIC_WEB_URL="http://${4:?deployment host is required}"
MAINTENANCE_FILE="$DEPLOY_ROOT/maintenance"
NODE_IMAGE=node:24.18.0-bookworm-slim
POSTGRES_IMAGE=postgres:17-alpine

bundle="${1:?release bundle is required}"
revision="${2:?revision is required}"
release_id="${3:?run id and attempt are required}"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid revision" >&2; exit 1; }
[[ "$release_id" =~ ^[0-9]+-[0-9]+$ ]] || { echo "Invalid release id" >&2; exit 1; }
[[ "$bundle" = "$DEPLOY_ROOT/incoming/$release_id.tgz" ]] || {
  echo "Unexpected release bundle path" >&2
  exit 1
}
[[ "$EUID" -eq 0 ]] || { echo "Deployment requires root" >&2; exit 1; }

for command in docker nginx curl flock python3 tar readlink; do
  command -v "$command" >/dev/null || { echo "Missing command: $command" >&2; exit 1; }
done
docker compose version >/dev/null
test -f "$ENV_FILE"
test -f "$UPSTREAM_CONF"
test -f "$NGINX_SITE_CONF"
test -f "$bundle"
test ! -e "$MAINTENANCE_FILE" || {
  echo "Maintenance is already active; resolve the previous deployment before retrying" >&2
  exit 1
}
nginx -T 2>/dev/null | grep -E '^[[:space:]]*if \(-f /opt/daoyou/maintenance\)' >/dev/null || {
  echo "Install the maintenance guard in $NGINX_SITE_CONF before deploying" >&2
  exit 1
}
nginx -t
docker network inspect "$APP_NETWORK" >/dev/null

exec 8>"$DEPLOY_ROOT/.release.lock"
flock -n 8 || { echo "Another production deployment is running" >&2; exit 1; }
# Check again after locking so a failed concurrent release cannot be bypassed.
test ! -e "$MAINTENANCE_FILE"

release="$DEPLOY_ROOT/releases/$revision/$release_id"
mkdir -p "$DEPLOY_ROOT/releases/$revision"
mkdir "$release"
chmod 755 "$DEPLOY_ROOT/releases" "$DEPLOY_ROOT/releases/$revision" "$release"
tar -xzf "$bundle" -C "$release"
mkdir "$release/source" "$release/web"
tar -xzf "$release/source.tar.gz" -C "$release/source"
tar -xzf "$release/game-web.tar.gz" -C "$release/web"
chmod -R a+rX "$release/web"

image="$(python3 - "$release" "$revision" "$release_id" <<'PY'
import json, re, sys
from pathlib import Path
root, revision, release_id = sys.argv[1:]
manifest = json.loads((Path(root) / "release.json").read_text())
assert manifest["revision"] == revision, "Release revision mismatch"
# A failed deploy job may reuse an earlier publish attempt in this same run.
assert manifest["run_id"] == release_id.split("-")[0], "Release run mismatch"
assert re.fullmatch(r"kuankuan/daoyou-app@sha256:[0-9a-f]{64}", manifest["image"]), "Invalid image"
version = json.loads((Path(root) / "web/version.json").read_text())
assert version["buildId"] == revision, "SPA revision mismatch"
assert (Path(root) / "web/index.html").is_file(), "Missing SPA entry"
print(manifest["image"])
PY
)"

source="$release/source"
test -f "$source/scripts/blue-green-app.sh"
test -f "$source/scripts/docker-compose.production.yml"
test -f "$source/drizzle.config.ts"
test -f "$source/drizzle.auth.config.ts"

# Download and install tooling before taking traffic offline.
docker pull "$image"
docker pull "$NODE_IMAGE"
docker pull "$POSTGRES_IMAGE"
docker run --rm -v "$source:/app" -w /app "$NODE_IMAGE" bash -ec \
  'npm install --global pnpm@12.10.1 && pnpm install --frozen-lockfile --prod=false'

previous_port="$(sed -nE 's/^[[:space:]]*server[[:space:]]+127\.0\.0\.1:([0-9]+);.*$/\1/p' "$UPSTREAM_CONF" | head -n 1)"
previous_container=""
case "$previous_port" in
  3000) previous_container=daoyou-app-blue ;;
  3001) previous_container=daoyou-app-green ;;
  *) echo "Unexpected upstream port: $previous_port" >&2; exit 1 ;;
esac
if docker inspect "$previous_container" >/dev/null 2>&1; then
  # The local image ID is retained even if the original latest tag moves.
  docker inspect --format '{{.Image}}' "$previous_container" > "$release/previous-image"
fi
if test -e "$GAME_ROOT"; then
  readlink -f "$GAME_ROOT" > "$release/previous-web"
fi
if test -L "$DEPLOY_ROOT/current"; then
  readlink -f "$DEPLOY_ROOT/current" > "$release/previous-release"
fi
cp "$UPSTREAM_CONF" "$release/previous-upstream.conf"

maintenance_started=0
succeeded=0
finish() {
  local status=$?
  if [[ "$maintenance_started" -eq 1 && "$succeeded" -eq 0 ]]; then
    touch "$MAINTENANCE_FILE"
    chmod 644 "$MAINTENANCE_FILE"
    echo "Deployment failed; maintenance remains active. Inspect $release before recovery." >&2
  fi
  return "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

touch "$MAINTENANCE_FILE"
chmod 644 "$MAINTENANCE_FILE"
maintenance_started=1

# Stop API workers too, so cron, messages and existing requests cannot mutate
# state while migrations run. Redis/NATS/PostgreSQL and their volumes stay up.
for container in daoyou-app-blue daoyou-app-green; do
  if docker inspect "$container" >/dev/null 2>&1; then
    docker stop --time 75 "$container"
  fi
done

mkdir -p "$DEPLOY_ROOT/backups"
chmod 700 "$DEPLOY_ROOT/backups"
backup="$DEPLOY_ROOT/backups/$revision-$release_id.dump"
umask 077
docker run --rm --network "$APP_NETWORK" --env-file "$ENV_FILE" \
  "$POSTGRES_IMAGE" sh -ec 'exec pg_dump --format=custom "$DATABASE_URL"' > "$backup"
test -s "$backup"
docker run --rm -v "$backup:/backup.dump:ro" "$POSTGRES_IMAGE" \
  pg_restore --list /backup.dump >/dev/null
printf '%s\n' "$backup" > "$release/database-backup"
umask 022

docker run --rm --network "$APP_NETWORK" --env-file "$ENV_FILE" \
  -v "$source:/app" -w /app "$NODE_IMAGE" bash -ec \
  'npm install --global pnpm@12.10.1 && pnpm exec drizzle-kit migrate --config drizzle.auth.config.ts && pnpm exec drizzle-kit migrate --config drizzle.config.ts'

APP_IMAGE="$image" PULL_IMAGE=0 ENV_FILE="$ENV_FILE" \
COMPOSE_FILE="$source/scripts/docker-compose.production.yml" \
UPSTREAM_CONF="$UPSTREAM_CONF" NGINX_MODE=host APP_NETWORK="$APP_NETWORK" \
BLUE_PORT=3000 GREEN_PORT=3001 \
  bash "$source/scripts/blue-green-app.sh"

# Preserve the first pre-Actions static directory instead of deleting it.
if [[ -d "$GAME_ROOT" && ! -L "$GAME_ROOT" ]]; then
  previous_web="$GAME_ROOT.pre-actions-$release_id"
  mv "$GAME_ROOT" "$previous_web"
  printf '%s\n' "$previous_web" > "$release/previous-web"
fi
mkdir -p "$(dirname "$GAME_ROOT")"
ln -s "$release/web" "$GAME_ROOT.next-$release_id"
mv -Tf "$GAME_ROOT.next-$release_id" "$GAME_ROOT"

rm "$MAINTENANCE_FILE"
curl --fail --silent --show-error --max-time 30 "$PUBLIC_WEB_URL/api/health-check" >/dev/null
curl --fail --silent --show-error --max-time 30 "$PUBLIC_WEB_URL/version.json" \
  | python3 -c 'import json,sys; assert json.load(sys.stdin)["buildId"] == sys.argv[1], "Live SPA revision mismatch"' "$revision"

ln -s "$release" "$DEPLOY_ROOT/current.next-$release_id"
mv -Tf "$DEPLOY_ROOT/current.next-$release_id" "$DEPLOY_ROOT/current"
succeeded=1
echo "Deployed $revision ($image) at $release"

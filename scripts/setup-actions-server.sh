#!/usr/bin/env bash
# Run once in the existing root SSH session; never prints private keys.
set -Eeuo pipefail

[[ "$EUID" -eq 0 ]] || { echo "Run this setup as root" >&2; exit 1; }
DEPLOY_ROOT=/opt/daoyou
SITE_CONF=/etc/nginx/conf.d/daoyou-ip.conf
KEY_FILE=/root/.ssh/daoyou_actions
AUTHORIZED_KEYS=/root/.ssh/authorized_keys

test -f "$DEPLOY_ROOT/.env.production"
test -f "$SITE_CONF"
test -f /etc/ssh/ssh_host_ed25519_key.pub
docker compose version >/dev/null
nginx -t
install -d -m 755 "$DEPLOY_ROOT/incoming" "$DEPLOY_ROOT/releases"
install -d -m 700 "$DEPLOY_ROOT/backups" /root/.ssh

backup="$(mktemp "$SITE_CONF.before-actions.XXXXXX")"
cp -p "$SITE_CONF" "$backup"
python3 - "$SITE_CONF" <<'PY'
import os, re, sys
from pathlib import Path
path = Path(sys.argv[1])
content = path.read_text()
guard = "  if (-f /opt/daoyou/maintenance) { return 503; }"
if guard not in content:
    pattern = r"(?m)^server \{[ \t]*$"
    assert len(re.findall(pattern, content)) == 1, "Expected the single-IP nginx site; inspect the config manually"
    content = re.sub(pattern, "server {\n" + guard, content)
    temporary = path.with_name(path.name + ".actions-tmp")
    temporary.write_text(content)
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)
PY
if ! nginx -t || ! nginx -s reload; then
  cp -p "$backup" "$SITE_CONF"
  nginx -s reload || true
  echo "Nginx setup failed; original config restored" >&2
  exit 1
fi

if [[ ! -f "$KEY_FILE" ]]; then
  ssh-keygen -t ed25519 -N '' -C daoyou-github-actions -f "$KEY_FILE"
fi
test -f "$KEY_FILE.pub"
touch "$AUTHORIZED_KEYS"
public_key="restrict $(cat "$KEY_FILE.pub")"
grep -Fxq "$public_key" "$AUTHORIZED_KEYS" || printf '\n%s\n' "$public_key" >> "$AUTHORIZED_KEYS"
chmod 600 "$KEY_FILE" "$AUTHORIZED_KEYS"

cat <<'MESSAGE'
Server setup complete. Add these GitHub repository Secrets:
  PRODUCTION_SSH_KEY: contents of /root/.ssh/daoyou_actions (private key)
  PRODUCTION_SSH_KNOWN_HOSTS: output of:
    { printf '120.48.9.69 '; cat /etc/ssh/ssh_host_ed25519_key.pub; }
Paste the private key directly into GitHub, never into chat or a commit.
Keep /opt/daoyou/.env.production and the existing dependency configuration.
MESSAGE

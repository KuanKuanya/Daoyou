#!/usr/bin/env bash
# Run once in the existing root SSH session; never prints private keys.
set -Eeuo pipefail

KEY_MODE="${1:-existing-key}"
[[ "$#" -le 1 && ( "$KEY_MODE" == existing-key || "$KEY_MODE" == --generate-key ) ]] || {
  echo "Usage: $0 [existing-key|--generate-key]" >&2
  exit 1
}
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

if [[ "$KEY_MODE" == --generate-key ]]; then
  if [[ ! -e "$KEY_FILE" && ! -e "$KEY_FILE.pub" ]]; then
    ssh-keygen -t ed25519 -N '' -C daoyou-github-actions -f "$KEY_FILE"
  fi
  test -f "$KEY_FILE"
  test -f "$KEY_FILE.pub"
  touch "$AUTHORIZED_KEYS"
  public_key="restrict $(cat "$KEY_FILE.pub")"
  grep -Fxq "$public_key" "$AUTHORIZED_KEYS" || printf '\n%s\n' "$public_key" >> "$AUTHORIZED_KEYS"
  chmod 600 "$KEY_FILE" "$AUTHORIZED_KEYS"
  echo "PRODUCTION_SSH_KEY: contents of /root/.ssh/daoyou_actions (private key)"
else
  echo "PRODUCTION_SSH_KEY: use your existing cloud SSH private key; verify root login first."
fi

cat <<'MESSAGE'
Server setup complete. Add these GitHub repository Secrets:
  PRODUCTION_HOST: the server hostname or IPv4 address (also set locally for the command below)
  PRODUCTION_SSH_KNOWN_HOSTS: output of:
    { printf '%s ' "$PRODUCTION_HOST"; cat /etc/ssh/ssh_host_ed25519_key.pub; }
Paste the private key directly into GitHub, never into chat or a commit.
Keep /opt/daoyou/.env.production and the existing dependency configuration.
MESSAGE

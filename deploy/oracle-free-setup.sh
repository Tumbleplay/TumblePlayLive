#!/bin/bash
# Tumble: one-time setup for a free Oracle Cloud "Always Free" Ubuntu server.
# Paste this whole file into "Initialization script" (cloud-init) when you create the instance,
# or run it as root on the server:  sudo bash oracle-free-setup.sh
# Fill in the three values below first.
set -euo pipefail

REPO_URL="https://github.com/KahaGayaMeraPaisa/Tumble.git"
DUCKDNS_SUBDOMAIN="yourname"                                # yourname.duckdns.org
DUCKDNS_TOKEN="paste-your-duckdns-token-here"               # from duckdns.org after you log in

APP_DIR=/opt/tumble
DATA_DIR=/var/lib/tumble
DOMAIN="${DUCKDNS_SUBDOMAIN}.duckdns.org"
export DEBIAN_FRONTEND=noninteractive
log() { echo "[tumble-setup] $*" | tee -a /var/log/tumble-setup.log; }

log "1/8 Swap space so the build has room on small servers"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "2/8 System packages"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

log "3/8 Node.js 22"
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

log "4/8 Caddy web server (free automatic HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

log "5/8 Open ports 80 and 443 in the server firewall"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport $p -j ACCEPT
done
netfilter-persistent save

log "6/8 Point ${DOMAIN} at this server (and keep it updated)"
mkdir -p /opt/duckdns
cat > /opt/duckdns/update.sh <<DUCK
#!/bin/bash
curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=" -o /opt/duckdns/last.txt
DUCK
chmod 700 /opt/duckdns/update.sh && /opt/duckdns/update.sh
( crontab -l 2>/dev/null | grep -v duckdns; echo "*/5 * * * * /opt/duckdns/update.sh >/dev/null 2>&1" ) | crontab -

log "7/8 Download and build Tumble"
id tumble >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin tumble
mkdir -p "$DATA_DIR"
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO_URL" "$APP_DIR"; fi
cd "$APP_DIR"
npm ci --ignore-scripts
npm run build
npm prune --omit=dev --ignore-scripts
if [ ! -f /etc/tumble.env ]; then
  cat > /etc/tumble.env <<ENV
NODE_ENV=production
PORT=3000
DB_PATH=${DATA_DIR}/tumble.db
JWT_SECRET=$(openssl rand -hex 32)
ENV
  chmod 600 /etc/tumble.env
fi
chown -R tumble:tumble "$APP_DIR" "$DATA_DIR"

cat > /etc/systemd/system/tumble.service <<UNIT
[Unit]
Description=Tumble game room
After=network-online.target
Wants=network-online.target

[Service]
User=tumble
WorkingDirectory=${APP_DIR}
EnvironmentFile=/etc/tumble.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
${DOMAIN} {
  encode gzip
  reverse_proxy localhost:3000
}
CADDY

# Helper commands: tumble-update pulls new code and restarts; tumble-backup copies the database
cat > /usr/local/bin/tumble-update <<'UPD'
#!/bin/bash
set -e
cd /opt/tumble && sudo -u tumble git pull --ff-only
sudo -u tumble npm ci --ignore-scripts && sudo -u tumble npm run build && sudo -u tumble npm prune --omit=dev --ignore-scripts
systemctl restart tumble && echo "Tumble updated"
UPD
cat > /usr/local/bin/tumble-backup <<'BAK'
#!/bin/bash
mkdir -p /var/backups/tumble
cd /opt/tumble && node -e "require('better-sqlite3')('/var/lib/tumble/tumble.db',{readonly:true}).backup(process.argv[1]).then(()=>console.log('backup ok'))" "/var/backups/tumble/tumble-$(date +%F).db"
find /var/backups/tumble -name 'tumble-*.db' -mtime +14 -delete
BAK
chmod +x /usr/local/bin/tumble-update /usr/local/bin/tumble-backup
( crontab -l 2>/dev/null | grep -v tumble-backup; echo "30 3 * * * /usr/local/bin/tumble-backup" ) | crontab -

log "8/8 Start everything"
systemctl daemon-reload
systemctl enable --now tumble
systemctl restart caddy
sleep 3
if curl -fsS localhost:3000/api/config >/dev/null; then
  log "Done. Open https://${DOMAIN} (HTTPS can take a minute the first time). Sign up first: the first account is the admin."
else
  log "Tumble did not answer yet. Check with: journalctl -u tumble -n 50"
fi

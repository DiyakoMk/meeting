#!/usr/bin/env bash
# Orblood — one-shot VPS installer.
#
# Run this on a fresh Ubuntu 22.04 / 24.04 root shell. It will:
#   1. install Node 20, MariaDB 10.x, nginx, certbot, coturn, git
#   2. tune MariaDB (1 GB innodb buffer pool, utf8mb4)
#   3. generate strong random passwords for the DB user, the JWT secret,
#      and the TURN auth user/secret
#   4. clone (or pull) the repo into /opt/orblood
#   5. write /opt/orblood/server/.env, run `npm ci --omit=dev` and the
#      idempotent migration `npm run init-db`
#   6. install a systemd unit, an nginx vhost, and a Coturn config
#   7. fetch a Let's Encrypt cert (HTTP-01) for the domain you pass in
#   8. install a daily backup cron under /etc/cron.daily/orblood-backup
#   9. print the credentials it generated, plus a smoke test command
#
# Re-run safe — every step is idempotent. If something fails you can
# fix it and re-run; nothing destructive happens to the DB / uploads.
#
# Usage:
#   sudo bash install.sh                                  # interactive: prompts for domain + email
#   sudo DOMAIN=orblood.ir EMAIL=you@example.com bash install.sh
#   sudo DOMAIN=orblood.ir EMAIL=you@example.com SKIP_TLS=1 bash install.sh
#       (use SKIP_TLS=1 if your domain isn't pointing at this VPS yet —
#        you can re-run with TLS later)

set -euo pipefail

# ------ pretty logging ------
say()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m!! %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = "0" ] || fail "Run me as root: sudo bash install.sh"
. /etc/os-release 2>/dev/null || true
case "${ID:-}" in ubuntu|debian) ;; *) warn "Untested on $ID — proceeding anyway." ;; esac

# ------ config: prompts + env vars ------
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
REPO_URL="${REPO_URL:-https://github.com/DiyakoMk/meeting.git}"
REPO_BRANCH="${REPO_BRANCH:-orblood2}"
INSTALL_DIR="${INSTALL_DIR:-/opt/orblood}"
APP_USER="${APP_USER:-orblood}"
SKIP_TLS="${SKIP_TLS:-0}"

if [ -z "$DOMAIN" ]; then
  read -rp "Domain (e.g. orblood.ir): " DOMAIN
fi
[ -n "$DOMAIN" ] || fail "DOMAIN required."

if [ "$SKIP_TLS" != "1" ] && [ -z "$EMAIL" ]; then
  read -rp "Email for Let's Encrypt notifications: " EMAIL
fi

# ------ secrets file (cached so re-runs reuse the same values) ------
SECRETS_DIR=/etc/orblood
SECRETS_FILE="$SECRETS_DIR/secrets.env"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

if [ -f "$SECRETS_FILE" ]; then
  say "Re-using secrets from $SECRETS_FILE"
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
else
  say "Generating fresh secrets"
  DB_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  TURN_USERNAME="orblood"
  TURN_PASSWORD="$(openssl rand -hex 16)"
  TURN_STATIC_SECRET="$(openssl rand -hex 32)"
  cat > "$SECRETS_FILE" <<EOF
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
TURN_USERNAME=$TURN_USERNAME
TURN_PASSWORD=$TURN_PASSWORD
TURN_STATIC_SECRET=$TURN_STATIC_SECRET
EOF
  chmod 600 "$SECRETS_FILE"
fi

# ------ 1. apt packages ------
say "Installing apt packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Node 20 from NodeSource. Skip if a usable Node is already present —
# many Iranian datacenter VPSes can't reach deb.nodesource.com behind
# Cloudflare, in which case we expect the operator to have installed
# Node manually (build-from-source / scp upload) before running this.
if ! command -v node >/dev/null || ! node --version | grep -qE '^v(18|20|22|24)'; then
  apt-get install -y -qq curl ca-certificates gnupg
  if curl -fsSL --max-time 30 https://deb.nodesource.com/setup_20.x -o /tmp/nodesource.sh; then
    bash /tmp/nodesource.sh >/dev/null
    apt-get install -y -qq nodejs
  else
    fail "Could not download nodesource setup script. Install Node 20 manually first (e.g. build from source via 'git clone https://github.com/nodejs/node && cd node && ./configure && make -j\$(nproc) && make install'), then re-run this script."
  fi
fi

apt-get install -y -qq \
  git \
  mariadb-server mariadb-client \
  nginx certbot python3-certbot-nginx \
  coturn \
  ufw openssl jq \
  unattended-upgrades apt-listchanges

# Enable unattended security upgrades. The default policy on Ubuntu only
# pulls "${distro_id}:${distro_codename}-security" sources, which is
# exactly what we want — kernel + openssl + libc patches without surprise
# feature bumps.
say "Enabling unattended-upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades.service 2>/dev/null || true

# ------ 2. user + dirs ------
if ! id "$APP_USER" >/dev/null 2>&1; then
  say "Creating system user $APP_USER"
  useradd --system --create-home --shell /bin/bash "$APP_USER"
fi

# ------ 3. clone / update repo ------
say "Fetching application source ($REPO_URL @ $REPO_BRANCH)"
if [ ! -d "$INSTALL_DIR/.git" ]; then
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
else
  git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH"
  git -C "$INSTALL_DIR" checkout "$REPO_BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$REPO_BRANCH"
fi
mkdir -p "$INSTALL_DIR/server/uploads"
chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"

# ------ 4. MariaDB tuning + db/user ------
say "Tuning MariaDB"
TUNING_FILE=/etc/mysql/mariadb.conf.d/60-orblood.cnf
cat > "$TUNING_FILE" <<EOF
[mysqld]
innodb_buffer_pool_size = 1G
max_connections         = 100
character-set-server    = utf8mb4
collation-server        = utf8mb4_unicode_ci
EOF
systemctl enable --now mariadb
systemctl restart mariadb

say "Creating database + user"
mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS orblood CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'orblood'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER 'orblood'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL ON orblood.* TO 'orblood'@'localhost';
FLUSH PRIVILEGES;
SQL

# ------ 5. .env ------
say "Writing /opt/orblood/server/.env"
PUBLIC_ORIGIN="https://$DOMAIN"
[ "$SKIP_TLS" = "1" ] && PUBLIC_ORIGIN="http://$DOMAIN"
cat > "$INSTALL_DIR/server/.env" <<EOF
# Auto-generated by install.sh — re-running install.sh will preserve secrets.
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=orblood
DB_PASSWORD=$DB_PASSWORD
DB_NAME=orblood

JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

PORT=4000
PUBLIC_ORIGIN=$PUBLIC_ORIGIN
UPLOAD_DIR=./uploads
PUBLIC_UPLOADS_BASE=/uploads

EXPRESSTURN_USERNAME=$TURN_USERNAME
EXPRESSTURN_PASSWORD=$TURN_PASSWORD
EXPRESSTURN_URLS=turns:$DOMAIN:5349?transport=tcp,turn:$DOMAIN:3478?transport=udp,turn:$DOMAIN:3478?transport=tcp
EOF
chown "$APP_USER:$APP_USER" "$INSTALL_DIR/server/.env"
chmod 600 "$INSTALL_DIR/server/.env"

# ------ 6. npm ci + init-db ------
say "Installing node dependencies"
sudo -u "$APP_USER" bash -lc "cd $INSTALL_DIR/server && \
  if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; \
  else npm install --omit=dev --no-audit --no-fund; fi"

say "Applying database schema (idempotent)"
sudo -u "$APP_USER" bash -lc "cd $INSTALL_DIR/server && npm run init-db"

# ------ 7. systemd unit ------
say "Installing systemd unit"
cat > /etc/systemd/system/orblood.service <<EOF
[Unit]
Description=Orblood backend
After=network.target mariadb.service
Requires=mariadb.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$INSTALL_DIR/server
EnvironmentFile=$INSTALL_DIR/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR/server/uploads
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable orblood
systemctl restart orblood

# ------ 8. Coturn ------
say "Configuring Coturn"
# Detect the public IP. We try several services because ipify.org is on
# Cloudflare and frequently unreachable from Iranian datacenters. As a
# last resort fall back to the primary outbound interface address,
# which is correct for most non-CGNAT VPS providers.
EXTERNAL_IP="$(curl -fsSL --max-time 5 https://api.ipify.org 2>/dev/null \
  || curl -fsSL --max-time 5 https://ifconfig.me 2>/dev/null \
  || curl -fsSL --max-time 5 https://checkip.amazonaws.com 2>/dev/null \
  || ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' \
  || true)"
EXTERNAL_IP="$(echo "$EXTERNAL_IP" | tr -d '[:space:]')"
[ -n "$EXTERNAL_IP" ] && say "Detected public IP: $EXTERNAL_IP"
[ -z "$EXTERNAL_IP" ] && warn "Could not detect public IP — coturn will work behind 1:1 NAT but TURN relay may fail under CGNAT. Set EXTERNAL_IP manually if needed."
cat > /etc/turnserver.conf <<EOF
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
${EXTERNAL_IP:+external-ip=$EXTERNAL_IP}
realm=$DOMAIN
fingerprint
lt-cred-mech
user=$TURN_USERNAME:$TURN_PASSWORD
static-auth-secret=$TURN_STATIC_SECRET
no-loopback-peers
no-multicast-peers
total-quota=100
stale-nonce=600
syslog
no-cli
EOF
# Enable the daemon (the package ships it disabled by default).
sed -i 's/^#TURNSERVER_ENABLED=1$/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn 2>/dev/null \
  || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
systemctl enable --now coturn
systemctl restart coturn || warn "Coturn restart failed — check /var/log/syslog. TLS may need the cert from step 9."

# ------ 9. nginx vhost ------
say "Configuring nginx vhost for $DOMAIN"
cat > /etc/nginx/sites-available/orblood <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $INSTALL_DIR/public;
    index index.html;

    client_max_body_size 8m;

    # Disable caching for HTML/JS/CSS to ensure users get fresh builds
    location ~* \.(html|js|css)$ {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        add_header Pragma "no-cache";
        add_header Expires "0";
        try_files \$uri \$uri/ /index.html;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    location /ws {
        proxy_pass         http://127.0.0.1:4000/ws;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_read_timeout 1d;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000/uploads/;
        proxy_set_header Host \$host;
        expires 7d;
    }
}
EOF
ln -sf /etc/nginx/sites-available/orblood /etc/nginx/sites-enabled/orblood
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# ------ 10. TLS via certbot ------
if [ "$SKIP_TLS" != "1" ]; then
  say "Issuing TLS certificate via certbot"
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
       ${EMAIL:+--email "$EMAIL"} ${EMAIL:--register-unsafely-without-email}; then
    say "TLS issued. Reloading Coturn so it can use the new cert."
    # Make Coturn pick up the cert. We simply append cert= lines now that
    # /etc/letsencrypt/live/$DOMAIN/ exists.
    if ! grep -q '^cert=' /etc/turnserver.conf; then
      cat >> /etc/turnserver.conf <<EOF

cert=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
pkey=/etc/letsencrypt/live/$DOMAIN/privkey.pem
EOF
    fi
    systemctl restart coturn || warn "Coturn restart failed; check journalctl -u coturn"
  else
    warn "certbot failed — make sure DOMAIN points at this VPS (A record), then re-run."
    warn "If you're inside Iran and HTTP-01 timed out, try the DNS-01 fallback (see DEPLOY.md)."
  fi
else
  warn "SKIP_TLS=1 set — leaving the site on plain HTTP. Re-run without it once DNS is ready."
fi

# ------ 11. firewall ------
say "Configuring UFW"
# Allow the SSH port we're connected on PLUS the default 22 so the
# operator doesn't get locked out if their provider uses a non-standard
# port (parsvds uses 9011, for example). We detect the active SSH port
# from the current connection and add it to the allow list.
CURRENT_SSH_PORT="$(ss -Htnp 'sport = :22 or sport = :9011' 2>/dev/null | head -1 | awk '{print $4}' | sed 's/.*://' || true)"
[ -z "$CURRENT_SSH_PORT" ] && CURRENT_SSH_PORT="$(awk '/^Port / {print $2; exit}' /etc/ssh/sshd_config 2>/dev/null)"
[ -z "$CURRENT_SSH_PORT" ] && CURRENT_SSH_PORT=22
say "Allowing SSH on port $CURRENT_SSH_PORT (auto-detected)"
ufw allow "$CURRENT_SSH_PORT/tcp" >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 3478/udp >/dev/null
ufw allow 3478/tcp >/dev/null
ufw allow 5349/tcp >/dev/null
ufw allow 5349/udp >/dev/null
# TURN relay range. Coturn defaults to 49152-65535 for media relay.
ufw allow 49152:65535/udp >/dev/null
yes | ufw enable >/dev/null 2>&1 || true

# ------ 12. backup cron ------
say "Installing daily backup cron"
cat > /etc/cron.daily/orblood-backup <<EOF
#!/bin/bash
set -e
DEST=/var/backups/orblood
DATE=\$(date +%F)
mkdir -p "\$DEST"
mysqldump --single-transaction -u orblood -p'$DB_PASSWORD' orblood | gzip > "\$DEST/orblood-\$DATE.sql.gz"
tar -czf "\$DEST/uploads-\$DATE.tar.gz" -C $INSTALL_DIR/server uploads
find "\$DEST" -name '*.gz' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/orblood-backup

# ------ 13. summary ------
say "All done."
echo
printf '\033[1;32mOrblood is running at:\033[0m  %s\n' "$PUBLIC_ORIGIN"
echo
echo  "  systemctl status orblood     # daemon state"
echo  "  journalctl -u orblood -f     # live logs"
echo  "  systemctl restart orblood    # restart"
echo
printf '\033[1;33mCredentials (also saved at %s):\033[0m\n' "$SECRETS_FILE"
echo  "  DB user           orblood"
echo  "  DB password       $DB_PASSWORD"
echo  "  TURN username     $TURN_USERNAME"
echo  "  TURN password     $TURN_PASSWORD"
echo  "  JWT secret length ${#JWT_SECRET} chars"
echo
echo  "Smoke test:"
echo  "  curl -s $PUBLIC_ORIGIN/api/healthz"
echo
if [ "$SKIP_TLS" = "1" ]; then
  echo  "Re-run me without SKIP_TLS=1 once your DNS A record is pointing at this VPS:"
  echo  "  sudo DOMAIN=$DOMAIN EMAIL=$EMAIL bash $0"
fi

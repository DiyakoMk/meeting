# Orblood — Production deploy

End-to-end recipe for a single Ubuntu 22.04+ VPS hosting Node + MariaDB +
nginx + Coturn. Tested for ~30 concurrent users.

## 1. Provision

- Ubuntu 22.04 LTS (or 24.04). Minimum 2 GB RAM, 20 GB disk.
- Open ports 22, 80, 443, 3478 (TURN), 5349 (TURN over TLS), 49152-65535/udp
  (TURN relay range — narrow if you want).
- Point your DNS A record at the VPS IP, e.g. `orblood.example.com → 1.2.3.4`.

```bash
adduser orblood
usermod -aG sudo orblood
su - orblood
```

## 2. Install runtimes

```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# MariaDB
sudo apt-get install -y mariadb-server
sudo systemctl enable --now mariadb
sudo mysql_secure_installation

# nginx + certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Coturn (TURN server for voice)
sudo apt-get install -y coturn
```

## 3. Database

```bash
sudo mysql <<'SQL'
CREATE DATABASE orblood CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'orblood'@'localhost' IDENTIFIED BY 'STRONG_DB_PASSWORD_HERE';
GRANT ALL ON orblood.* TO 'orblood'@'localhost';
FLUSH PRIVILEGES;
SQL
```

Tune InnoDB so the buffer pool isn't trapped at 128 MB. Edit
`/etc/mysql/mariadb.conf.d/50-server.cnf`:

```ini
[mysqld]
innodb_buffer_pool_size = 1G
max_connections         = 100
character-set-server    = utf8mb4
collation-server        = utf8mb4_unicode_ci
```

```bash
sudo systemctl restart mariadb
```

## 4. App

```bash
cd /opt
sudo git clone https://github.com/DiyakoMk/meeting.git orblood
sudo chown -R orblood:orblood orblood
cd orblood/server

# Install prod dependencies only
npm install --omit=dev

# Real environment
cp .env.example .env
# generate a real JWT secret (don't reuse the example)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# edit .env with the secret + your DB password + EXPRESSTURN_* (or your own
# Coturn credentials, see step 6) + PUBLIC_ORIGIN=https://orblood.example.com
nano .env

npm run init-db
```

## 5. systemd unit

`/etc/systemd/system/orblood.service`:

```ini
[Unit]
Description=Orblood backend
After=network.target mariadb.service
Requires=mariadb.service

[Service]
Type=simple
User=orblood
WorkingDirectory=/opt/orblood/server
EnvironmentFile=/opt/orblood/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

# Mild hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/orblood/server/uploads
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now orblood
sudo journalctl -u orblood -f      # live logs
```

## 6. Coturn (TURN for voice)

Edit `/etc/turnserver.conf`:

```conf
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0

realm=orblood.example.com
fingerprint
lt-cred-mech

# Replace both with strong values
user=orblood:STRONG_TURN_PASSWORD_HERE
static-auth-secret=ANOTHER_STRONG_SECRET_HERE

# Reuse your nginx Let's Encrypt cert for TLS
cert=/etc/letsencrypt/live/orblood.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/orblood.example.com/privkey.pem

# Don't relay onto loopback / link-local
no-loopback-peers
no-multicast-peers
```

```bash
sudo systemctl enable --now coturn
```

Update `/opt/orblood/server/.env`:

```
EXPRESSTURN_USERNAME=orblood
EXPRESSTURN_PASSWORD=STRONG_TURN_PASSWORD_HERE
EXPRESSTURN_URLS=turn:orblood.example.com:3478,turns:orblood.example.com:5349
```

(The variable names are historical — they're really "TURN credentials".)

```bash
sudo systemctl restart orblood
```

## 7. nginx + TLS

Copy the repo's `nginx.conf` into `/etc/nginx/sites-available/orblood`:

```bash
sudo cp /opt/orblood/nginx.conf /etc/nginx/sites-available/orblood
sudo nano /etc/nginx/sites-available/orblood
# replace `server_name _;` with `server_name orblood.example.com;`
sudo ln -s /etc/nginx/sites-available/orblood /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# TLS — auto-redirects 80 → 443 and configures the cert.
sudo certbot --nginx -d orblood.example.com
```

## 8. Smoke test

```bash
curl https://orblood.example.com/api/healthz
# {"ok":true,"db":"up"}
```

Open `https://orblood.example.com` in a browser. Sign up, create a server,
join a voice channel from a second device on a different network. If voice
fails to connect on the second device, check that 3478/UDP and the relay
port range reach the VPS (`sudo ufw status` / your firewall provider).

## 9. Backup

Cron job in `/etc/cron.daily/orblood-backup`:

```bash
#!/bin/bash
set -e
DATE=$(date +%F)
DEST=/var/backups/orblood
mkdir -p "$DEST"
mysqldump -u orblood -p"STRONG_DB_PASSWORD_HERE" orblood | gzip > "$DEST/orblood-$DATE.sql.gz"
tar -czf "$DEST/uploads-$DATE.tar.gz" -C /opt/orblood/server uploads
# Keep only the last 14 days
find "$DEST" -name '*.gz' -mtime +14 -delete
```

```bash
sudo chmod +x /etc/cron.daily/orblood-backup
```

For real durability copy `$DEST` off-site (BackBlaze B2, S3-compatible
storage, ~1 USD/month for 200 GB) — cron above only protects against
typos, not VPS reprovisioning.

## 10. Updates

```bash
cd /opt/orblood
git pull
cd server
npm install --omit=dev
npm run init-db    # idempotent — applies any new ALTER TABLE migrations
sudo systemctl restart orblood
```

The frontend in `/public` is plain static files; nginx picks up the new
`index.html` / CSS / JS without a reload (browsers will redownload on
their next request).

---

## Operations cheat-sheet

| Task | Command |
|---|---|
| Live backend logs | `sudo journalctl -u orblood -f` |
| Restart backend | `sudo systemctl restart orblood` |
| Restart Coturn | `sudo systemctl restart coturn` |
| Renew TLS (auto) | already handled by certbot.timer |
| DB shell | `mysql -u orblood -p orblood` |
| Disk usage | `du -sh /opt/orblood/server/uploads /var/lib/mysql` |
| Active connections | `ss -tn 'sport = :4000' \| wc -l` |

## Security checklist

- [ ] `JWT_SECRET` is 64+ random bytes, not the example value
- [ ] DB user `orblood` has the **single-database** grant only (no GLOBAL)
- [ ] Firewall allows only 22, 80, 443, 3478, 5349 + the TURN relay range
- [ ] SSH password auth disabled (`PasswordAuthentication no`)
- [ ] TLS cert has auto-renewal (`systemctl status certbot.timer`)
- [ ] `PUBLIC_ORIGIN` matches your real domain (CORS will reject otherwise)
- [ ] `client_max_body_size 8m` in nginx matches the backend's express.json limit
- [ ] Off-site backup is running

## Capacity expectations (this VPS profile)

| Resource | At ~30 users | Headroom on a 4 GB / 50 GB VPS |
|---|---|---|
| RAM | ~1.2 GB (Node + DB + nginx) | ~70 % free |
| Disk | ~10 GB (DB + uploads) | ~80 % free |
| Egress | ~30-40 GB / month | well under most VPS caps |
| Voice | P2P, never touches the VPS | TURN-relayed: ~5-15 GB / month for 20 % NAT-restricted users |

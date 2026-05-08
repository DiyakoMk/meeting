# Orblood — Production deploy

End-to-end recipe for a single Ubuntu 22.04+ VPS hosting Node + MariaDB +
nginx + Coturn. Tested for ~30 concurrent users.

## 1. Provision

- Ubuntu 22.04 LTS (or 24.04). Minimum 2 GB RAM, 20 GB disk.
- Open ports 22, 80, 443, 3478 (TURN), 5349 (TURN over TLS), 49152-65535/udp
  (TURN relay range — narrow if you want).
- Point your DNS A record at the VPS IP, e.g. `orblood.ir → 1.2.3.4`.

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
# Coturn credentials, see step 6) + PUBLIC_ORIGIN=https://orblood.ir
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

realm=orblood.ir
fingerprint
lt-cred-mech

# Replace both with strong values
user=orblood:STRONG_TURN_PASSWORD_HERE
static-auth-secret=ANOTHER_STRONG_SECRET_HERE

# Reuse your nginx Let's Encrypt cert for TLS
cert=/etc/letsencrypt/live/orblood.ir/fullchain.pem
pkey=/etc/letsencrypt/live/orblood.ir/privkey.pem

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
EXPRESSTURN_URLS=turn:orblood.ir:3478,turns:orblood.ir:5349
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
# replace `server_name _;` with `server_name orblood.ir;`
sudo ln -s /etc/nginx/sites-available/orblood /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# TLS — auto-redirects 80 → 443 and configures the cert.
sudo certbot --nginx -d orblood.ir
```

## 8. Smoke test

```bash
curl https://orblood.ir/api/healthz
# {"ok":true,"db":"up"}
```

Open `https://orblood.ir` in a browser. Sign up, create a server,
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
- [ ] Unattended security upgrades are enabled (see below)

## Patching the host

Orblood runs on plain Ubuntu without a control panel — no cPanel, no
Plesk, nothing the data centre might be advertising CVEs against. The
attack surface is whatever Ubuntu ships plus the four daemons we install
(`nginx`, `mariadb`, `nodejs`, `coturn`). Keep them current with
unattended-upgrades:

```bash
sudo apt-get install -y unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades   # answer "Yes"
```

Verify it's actually applying things:

```bash
sudo unattended-upgrade --dry-run --debug | head -30
sudo cat /var/log/unattended-upgrades/unattended-upgrades.log
```

For Node.js itself, the NodeSource repo we added in step 2 keeps
`nodejs` up to date through `apt-get upgrade`. The Orblood code itself
is updated by the step-10 git pull.

If your provider sends you a "patch X immediately" advisory:

1. **Read whether it actually applies to us.** Provider advisories
   often target cPanel / WHM / Plesk / Webmin — none of which we
   install. cPanel CVEs are irrelevant to a vanilla Ubuntu+nginx stack.
2. **For real upstream CVEs (OpenSSL, kernel, nginx)**: run
   `sudo apt-get update && sudo apt-get upgrade -y` and reboot if the
   advisory mentions a kernel or libc change.
3. **For app-level fixes** (Node, Mongo, etc.): just do step 10 of
   this guide.

## Capacity expectations (this VPS profile)

| Resource | At ~30 users | Headroom on a 4 GB / 50 GB VPS |
|---|---|---|
| RAM | ~1.2 GB (Node + DB + nginx) | ~70 % free |
| Disk | ~10 GB (DB + uploads) | ~80 % free |
| Egress | ~30-40 GB / month | well under most VPS caps |
| Voice | P2P, never touches the VPS | TURN-relayed: ~5-15 GB / month for 20 % NAT-restricted users |

---

## Notes for `.ir` deployment

A few things that bite people running `.ir` domains, especially when the
VPS itself is in Iran:

### Let's Encrypt + IRNIC

Let's Encrypt's HTTP-01 challenge needs an outbound connection from
Let's Encrypt's verification servers to your `:80`. From most Iranian
data centres this works fine. If `certbot --nginx` fails with a
"connection timed out" / "fetching … timed out" error, switch to the
DNS-01 challenge using your registrar's TXT record:

```bash
sudo certbot --nginx -d orblood.ir \
  --preferred-challenges dns \
  --manual --agree-tos
```

certbot will print a `_acme-challenge.orblood.ir` TXT record value;
add it in your IRNIC / ISP DNS panel, wait 60 s, hit Enter. Renewal
isn't automatic for manual challenges, so set a calendar reminder for
day 60. Or use `certbot-dns-cloudflare` if you eventually move DNS to
Cloudflare (allowed for `.ir` via NS delegation).

### TLD-related quirks

- IRNIC sometimes resolves `www.orblood.ir` and the apex differently.
  Decide whether you want `www` to redirect to apex (recommended) or
  vice versa, and add an extra `server` block in nginx for the unused
  one that 301-redirects to the canonical name.

- Some hosting providers in IR block outbound port 25; that's only an
  issue if you later add transactional email. Voice / API / WebSocket
  don't touch port 25.

### Choose a TURN port that isn't blocked

Inside Iran, certain ISPs throttle or selectively drop UDP on
non-standard ports. The Coturn config above uses 3478/UDP (standard);
if you see voice working over TLS on 5349 but failing peer-to-peer with
3478, that's a network-side issue not a config bug. Workaround:

```conf
# In /etc/turnserver.conf — also listen on common HTTPS port for max
# compatibility with restrictive networks.
alt-listening-port=443
alt-tls-listening-port=443
```

Then add `turn:orblood.ir:443?transport=udp` and
`turns:orblood.ir:443?transport=tcp` to `EXPRESSTURN_URLS`.
**Caveat:** this collides with nginx if nginx is also on 443 — use
this only on a *separate* IP for TURN, or accept that voice over 443
won't be available alongside the web app on the same port.

### Where to host

A few patterns that work for Iranian users:

- **VPS inside Iran (cheap, low latency for IR users):** TURN bandwidth
  stays domestic, but Let's Encrypt issuance can be flaky. Use the DNS-01
  fallback above.
- **VPS abroad with a Cloudflare proxy:** Cloudflare proxies TLS for
  free, hides your origin IP, and accepts `.ir` domains. **However**:
  WebSocket works only on plans where the connection survives idle
  pings (free tier disconnects after 100 s idle — Orblood already
  reconnects, so this is OK). Voice WebRTC bypasses Cloudflare
  entirely (peer-to-peer) so neither side cares.
- **Hybrid (recommended):** App on a foreign VPS, DNS via Cloudflare,
  TURN/Coturn on a small IR-based VPS that's reachable on plain UDP.
  IR users get domestic-quality voice; foreign users still get the
  full app.

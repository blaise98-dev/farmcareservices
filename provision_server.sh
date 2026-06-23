#!/usr/bin/env bash
# Full server provisioning script for farmcareservices.com (159.198.46.65)
# Run as root on the new server after first login via Namecheap panel/VNC.
# Usage: bash provision_server.sh
set -euo pipefail

GITHUB_REPO="https://github.com/blaise98-dev/farmcareservices.git"
APP_USER="farmcareservices_user"
APP_DIR="/home/${APP_USER}/MooMe"
WEB_ROOT="/var/www/farmcareservices.com"

MOOME_TUNNEL_PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMSBlrVmsaMs0zdtTESvQT+Y2tmzWMcWLXKwUzZGV5gh moome-tunnel"
GITHUB_ACTIONS_PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFPoFzjypOURfUta+48zDFzU6ZL34J1gwMHgMAy+JJgF github-actions@codebridge-academy"

DB_NAME="moome"
DB_USER="moome_user"
DB_PASS="password@123"
SECRET_KEY="22c111e8922e521bd4c0a4f73c0db1c9f980f4044285052fa4da97c5de361a93"

echo "=============================="
echo " MooMe Server Provisioning"
echo "=============================="

# ── 1. Add SSH keys to root ──────────────────────────────────────────────────
echo "[1/12] Configuring root SSH authorized keys..."
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

grep -qF "$MOOME_TUNNEL_PUBKEY" /root/.ssh/authorized_keys \
  || echo "$MOOME_TUNNEL_PUBKEY" >> /root/.ssh/authorized_keys
grep -qF "$GITHUB_ACTIONS_PUBKEY" /root/.ssh/authorized_keys \
  || echo "$GITHUB_ACTIONS_PUBKEY" >> /root/.ssh/authorized_keys
echo "  Done."

# ── 2. System update + packages ───────────────────────────────────────────────
echo "[2/12] Updating system and installing packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq git curl nginx ufw python3 python3-pip python3-venv mysql-server certbot python3-certbot-nginx

# ── 3. Node.js 22 ────────────────────────────────────────────────────────────
echo "[3/12] Installing Node.js 22..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "  Node $(node -v) / npm $(npm -v)"

# ── 4. Firewall ───────────────────────────────────────────────────────────────
echo "[4/12] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "  UFW enabled."

# ── 5. Create app user ────────────────────────────────────────────────────────
echo "[5/12] Creating user ${APP_USER}..."
if ! id "${APP_USER}" &>/dev/null; then
  adduser --disabled-password --gecos "" "${APP_USER}"
fi
usermod -aG sudo "${APP_USER}"

# Passwordless sudo for specific commands (deploy workflow)
SUDOERS_FILE="/etc/sudoers.d/${APP_USER}"
cat > "${SUDOERS_FILE}" << EOF
${APP_USER} ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart fastapi, /usr/bin/systemctl reload nginx, /bin/rm, /bin/cp, /usr/bin/systemctl daemon-reload
EOF
chmod 440 "${SUDOERS_FILE}"
echo "  Sudoers entry created."

# SSH key for app user (so GitHub Actions can deploy as farmcareservices_user)
APP_SSH_DIR="/home/${APP_USER}/.ssh"
mkdir -p "${APP_SSH_DIR}"
chmod 700 "${APP_SSH_DIR}"
touch "${APP_SSH_DIR}/authorized_keys"
chmod 600 "${APP_SSH_DIR}/authorized_keys"
chown -R "${APP_USER}:${APP_USER}" "${APP_SSH_DIR}"

grep -qF "$GITHUB_ACTIONS_PUBKEY" "${APP_SSH_DIR}/authorized_keys" \
  || echo "$GITHUB_ACTIONS_PUBKEY" >> "${APP_SSH_DIR}/authorized_keys"
grep -qF "$MOOME_TUNNEL_PUBKEY" "${APP_SSH_DIR}/authorized_keys" \
  || echo "$MOOME_TUNNEL_PUBKEY" >> "${APP_SSH_DIR}/authorized_keys"
echo "  SSH keys added for ${APP_USER}."

# ── 6. MySQL setup ────────────────────────────────────────────────────────────
echo "[6/12] Setting up MySQL..."
systemctl enable --now mysql

mysql -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"
echo "  Database '${DB_NAME}' and user '${DB_USER}' ready."

# ── 7. Clone repo ────────────────────────────────────────────────────────────
echo "[7/12] Cloning repository..."
if [[ ! -d "${APP_DIR}/.git" ]]; then
  sudo -u "${APP_USER}" git clone "${GITHUB_REPO}" "${APP_DIR}"
else
  sudo -u "${APP_USER}" git -C "${APP_DIR}" pull origin main
fi
echo "  Repo at ${APP_DIR}."

# ── 8. Backend setup ─────────────────────────────────────────────────────────
echo "[8/12] Setting up backend..."
BACKEND_DIR="${APP_DIR}/webapp/backend"

sudo -u "${APP_USER}" python3 -m venv "${BACKEND_DIR}/venv"
sudo -u "${APP_USER}" "${BACKEND_DIR}/venv/bin/pip" install --quiet -r "${BACKEND_DIR}/requirements.txt"

# Write backend .env
sudo -u "${APP_USER}" tee "${BACKEND_DIR}/.env" > /dev/null << EOF
DB_HOST=localhost
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}
SECRET_KEY=${SECRET_KEY}
CORS_ORIGINS=https://farmcareservices.com,https://www.farmcareservices.com,http://localhost:5173
FRONTEND_URL=https://farmcareservices.com
RESET_TOKEN_EXPIRE_MINUTES=60
EOF
echo "  Backend venv and .env ready."

# ── 9. systemd service ────────────────────────────────────────────────────────
echo "[9/12] Creating fastapi systemd service..."
cat > /etc/systemd/system/fastapi.service << EOF
[Unit]
Description=MooMe FastAPI App
After=network.target mysql.service

[Service]
User=${APP_USER}
WorkingDirectory=${BACKEND_DIR}
Environment="PATH=${BACKEND_DIR}/venv/bin"
ExecStart=${BACKEND_DIR}/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fastapi
systemctl start fastapi
echo "  FastAPI service started."

# ── 10. Frontend build ────────────────────────────────────────────────────────
echo "[10/12] Building frontend..."
FRONTEND_DIR="${APP_DIR}/webapp/frontend"

# Production .env — leave API URLs empty so Nginx proxies /api on same domain
sudo -u "${APP_USER}" tee "${FRONTEND_DIR}/.env" > /dev/null << EOF
VITE_API_URL=
VITE_WS_URL=
EOF

sudo -u "${APP_USER}" bash -c "cd ${FRONTEND_DIR} && npm ci --silent"
sudo -u "${APP_USER}" bash -c "cd ${FRONTEND_DIR} && npm run build"

mkdir -p "${WEB_ROOT}"
cp -r "${FRONTEND_DIR}/dist/"* "${WEB_ROOT}/"
chown -R www-data:www-data "${WEB_ROOT}"
echo "  Frontend built and deployed to ${WEB_ROOT}."

# ── 11. Nginx config ──────────────────────────────────────────────────────────
echo "[11/12] Configuring Nginx..."
cat > /etc/nginx/sites-available/farmcareservices.com << 'EOF'
server {
    listen 80;
    server_name farmcareservices.com www.farmcareservices.com;

    root /var/www/farmcareservices.com;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

ln -sf /etc/nginx/sites-available/farmcareservices.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx
echo "  Nginx configured."

# ── 12. SSL certificate ───────────────────────────────────────────────────────
echo "[12/12] Obtaining SSL certificate..."
echo "  (Skipping auto-cert — run manually after DNS propagates:)"
echo "  certbot --nginx -d farmcareservices.com -d www.farmcareservices.com"
echo ""

# ── Final status ──────────────────────────────────────────────────────────────
echo "=============================="
echo " Provisioning complete!"
echo "=============================="
echo ""
echo "Services:"
systemctl is-active --quiet fastapi && echo "  fastapi  : RUNNING" || echo "  fastapi  : FAILED"
systemctl is-active --quiet nginx   && echo "  nginx    : RUNNING" || echo "  nginx    : FAILED"
systemctl is-active --quiet mysql   && echo "  mysql    : RUNNING" || echo "  mysql    : FAILED"
echo ""
echo "Test locally on server:"
echo "  curl -s http://127.0.0.1:8000/docs | head -5"
echo ""
echo "Then run SSL:"
echo "  certbot --nginx -d farmcareservices.com -d www.farmcareservices.com"
echo ""
echo "GitHub Secrets to set (Settings → Secrets → Actions):"
echo "  VPS_HOST = 159.198.46.65"
echo "  VPS_USER = farmcareservices_user"
echo "  VPS_SSH_KEY = <paste private key from ~/.ssh/id_rsa or the github-actions key>"

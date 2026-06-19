# 🚀 FULL VPS + DOMAIN DEPLOYMENT PLAYBOOK (NAMECHEAP + UBUNTU + NGINX + FASTAPI + REACT)

This document contains the complete production setup lifecycle from:

- Domain purchase
- VPS setup
- DNS configuration
- Backend + frontend deployment
- Database setup
- CI/CD (GitHub Actions → VPS)
- Production maintenance

---

# 🌐 1. NAMECHEAP INITIAL SETUP

## 1.1 Buy Domain

From Namecheap:

- Domain purchased (e.g. `farmcareservices.com`)

---

## 1.2 Buy VPS

From Namecheap VPS dashboard:

- Ubuntu 24.04
- KVM VPS
- Public IP assigned (e.g. `159.198.46.65`)

---

## 1.3 VPS Access Credentials

Provided by Namecheap:

- IP Address
- Root password
- VNC access (fallback)

---

## 1.4 First VPS Login

```bash
ssh root@159.198.46.65
```

OR via VNC console if SSH fails.

---

# 🌍 2. DOMAIN → VPS DNS CONFIGURATION (NAMECHEAP)

## 2.1 DNS Setup (Namecheap Panel)

Go to:

**Domain → Advanced DNS**

Set **A Records**:

| Host | Type | Value |
|------|------|-------|
| `@` | A | `159.198.46.65` |
| `www` | A | `159.198.46.65` |

---

## 2.2 Subdomain Setup (optional)

| Host | Type | Value |
|------|------|-------|
| `api` | A | `159.198.46.65` |
| `admin` | A | `159.198.46.65` |

---

## 2.3 DNS Verification

```bash
ping farmcareservices.com
```

Expected:

```
159.198.46.65
```

> DNS propagation can take 5–30 minutes (sometimes up to 24 hours).

---

# 🖥 3. VPS INITIAL CONFIGURATION

## 3.1 Update system

```bash
apt update && apt upgrade -y
```

---

## 3.2 Install core tools

```bash
apt install git curl nginx ufw python3 python3-pip python3-venv -y
```

---

## 3.3 Create deployment user

```bash
adduser farmcareservices_user
usermod -aG sudo farmcareservices_user
su - farmcareservices_user
```

---

## 3.4 Firewall setup

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

---

## 3.5 Install Node.js (frontend build)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs -y
node -v
npm -v
```

---

# 🗄 4. MYSQL DATABASE SETUP

## 4.1 Install MySQL

```bash
sudo apt install mysql-server -y
```

---

## 4.2 Secure installation

```bash
sudo mysql_secure_installation
```

---

## 4.3 Create database + user

```bash
sudo mysql
```

```sql
CREATE DATABASE MooMeSystem;

CREATE USER 'app_user'@'localhost' IDENTIFIED BY 'StrongPassword';

GRANT ALL PRIVILEGES ON MooMeSystem.* TO 'app_user'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

---

## 4.4 Import existing schema/data (optional)

If you have a local dump file:

```bash
mysql -u app_user -p MooMeSystem < moome_dump.sql
```

---

## 4.5 Backend `.env` (database connection)

Create `/home/farmcareservices_user/MooMe/webapp/backend/.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=app_user
DB_PASSWORD=StrongPassword
DB_NAME=MooMeSystem
SECRET_KEY=generate-a-long-random-secret-key
CORS_ORIGINS=https://farmcareservices.com,https://www.farmcareservices.com
FRONTEND_URL=https://farmcareservices.com
```

> Never commit `.env` to git.

---

# 🧭 5. SERVER OVERVIEW

**Stack:**

- Backend: FastAPI
- Frontend: React (Vite)
- Database: MySQL (`MooMeSystem`)
- Reverse Proxy: Nginx
- OS: Ubuntu 24+

---

# 📁 6. IMPORTANT DIRECTORIES (ALWAYS USED)

## Application Code

```bash
/home/farmcareservices_user/MooMe/webapp/backend
/home/farmcareservices_user/MooMe/webapp/frontend
```

## Frontend build output

```bash
/var/www/farmcareservices.com/
```

## Nginx configs

```bash
/etc/nginx/sites-available/
/etc/nginx/sites-enabled/
```

## Systemd services

```bash
/etc/systemd/system/
```

## Logs

```bash
journalctl -u fastapi -f
/var/log/nginx/error.log
/var/log/nginx/access.log
```

---

# 📦 7. BACKEND DEPLOYMENT (FASTAPI)

## 7.1 Clone project

```bash
cd ~
git clone <your-repo-url> MooMe
cd MooMe/webapp/backend
```

---

## 7.2 Setup virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## 7.3 Test run

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

Visit: `http://127.0.0.1:8000/docs`

---

## 7.4 systemd service

```bash
sudo nano /etc/systemd/system/fastapi.service
```

```ini
[Unit]
Description=MooMe FastAPI App
After=network.target mysql.service

[Service]
User=farmcareservices_user
WorkingDirectory=/home/farmcareservices_user/MooMe/webapp/backend
Environment="PATH=/home/farmcareservices_user/MooMe/webapp/backend/venv/bin"
ExecStart=/home/farmcareservices_user/MooMe/webapp/backend/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable fastapi
sudo systemctl start fastapi
sudo systemctl status fastapi
```

---

# 🌐 8. FRONTEND DEPLOYMENT (REACT)

## 8.1 Build

```bash
cd /home/farmcareservices_user/MooMe/webapp/frontend
npm install
npm run build
```

For production API (if not using Nginx proxy only):

```bash
# webapp/frontend/.env.production
VITE_API_URL=
VITE_WS_URL=
```

Leave empty when Nginx proxies `/api` and `/ws` on the same domain.

---

## 8.2 Deploy static files

```bash
sudo mkdir -p /var/www/farmcareservices.com
sudo cp -r dist/* /var/www/farmcareservices.com/
sudo chown -R www-data:www-data /var/www/farmcareservices.com
```

---

# 🌍 9. NGINX SETUP (MULTI SITE SUPPORT)

## 9.1 Create site config

```bash
sudo nano /etc/nginx/sites-available/farmcareservices.com
```

---

## 9.2 Example config

```nginx
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
```

---

## 9.3 Enable site

```bash
sudo ln -s /etc/nginx/sites-available/farmcareservices.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

# 🌐 10. MULTI-DOMAIN / SUBDOMAIN HOSTING

## Example structure

| Domain | Purpose |
|--------|---------|
| farmcareservices.com | main app |
| api.farmcareservices.com | backend only |
| admin.farmcareservices.com | admin dashboard |

## Create separate Nginx file per domain

```bash
/etc/nginx/sites-available/api.farmcareservices.com
/etc/nginx/sites-available/admin.farmcareservices.com
```

## Subdomain example config

```nginx
server {
    listen 80;
    server_name api.farmcareservices.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Enable multiple sites

```bash
sudo ln -s /etc/nginx/sites-available/site1 /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/site2 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

# 🔐 11. SSL (HTTPS)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d farmcareservices.com -d www.farmcareservices.com
```

**Auto renewal test:**

```bash
sudo certbot renew --dry-run
```

---

# 🐛 12. DEBUGGING COMMANDS

## Backend

```bash
systemctl status fastapi
journalctl -u fastapi -f
```

## Nginx

```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

## Ports

```bash
ss -tulnp
```

## Database

```bash
sudo mysql -u app_user -p MooMeSystem -e "SHOW TABLES;"
```

---

# 🔄 13. UPDATE PROCESS (IMPORTANT)

## Backend update

```bash
cd /home/farmcareservices_user/MooMe/webapp/backend
git pull
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart fastapi
```

## Frontend update

```bash
cd /home/farmcareservices_user/MooMe/webapp/frontend
git pull
npm install
npm run build
sudo rm -rf /var/www/farmcareservices.com/*
sudo cp -r dist/* /var/www/farmcareservices.com/
sudo systemctl reload nginx
```

---

# 🚀 14. CI/CD SETUP (GitHub Actions → VPS Deployment)

## Overview

This section covers full CI/CD setup for:

- FastAPI backend (systemd + uvicorn)
- Frontend build (Vite/React → dist)
- Deployment via SSH (GitHub Actions → VPS)
- Nginx static hosting
- Secure automation (no password sudo)

---

## 14.1 LOCAL MACHINE SETUP (SSH KEY)

### Generate SSH key

```bash
ssh-keygen -t rsa -b 4096 -C "github-actions-vps"
```

You will get:

```bash
~/.ssh/id_rsa        # PRIVATE KEY (NEVER SHARE)
~/.ssh/id_rsa.pub    # PUBLIC KEY
```

### Copy PUBLIC key to VPS

```bash
ssh-copy-id farmcareservices_user@YOUR_VPS_IP
```

OR manual:

```bash
cat ~/.ssh/id_rsa.pub
```

Paste into:

```bash
~/.ssh/authorized_keys   # on server
```

### Test SSH access

```bash
ssh farmcareservices_user@YOUR_VPS_IP
```

---

## 14.2 VPS SETUP (USER + PERMISSIONS)

### Ensure sudo works without password (CRITICAL)

```bash
sudo visudo
```

Add:

```
farmcareservices_user ALL=(ALL) NOPASSWD:ALL
```

Verify:

```bash
sudo -n systemctl restart fastapi
```

Expected:

- No password prompt
- Exit code 0

### Verify systemctl access

```bash
sudo -n systemctl status fastapi
```

---

## 14.3 GITHUB REPOSITORY SECRETS

Go to:

**GitHub → Repository → Settings → Secrets and variables → Actions**

### Add secrets

| Name | Value |
|------|-------|
| `VPS_HOST` | YOUR_VPS_IP |
| `VPS_USER` | `farmcareservices_user` |
| `VPS_SSH_KEY` | PRIVATE SSH KEY |

### IMPORTANT: SSH private key format

Paste EXACTLY:

```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

**DO NOT:**

- add spaces
- remove new lines
- use public key

---

## 14.4 GITHUB ACTIONS WORKFLOW

File:

```bash
.github/workflows/deploy.yml
```

### Full CI/CD pipeline

```yaml
name: Deploy to VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}

          script: |
            set -e

            echo "🚀 Deployment started"

            # Pull latest code
            cd ~/farmcareservices/webapp
            git pull origin main

            # Backend update
            echo "Backend update"
            cd backend
            source venv/bin/activate
            pip install -r requirements.txt
            sudo -n systemctl restart fastapi

            # Frontend build
            echo "Frontend build"
            cd ../frontend
            npm ci || npm install
            npm run build

            # Deploy frontend to Nginx
            sudo -n rm -rf /var/www/farmcareservices_user/*
            sudo -n cp -r dist/* /var/www/farmcareservices_user/
            sudo -n systemctl reload nginx

            echo "✅ Deployment complete"
```

---

## 14.5 COMMON CI/CD FAILURES & FIXES

### sudo password error

```
sudo: a password is required
```

Fix:

```bash
sudo visudo
```

Add:

```
farmcareservices_user ALL=(ALL) NOPASSWD:ALL
```

### SSH key rejected

Check:

- private key used (NOT public)
- correct GitHub secret formatting

### git pull fails

```bash
git pull origin main
```

Fix:

```bash
git config pull.rebase false
```

OR:

```bash
git stash
git pull
```

### npm build fails

```bash
npm ci || npm install
npm run build
```

---

## 14.6 DEPLOYMENT FLOW (WHAT HAPPENS)

On every push to `main`:

1. GitHub Actions triggers
2. SSH into VPS
3. Pull latest code
4. Install backend dependencies
5. Restart FastAPI (systemd)
6. Build frontend
7. Copy `dist` → Nginx folder
8. Reload Nginx

---

## 14.7 SECURITY NOTES

**NEVER expose:**

- port 8000 externally
- FastAPI directly to internet

**Correct setup:**

- FastAPI → `localhost:8000`
- Nginx → public (80/443)

---

## 14.8 OPTIONAL DEBUG COMMANDS

### Check CI logs on VPS

```bash
journalctl -u fastapi -f
```

### Check nginx

```bash
sudo nginx -t
sudo systemctl status nginx
```

### Check port exposure

```bash
ss -tulnp | grep 8000
```

Expected:

```
127.0.0.1:8000
```

---

# 🔒 15. IMPORTANT SECURITY FIX (REMOVE PORT 8000 PUBLIC ACCESS)

## WHY

Port 8000 must **NOT** be exposed to the internet.  
Only Nginx should access it.

## Step 1 — Check open ports

```bash
ss -tulnp | grep 8000
```

If you see:

```
127.0.0.1:8000
```

✔ **GOOD** (safe)

If you see:

```
0.0.0.0:8000
```

❌ **BAD** (public exposure)

## Step 2 — Fix FastAPI binding

Edit systemd:

```bash
sudo nano /etc/systemd/system/fastapi.service
```

Ensure:

```
--host 127.0.0.1
```

**NOT:**

```
--host 0.0.0.0
```

## Step 3 — Restart service

```bash
sudo systemctl daemon-reload
sudo systemctl restart fastapi
```

## Step 4 — Verify closed externally

From your laptop:

```bash
curl http://159.198.46.65:8000
```

Should **FAIL** ❌

On the VPS:

```bash
curl http://127.0.0.1:8000/health
```

Should **WORK** ✔

---

# 🧠 16. FINAL ARCHITECTURE

```
Internet
   |
   | 443 (HTTPS)
   v
Nginx (farmcareservices.com)
   |
   |--> React static files (/)
   |--> FastAPI (/api)
   |--> WebSockets (/ws)
   |
   v
127.0.0.1:8000 (NOT public)
   |
   v
MySQL (MooMeSystem @ localhost:3306)
```

---

**MooMe Smart Farm — Rwanda** 🇷🇼

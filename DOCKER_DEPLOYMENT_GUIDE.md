# 🚀 PaisaTrack - Complete Docker Deployment Guide (New Server / System)

This guide provides step-by-step instructions for deploying and running **PaisaTrack** on any fresh Linux server (Ubuntu, Debian, AWS EC2, DigitalOcean Droplet, Hetzner, etc.) or a new computer.

---

## 📋 Table of Contents
1. [Prerequisites: Installing Docker on a Fresh Server](#1-prerequisites-installing-docker-on-a-fresh-server)
2. [Method A: Instant Deployment (No Source Code Needed - Recommended)](#2-method-a-instant-deployment-no-source-code-needed---recommended)
3. [Method B: Deployment from Source Code](#3-method-b-deployment-from-source-code)
4. [Domain & Free HTTPS (SSL) Setup with Nginx & Certbot](#4-domain--free-https-ssl-setup-with-nginx--certbot)
5. [Database Persistence & Automated Backups](#5-database-persistence--automated-backups)
6. [Updating to New Versions](#6-updating-to-new-versions)
7. [Helpful Troubleshooting Commands](#7-helpful-troubleshooting-commands)

---

## 1. Prerequisites: Installing Docker on a Fresh Server

Run these commands on your fresh Ubuntu/Debian server to install Docker and Docker Compose:

```bash
# 1. Update package lists
sudo apt update && sudo apt upgrade -y

# 2. Install required packages
sudo apt install -y curl apt-transport-https ca-certificates gnupg lsb-release

# 3. Install Docker via the official automated script
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 4. Add your user to the docker group (so you don't need 'sudo' for docker commands)
sudo usermod -aG docker $USER

# 5. Apply the group change immediately (or log out and log back in)
newgrp docker

# 6. Verify Docker is running
docker --version
docker compose version
```

---

## 2. Method A: Instant Deployment (No Source Code Needed - Recommended)

Because the container image is already published on Docker Hub (**`ranjith256/expenditure-monitor:latest`**), you do **not** need Python, Node, Git, or any source code on the new server.

### Step 2.1: Create a Project Directory
```bash
mkdir -p ~/paisatrack && cd ~/paisatrack
```

### Step 2.2: Create `docker-compose.yml`
Create a `docker-compose.yml` file:
```bash
cat << 'EOF' > docker-compose.yml
services:
  paisatrack:
    image: ranjith256/expenditure-monitor:latest
    container_name: paisatrack-app
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - paisatrack_data:/app/data
    environment:
      - PORT=8000
      - HOST=0.0.0.0
      - DB_PATH=/app/data/finance.db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  paisatrack_data:
    name: paisatrack_data
EOF
```

### Step 2.3: Start the Application
```bash
docker compose up -d
```
Docker will automatically pull `ranjith256/expenditure-monitor:latest` from Docker Hub and start the container in the background.

Visit:
* `http://<your-server-ip>:8000`

---

## 3. Method B: Deployment from Source Code

If you prefer cloning the entire source code and building the image locally on the new server:

### Step 3.1: Copy/Clone the Repository
```bash
git clone <your-git-repo-url> ~/expenditure-monitor
cd ~/expenditure-monitor
```

### Step 3.2: Configure Environment Variables
```bash
cp .env.example .env
```
Edit `.env` with your preferred settings:
```ini
DOCKER_USERNAME=ranjith256
PORT=8000
```

### Step 3.3: Build & Start Container
Using the included automation script:
```bash
chmod +x docker-run.sh
./docker-run.sh up
```

---

## 4. Domain & Free HTTPS (SSL) Setup with Nginx & Certbot

To access your app securely on port 80/443 (e.g., `https://finance.yourdomain.com`) with a free SSL certificate:

### Step 4.1: Install Nginx and Certbot
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Step 4.2: Create Nginx Reverse Proxy Configuration
Create `/etc/nginx/sites-available/paisatrack`:
```bash
sudo nano /etc/nginx/sites-available/paisatrack
```
Paste the following (replace `finance.yourdomain.com` with your actual domain):
```nginx
server {
    server_name finance.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Step 4.3: Enable the Site & Reload Nginx
```bash
sudo ln -s /etc/nginx/sites-available/paisatrack /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4.4: Issue Free SSL Certificate (Let's Encrypt)
```bash
sudo certbot --nginx -d finance.yourdomain.com
```
*Certbot will configure HTTPS automatically and set up automatic renewal.*

---

## 5. Database Persistence & Automated Backups

### Where Data is Stored
Data is stored inside the named Docker volume: `paisatrack_data`. The database file is `/app/data/finance.db`.

### How to Backup the Database
Run this single command anytime to export a timestamped SQLite backup:
```bash
docker run --rm \
  -v paisatrack_data:/data \
  -v $(pwd):/backup \
  busybox cp /data/finance.db /backup/finance_backup_$(date +%F_%H%M%S).db
```

### How to Restore a Database from Backup
To restore a saved backup into your running container:
```bash
docker compose down
docker run --rm \
  -v paisatrack_data:/data \
  -v $(pwd):/backup \
  busybox cp /backup/your_backup_file.db /data/finance.db
docker compose up -d
```

### Automated Daily Backup Cron Job
To automatically create a backup every night at 2:00 AM:
```bash
crontab -e
```
Add the line:
```cron
0 2 * * * docker run --rm -v paisatrack_data:/data -v /home/$USER/backups:/backup busybox cp /data/finance.db /backup/finance_$(date +\%F).db
```

---

## 6. Updating to New Versions

Whenever you push a newer version of the image to Docker Hub, update the new server with two commands:

```bash
cd ~/paisatrack   # or ~/expenditure-monitor

# 1. Pull latest image from Docker Hub
docker compose pull

# 2. Restart container with zero downtime
docker compose up -d
```
*Your SQLite database will remain 100% intact because it is saved inside the persistent volume.*

---

## 7. Helpful Troubleshooting Commands

| Task | Command |
| :--- | :--- |
| **Check Container Status** | `docker compose ps` |
| **View Real-Time Logs** | `docker compose logs -f` |
| **Restart Application** | `docker compose restart` |
| **Stop Application** | `docker compose down` |
| **Inspect SQLite DB Inside Container** | `docker compose exec paisatrack ls -lh /app/data` |
| **Test Healthcheck API** | `curl -f http://localhost:8000/api/health` |
| **Check Port 8000 Availability** | `ss -tulpn \| grep 8000` |
| **View Resource Usage (CPU/RAM)** | `docker stats paisatrack-app` |

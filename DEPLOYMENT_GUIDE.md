# AWS EC2 Ubuntu Deployment Guide

Complete step-by-step guide to deploy the Calling Agent Backend on AWS EC2 Ubuntu.

## Prerequisites

- AWS Account
- Domain configured (calling-api.0804.in pointing to EC2 instance)
- SSH key pair for EC2 access

---

## Part 1: AWS EC2 Setup

### 1.1 Launch EC2 Instance

1. **Go to AWS Console → EC2 → Launch Instance**

2. **Configure Instance:**
   - **Name:** calling-agent-backend
   - **AMI:** Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
   - **Instance Type:** t3.small (minimum) or t3.medium (recommended)
   - **Key pair:** Create new or use existing
   - **Network Settings:**
     - Allow SSH (port 22) from your IP
     - Allow HTTP (port 80) from anywhere (0.0.0.0/0)
     - Allow HTTPS (port 443) from anywhere (0.0.0.0/0)
     - Allow Custom TCP (port 5000) from anywhere (for testing, remove later)
   - **Storage:** 20 GB gp3 (minimum)

3. **Launch Instance**

4. **Note down:**
   - Public IPv4 Address: `<YOUR-EC2-PUBLIC-IP>`
   - Public IPv4 DNS: `<YOUR-EC2-DNS>`

### 1.2 Configure DNS

Point your domain to the EC2 instance:

```
A Record: calling-api.0804.in → <YOUR-EC2-PUBLIC-IP>
```

Wait 5-10 minutes for DNS propagation.

---

## Part 2: Connect to EC2 Instance

### 2.1 Connect via SSH

**Windows (using PowerShell):**
```bash
ssh -i "path\to\your-key.pem" ubuntu@<YOUR-EC2-PUBLIC-IP>
```

**Mac/Linux:**
```bash
chmod 400 your-key.pem
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-PUBLIC-IP>
```

---

## Part 3: Server Setup

### 3.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 3.2 Install Node.js 20.x LTS

```bash
# Install NVM (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js 20 LTS
nvm install 20
nvm use 20
nvm alias default 20

# Verify installation
node -v  # Should show v20.x.x
npm -v   # Should show npm version
```

### 3.3 Install PM2 (Process Manager)

```bash
npm install -g pm2

# Verify installation
pm2 -v
```

### 3.4 Install Nginx (Reverse Proxy)

```bash
sudo apt install nginx -y

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

### 3.5 Install Git

```bash
sudo apt install git -y

# Configure Git
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

### 3.6 Install Certbot (SSL Certificates)

```bash
sudo apt install certbot python3-certbot-nginx -y
```

---

## Part 4: Deploy Application

### 4.1 Clone Repository

```bash
# Navigate to home directory
cd ~

# Clone your BACKEND repository (replace with your actual backend repo URL)
git clone <YOUR-BACKEND-REPO-URL>
# Example: git clone https://github.com/your-username/calling-agent-backend.git

# Navigate to project directory (adjust folder name if different)
cd AI-Callling-Agent-Backend
```

**Alternative: If using GitHub private repository:**
```bash
# Generate SSH key on EC2
ssh-keygen -t ed25519 -C "your-email@example.com"

# Display public key
cat ~/.ssh/id_ed25519.pub

# Copy the output and add to GitHub: Settings → SSH and GPG keys → New SSH key

# Clone via SSH (replace with your backend repo URL)
git clone git@github.com:your-username/backend-repo-name.git
cd backend-repo-name

# Note: Frontend and backend are separate repositories
# Frontend repo is deployed separately at calling-dashboard.0804.in
```

### 4.2 Create Production Environment File

```bash
# Copy the production template
cp .env.production .env

# Edit the .env file
nano .env
```

**Update these values in `.env`:**

```env
# Add MILLIS_WEBHOOK_SECRET from Millis dashboard
MILLIS_WEBHOOK_SECRET=<your-actual-webhook-secret>

# Add your EC2 public IP to whitelist
RATE_LIMIT_WHITELIST=<YOUR-EC2-PUBLIC-IP>,127.0.0.1,::1,::ffff:127.0.0.1
```

**Save and exit:** Press `CTRL+X`, then `Y`, then `ENTER`

### 4.3 Install Dependencies

```bash
npm ci --only=production
```

### 4.4 Create Logs Directory

```bash
mkdir -p logs
```

### 4.5 Test Application

```bash
# Start application manually to test
npm start
```

**Open another terminal and test:**
```bash
curl http://localhost:5000/api/v1/health
```

You should see: `{"status":"ok"}`

**Stop the test (press CTRL+C)**

---

## Part 5: Setup PM2 Process Manager

### 5.1 Start Application with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs calling-agent-api

# Monitor
pm2 monit
```

### 5.2 Configure PM2 Startup

```bash
# Generate startup script
pm2 startup

# Copy and run the command that PM2 outputs (it will look like):
# sudo env PATH=$PATH:/home/ubuntu/.nvm/versions/node/v20.x.x/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Save PM2 process list
pm2 save

# Test by rebooting
sudo reboot
```

**Reconnect after reboot and verify:**
```bash
pm2 status
# Should show your application running
```

---

## Part 6: Configure Nginx Reverse Proxy

### 6.1 Setup SSL Certificate (Let's Encrypt)

```bash
# Obtain SSL certificate
sudo certbot --nginx -d calling-api.0804.in

# Follow prompts:
# - Enter email address
# - Agree to terms
# - Choose whether to share email (optional)
# - Select redirect HTTP to HTTPS (recommended)
```

### 6.2 Configure Nginx

```bash
# Backup default config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Create new config file
sudo nano /etc/nginx/sites-available/calling-agent-api
```

**Copy the contents from `nginx.conf` file in your project, or paste this:**

```nginx
server {
    listen 80;
    server_name calling-api.0804.in;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name calling-api.0804.in;

    # SSL Certificate paths (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/calling-api.0804.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/calling-api.0804.in/privkey.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/calling-api-access.log;
    error_log /var/log/nginx/calling-api-error.log;

    # Max upload size
    client_max_body_size 10M;

    # Proxy to Node.js application
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Headers
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /api/v1/health {
        proxy_pass http://localhost:5000;
        access_log off;
    }
}
```

**Save and exit:** Press `CTRL+X`, then `Y`, then `ENTER`

### 6.3 Enable Site and Test Configuration

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/calling-agent-api /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx

# Check nginx status
sudo systemctl status nginx
```

---

## Part 7: Configure Firewall (UFW)

```bash
# Enable UFW
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Check status
sudo ufw status

# Output should show:
# 22/tcp (OpenSSH) - ALLOW
# 80/tcp (Nginx HTTP) - ALLOW
# 443/tcp (Nginx HTTPS) - ALLOW
```

---

## Part 8: Verify Deployment

### 8.1 Test Health Endpoint

```bash
# Test from EC2
curl https://calling-api.0804.in/api/v1/health

# Expected output:
# {"status":"ok"}
```

### 8.2 Test from Your Computer

Open browser and visit:
```
https://calling-api.0804.in/api/v1/health
```

You should see: `{"status":"ok"}`

### 8.3 Check SSL Certificate

Visit `https://calling-api.0804.in` in browser and check:
- ✅ Green padlock icon
- ✅ Valid SSL certificate
- ✅ No mixed content warnings

---

## Part 9: Setup Auto-Renewal for SSL

```bash
# Test renewal process
sudo certbot renew --dry-run

# Certbot automatically sets up renewal via systemd timer
# Check timer status
sudo systemctl status certbot.timer

# Manually renew if needed
sudo certbot renew
```

---

## Part 10: Monitoring and Logs

### 10.1 View Application Logs

```bash
# Real-time logs
pm2 logs calling-agent-api

# View specific log files
pm2 logs calling-agent-api --lines 100

# View error logs only
pm2 logs calling-agent-api --err

# View application log files directly
tail -f ~/AI-Callling-Agent-Backend/logs/combined.log
tail -f ~/AI-Callling-Agent-Backend/logs/err.log
```

### 10.2 View Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/calling-api-access.log

# Error logs
sudo tail -f /var/log/nginx/calling-api-error.log
```

### 10.3 Monitor System Resources

```bash
# PM2 monitoring dashboard
pm2 monit

# System resources
htop
# (Install: sudo apt install htop)

# Disk usage
df -h

# Memory usage
free -h
```

---

## Part 11: Future Deployments (Updates)

### 11.1 Make Deploy Script Executable

```bash
cd ~/AI-Callling-Agent-Backend
chmod +x deploy.sh
```

### 11.2 Deploy Updates

```bash
# Navigate to project directory
cd ~/AI-Callling-Agent-Backend

# Run deployment script
./deploy.sh
```

**Manual deployment steps:**
```bash
cd ~/AI-Callling-Agent-Backend

# Pull latest code
git pull origin main

# Install dependencies
npm ci --only=production

# Restart application
pm2 reload ecosystem.config.js --update-env

# Save process list
pm2 save
```

---

## Part 12: Useful PM2 Commands

```bash
# Status of all processes
pm2 status

# Restart application
pm2 restart calling-agent-api

# Stop application
pm2 stop calling-agent-api

# Delete process from PM2
pm2 delete calling-agent-api

# View detailed info
pm2 show calling-agent-api

# Monitor CPU and memory
pm2 monit

# Flush logs
pm2 flush

# Save process list
pm2 save

# Resurrect saved processes
pm2 resurrect
```

---

## Part 13: Troubleshooting

### Issue: Application not starting

```bash
# Check PM2 logs
pm2 logs calling-agent-api --err

# Check if .env file exists
ls -la ~/AI-Callling-Agent-Backend/.env

# Test environment variables
cd ~/AI-Callling-Agent-Backend
node -e "require('dotenv').config(); console.log(process.env.MONGO_URL ? 'MONGO_URL set' : 'MONGO_URL missing')"
```

### Issue: Cannot connect to MongoDB

```bash
# Test MongoDB connection from EC2
cd ~/AI-Callling-Agent-Backend
node -e "const mongoose = require('mongoose'); require('dotenv').config(); mongoose.connect(process.env.MONGO_URL).then(() => console.log('✅ Connected')).catch(err => console.log('❌ Error:', err.message))"
```

### Issue: 502 Bad Gateway

```bash
# Check if Node.js is running
pm2 status

# Check if port 5000 is listening
sudo netstat -tlnp | grep 5000

# Check nginx error logs
sudo tail -100 /var/log/nginx/calling-api-error.log

# Restart services
pm2 restart calling-agent-api
sudo systemctl restart nginx
```

### Issue: SSL Certificate Error

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate
sudo certbot renew --force-renewal

# Reload nginx
sudo systemctl reload nginx
```

### Issue: Out of Memory

```bash
# Check memory usage
free -h
pm2 monit

# Increase swap space (if needed)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Part 14: Security Best Practices

### 14.1 Update EC2 Security Group

After SSL is working, remove port 5000 from Security Group inbound rules (only allow 22, 80, 443).

### 14.2 Regular Updates

```bash
# Update system packages monthly
sudo apt update && sudo apt upgrade -y

# Update Node.js packages (be careful with major version changes)
cd ~/AI-Callling-Agent-Backend
npm outdated
npm update
```

### 14.3 MongoDB Atlas IP Whitelist

Add your EC2 public IP to MongoDB Atlas Network Access:
1. Go to MongoDB Atlas
2. Network Access → Add IP Address
3. Add: `<YOUR-EC2-PUBLIC-IP>`

### 14.4 Enable Fail2Ban (Brute Force Protection)

```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## Part 15: Backup Strategy

### 15.1 Setup Automated Backups

```bash
# Create backup script
nano ~/backup.sh
```

**Add this content:**
```bash
#!/bin/bash
BACKUP_DIR="$HOME/backups"
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="$HOME/AI-Callling-Agent-Backend"

mkdir -p $BACKUP_DIR

# Backup .env file
cp $APP_DIR/.env $BACKUP_DIR/.env.$DATE

# Backup logs
tar -czf $BACKUP_DIR/logs.$DATE.tar.gz $APP_DIR/logs/

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name ".env.*" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# Make executable
chmod +x ~/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add this line:
0 2 * * * /home/ubuntu/backup.sh >> /home/ubuntu/backup.log 2>&1
```

---

## Summary Checklist

- [ ] EC2 instance launched with Ubuntu 22.04
- [ ] DNS A record pointing to EC2 IP
- [ ] Node.js 20.x installed
- [ ] PM2 installed globally
- [ ] Nginx installed and configured
- [ ] Repository cloned
- [ ] `.env` file configured with production values
- [ ] Dependencies installed
- [ ] PM2 running application
- [ ] PM2 startup script configured
- [ ] SSL certificate obtained via Certbot
- [ ] Nginx reverse proxy configured
- [ ] Firewall (UFW) enabled
- [ ] Application accessible via HTTPS
- [ ] Health endpoint returning 200 OK
- [ ] Monitoring and logs working

---

## Important URLs

- **API Base URL:** `https://calling-api.0804.in`
- **Health Check:** `https://calling-api.0804.in/api/v1/health`
- **Admin API:** `https://calling-api.0804.in/api/v1/admin/`
- **User API:** `https://calling-api.0804.in/api/v1/user/`

---

## Support

If you encounter issues:

1. Check PM2 logs: `pm2 logs calling-agent-api`
2. Check Nginx error logs: `sudo tail -100 /var/log/nginx/calling-api-error.log`
3. Verify DNS propagation: `nslookup calling-api.0804.in`
4. Test MongoDB connection from EC2
5. Verify all environment variables are set correctly

---

**🎉 Congratulations! Your backend is now deployed and running on AWS EC2 Ubuntu with HTTPS!**

# Frontend Deployment Guide (Same EC2 Instance)

Deploy your React/Vite frontend on the same EC2 instance as your backend.

## Architecture Overview

```
Internet
    ↓
AWS EC2 Instance
    ↓
Nginx (Port 80/443)
    ↓
    ├─→ calling-dashboard.0804.in → Frontend (Static files)
    └─→ calling-api.0804.in → Backend (Node.js PM2, Port 5000)
```

---

## Prerequisites

✅ Backend already deployed and running
✅ Domain DNS configured:
- `calling-dashboard.0804.in` → EC2 Public IP
- `calling-api.0804.in` → EC2 Public IP

---

## Step-by-Step Deployment

### Step 1: Clone Frontend Repository

```bash
# SSH to your EC2 instance
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# Navigate to home directory
cd ~

# Clone your FRONTEND repository
git clone <YOUR-FRONTEND-REPO-URL>
# Example: git clone https://github.com/your-username/calling-dashboard.git

# Navigate to frontend directory
cd <YOUR-FRONTEND-FOLDER-NAME>
```

**If using private GitHub repository:**
```bash
# Use the same SSH key you set up for backend
git clone git@github.com:your-username/frontend-repo-name.git
cd frontend-repo-name
```

---

### Step 2: Create Production Environment File

```bash
# Create .env.production file
nano .env.production
```

**Add your production environment variables:**
```env
# API Configuration
VITE_API_BASE_URL=https://calling-api.0804.in/api/v1

# Or if using React (not Vite):
REACT_APP_API_BASE_URL=https://calling-api.0804.in/api/v1

# Other environment variables
VITE_APP_NAME=Calling Agent Dashboard
VITE_ENABLE_ANALYTICS=true
```

**Save and exit:** Press `CTRL+X`, then `Y`, then `ENTER`

---

### Step 3: Install Dependencies and Build

```bash
# Install dependencies
npm ci --only=production

# Build for production
npm run build

# Verify build folder exists
ls -la dist/  # For Vite
# OR
ls -la build/  # For Create React App
```

**Expected output:**
```
drwxrwxr-x 2 ubuntu ubuntu  4096 Oct 31 12:00 assets
-rw-rw-r-- 1 ubuntu ubuntu  1234 Oct 31 12:00 index.html
-rw-rw-r-- 1 ubuntu ubuntu   500 Oct 31 12:00 favicon.ico
```

---

### Step 4: Configure Nginx for Frontend

```bash
# Create nginx configuration for frontend
sudo nano /etc/nginx/sites-available/calling-dashboard
```

**Paste this configuration:**

```nginx
server {
    listen 80;
    server_name calling-dashboard.0804.in;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name calling-dashboard.0804.in;

    # SSL Certificate paths (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/calling-dashboard.0804.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/calling-dashboard.0804.in/privkey.pem;

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
    access_log /var/log/nginx/calling-dashboard-access.log;
    error_log /var/log/nginx/calling-dashboard-error.log;

    # Root directory (adjust path based on your build output)
    # For Vite: dist/
    # For Create React App: build/
    root /home/ubuntu/<YOUR-FRONTEND-FOLDER-NAME>/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # React Router / SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Prevent access to hidden files
    location ~ /\. {
        deny all;
    }
}
```

**Important:** Replace `<YOUR-FRONTEND-FOLDER-NAME>` with your actual folder name!

**Save and exit:** Press `CTRL+X`, then `Y`, then `ENTER`

---

### Step 5: Setup SSL Certificate for Frontend

```bash
# Obtain SSL certificate for frontend domain
sudo certbot --nginx -d calling-dashboard.0804.in

# Follow prompts:
# - Enter email address (can use same as backend)
# - Agree to terms
# - Choose redirect HTTP to HTTPS (recommended)
```

**Note:** Certbot will automatically update the nginx config with SSL paths.

---

### Step 6: Enable Frontend Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/calling-dashboard /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx

# Check nginx status
sudo systemctl status nginx
```

---

### Step 7: Verify Deployment

```bash
# Test locally
curl https://calling-dashboard.0804.in

# Should return HTML with your app
```

**Test in browser:**
1. Open `https://calling-dashboard.0804.in`
2. Should see your frontend application
3. Check browser console for errors
4. Test API calls to backend

---

## Step 8: Create Deployment Script

```bash
# Navigate to frontend directory
cd ~/<YOUR-FRONTEND-FOLDER-NAME>

# Create deployment script
nano deploy.sh
```

**Paste this content:**

```bash
#!/bin/bash

# Frontend Deployment Script
set -e

echo "🚀 Starting frontend deployment..."

# Pull latest code
echo "📥 Pulling latest code from git..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Build application
echo "🔨 Building application..."
npm run build

# Reload nginx
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

echo "✅ Frontend deployment complete!"
echo "🌐 Visit: https://calling-dashboard.0804.in"
```

**Save and make executable:**
```bash
chmod +x deploy.sh
```

---

## Future Deployments (Updates)

When you need to deploy frontend updates:

```bash
# SSH to EC2
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# Navigate to frontend directory
cd ~/<YOUR-FRONTEND-FOLDER-NAME>

# Run deployment script
./deploy.sh
```

**Or manually:**
```bash
cd ~/<YOUR-FRONTEND-FOLDER-NAME>
git pull origin main
npm ci --only=production
npm run build
sudo systemctl reload nginx
```

---

## Troubleshooting

### Issue: 404 Not Found

**Check nginx config:**
```bash
sudo nginx -t
sudo tail -100 /var/log/nginx/calling-dashboard-error.log
```

**Verify build folder path:**
```bash
ls -la /home/ubuntu/<YOUR-FRONTEND-FOLDER-NAME>/dist/
# Should show index.html and assets/
```

### Issue: API Calls Failing (CORS)

**Check backend CORS configuration:**
```bash
cd ~/AI-Callling-Agent-Backend
cat .env | grep CORS_ORIGINS
# Should include: https://calling-dashboard.0804.in
```

**If not, update backend .env:**
```bash
cd ~/AI-Callling-Agent-Backend
nano .env
# Update: CORS_ORIGINS=https://calling-dashboard.0804.in
pm2 restart calling-agent-api
```

### Issue: Blank Page / JavaScript Errors

**Check build output:**
```bash
cd ~/<YOUR-FRONTEND-FOLDER-NAME>
npm run build
# Look for errors in build output
```

**Check browser console:**
- Open DevTools (F12)
- Look for errors in Console tab
- Check Network tab for failed requests

### Issue: SSL Certificate Error

**Check certificate status:**
```bash
sudo certbot certificates
```

**Renew if needed:**
```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

### Issue: Changes Not Showing

**Clear browser cache:**
- Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Or clear browser cache in settings

**Verify new build:**
```bash
cd ~/<YOUR-FRONTEND-FOLDER-NAME>
ls -lh dist/assets/*.js
# Check file timestamps - should be recent
```

---

## Performance Optimization

### Enable HTTP/2 Push

Add to nginx config:
```nginx
location = /index.html {
    http2_push /assets/main.js;
    http2_push /assets/main.css;
}
```

### Add Additional Cache Headers

```nginx
# HTML - no cache (for updates)
location ~* \.html$ {
    expires -1;
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
}

# JavaScript and CSS with hash
location ~* \.[0-9a-f]{8}\.(js|css)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## Monitoring

### View Nginx Access Logs

```bash
# Real-time frontend access logs
sudo tail -f /var/log/nginx/calling-dashboard-access.log

# Frontend error logs
sudo tail -f /var/log/nginx/calling-dashboard-error.log
```

### Check Disk Space

```bash
# Check available space
df -h

# Check frontend build size
du -sh ~/<YOUR-FRONTEND-FOLDER-NAME>/dist/
```

### Monitor Nginx Status

```bash
# Check if nginx is running
sudo systemctl status nginx

# Test nginx config
sudo nginx -t

# View nginx processes
ps aux | grep nginx
```

---

## Directory Structure on EC2

After deployment, your EC2 instance will have:

```
/home/ubuntu/
├── AI-Callling-Agent-Backend/     # Backend Node.js app
│   ├── src/
│   ├── .env
│   ├── ecosystem.config.js
│   └── logs/
└── <YOUR-FRONTEND-FOLDER-NAME>/   # Frontend React/Vite app
    ├── src/
    ├── dist/                      # Built files (served by nginx)
    │   ├── index.html
    │   └── assets/
    └── .env.production
```

---

## Environment Variables Reference

### Vite Projects

Environment variables must start with `VITE_`:

```env
VITE_API_BASE_URL=https://calling-api.0804.in/api/v1
VITE_APP_NAME=My App
```

Access in code:
```javascript
const apiUrl = import.meta.env.VITE_API_BASE_URL;
```

### Create React App Projects

Environment variables must start with `REACT_APP_`:

```env
REACT_APP_API_BASE_URL=https://calling-api.0804.in/api/v1
REACT_APP_NAME=My App
```

Access in code:
```javascript
const apiUrl = process.env.REACT_APP_API_BASE_URL;
```

---

## Security Checklist

- [ ] SSL certificate installed and valid
- [ ] HTTPS redirect configured
- [ ] Security headers enabled
- [ ] Hidden files blocked (.git, .env, etc.)
- [ ] CORS properly configured on backend
- [ ] No sensitive data in frontend code
- [ ] Environment variables properly set
- [ ] Gzip compression enabled
- [ ] Static asset caching configured

---

## Quick Commands Reference

```bash
# Deploy frontend updates
cd ~/<YOUR-FRONTEND-FOLDER-NAME> && ./deploy.sh

# Rebuild frontend
cd ~/<YOUR-FRONTEND-FOLDER-NAME> && npm run build

# Restart nginx
sudo systemctl reload nginx

# View frontend logs
sudo tail -f /var/log/nginx/calling-dashboard-access.log

# Check SSL certificates
sudo certbot certificates

# Test nginx config
sudo nginx -t

# Check disk space
df -h
```

---

## Complete Deployment Checklist

- [ ] Frontend repository cloned to EC2
- [ ] `.env.production` created with correct API URL
- [ ] Dependencies installed (`npm ci`)
- [ ] Production build created (`npm run build`)
- [ ] Build folder exists (`dist/` or `build/`)
- [ ] Nginx config created for frontend domain
- [ ] SSL certificate obtained via Certbot
- [ ] Nginx site enabled and reloaded
- [ ] Frontend accessible via HTTPS
- [ ] API calls working (check browser console)
- [ ] Deployment script created and executable
- [ ] Both domains working:
  - ✅ `https://calling-dashboard.0804.in` (frontend)
  - ✅ `https://calling-api.0804.in` (backend)

---

**🎉 Congratulations! Your full-stack application is now deployed on EC2!**

Both frontend and backend are running on the same EC2 instance, served through Nginx with SSL encryption.

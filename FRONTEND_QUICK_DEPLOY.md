# Frontend Quick Deployment Reference

## Quick Steps (Copy-Paste Ready)

### 1. Clone and Build Frontend

```bash
# SSH to EC2
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# Clone frontend repository
cd ~
git clone <YOUR-FRONTEND-REPO-URL>
cd <YOUR-FRONTEND-FOLDER-NAME>

# Create production environment file
nano .env.production
# Add: VITE_API_BASE_URL=https://calling-api.0804.in/api/v1
# Save: CTRL+X, Y, ENTER

# Install and build
npm ci --only=production
npm run build

# Verify build
ls -la dist/  # Should show index.html and assets/
```

### 2. Configure Nginx

```bash
# Create nginx config
sudo nano /etc/nginx/sites-available/calling-dashboard
```

**Paste this (update YOUR-FRONTEND-FOLDER-NAME):**

```nginx
server {
    listen 80;
    server_name calling-dashboard.0804.in;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name calling-dashboard.0804.in;

    ssl_certificate /etc/letsencrypt/live/calling-dashboard.0804.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/calling-dashboard.0804.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    access_log /var/log/nginx/calling-dashboard-access.log;
    error_log /var/log/nginx/calling-dashboard-error.log;

    root /home/ubuntu/<YOUR-FRONTEND-FOLDER-NAME>/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ /\. {
        deny all;
    }
}
```

### 3. Setup SSL and Enable Site

```bash
# Get SSL certificate
sudo certbot --nginx -d calling-dashboard.0804.in

# Enable site
sudo ln -s /etc/nginx/sites-available/calling-dashboard /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Test Deployment

```bash
# Test locally
curl https://calling-dashboard.0804.in

# Open in browser
# Visit: https://calling-dashboard.0804.in
```

---

## Future Updates

```bash
cd ~/<YOUR-FRONTEND-FOLDER-NAME>
git pull origin main
npm ci --only=production
npm run build
sudo systemctl reload nginx
```

---

## Quick Troubleshooting

```bash
# Check nginx errors
sudo tail -50 /var/log/nginx/calling-dashboard-error.log

# Check if build exists
ls -la /home/ubuntu/<YOUR-FRONTEND-FOLDER-NAME>/dist/

# Test nginx config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Check disk space
df -h

# View real-time logs
sudo tail -f /var/log/nginx/calling-dashboard-access.log
```

---

## Fix Common Issues

### API Calls Failing (CORS)

```bash
# Update backend CORS
cd ~/AI-Callling-Agent-Backend
nano .env
# Ensure: CORS_ORIGINS=https://calling-dashboard.0804.in
pm2 restart calling-agent-api
```

### Build Folder Not Found

```bash
# Check build output folder
cd ~/<YOUR-FRONTEND-FOLDER-NAME>
npm run build
ls -la dist/  # For Vite
ls -la build/ # For Create React App

# Update nginx config if needed
sudo nano /etc/nginx/sites-available/calling-dashboard
# Change: root /home/ubuntu/<FOLDER>/build;  (if using CRA)
```

### Changes Not Showing

```bash
# Rebuild
cd ~/<YOUR-FRONTEND-FOLDER-NAME>
npm run build

# Hard refresh browser: Ctrl+Shift+R
```

---

## Environment Variables

**Vite (most common):**
```env
VITE_API_BASE_URL=https://calling-api.0804.in/api/v1
```

**Create React App:**
```env
REACT_APP_API_BASE_URL=https://calling-api.0804.in/api/v1
```

**Next.js:**
```env
NEXT_PUBLIC_API_BASE_URL=https://calling-api.0804.in/api/v1
```

---

## Verify Both Services

```bash
# Backend health check
curl https://calling-api.0804.in/api/v1/health

# Frontend check
curl https://calling-dashboard.0804.in

# PM2 status
pm2 status

# Nginx status
sudo systemctl status nginx
```

---

## Important Paths

```
Frontend Build:  /home/ubuntu/<YOUR-FRONTEND-FOLDER-NAME>/dist/
Nginx Config:    /etc/nginx/sites-available/calling-dashboard
Nginx Logs:      /var/log/nginx/calling-dashboard-*.log
SSL Certs:       /etc/letsencrypt/live/calling-dashboard.0804.in/
```

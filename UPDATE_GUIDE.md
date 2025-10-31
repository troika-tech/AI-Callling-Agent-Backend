# Future Update Guide

Quick reference for updating your deployed frontend and backend applications.

---

## 🔄 Update Backend (API)

### Quick Method (Using Deploy Script)

```bash
# 1. SSH to EC2
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# 2. Navigate to backend folder
cd ~/AI-Callling-Agent-Backend

# 3. Run deploy script
./deploy.sh
```

### Manual Method (Step-by-Step)

```bash
# 1. SSH to EC2
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# 2. Navigate to backend
cd ~/AI-Callling-Agent-Backend

# 3. Pull latest code
git pull origin main

# 4. Install/update dependencies (if package.json changed)
npm ci --only=production

# 5. Restart application
pm2 reload ecosystem.config.js --update-env

# 6. Save PM2 process list
pm2 save

# 7. Check status
pm2 status
pm2 logs calling-agent-api --lines 20
```

### If You Changed Environment Variables

```bash
cd ~/AI-Callling-Agent-Backend
nano .env
# Make your changes
# Save: CTRL+X, Y, ENTER

pm2 restart calling-agent-api
pm2 logs calling-agent-api
```

---

## 🎨 Update Frontend (Dashboard)

### Quick Method (Using Deploy Script)

```bash
# 1. SSH to EC2
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# 2. Navigate to frontend folder
cd ~/AI-Calling-Agent-Frontend

# 3. Run deploy script
./deploy.sh
```

### Manual Method (Step-by-Step)

```bash
# 1. SSH to EC2
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# 2. Navigate to frontend
cd ~/AI-Calling-Agent-Frontend

# 3. Pull latest code
git pull origin main

# 4. Install/update dependencies (if package.json changed)
npm ci --only=production

# 5. Build for production
npm run build

# 6. Reload nginx (to clear cache)
sudo systemctl reload nginx

# 7. Verify build
ls -la dist/
# Should show index.html and assets/
```

### If You Changed Environment Variables

```bash
cd ~/AI-Calling-Agent-Frontend
nano .env.production
# Make your changes
# Save: CTRL+X, Y, ENTER

# Rebuild with new env vars
npm run build

# Reload nginx
sudo systemctl reload nginx
```

### Clear Browser Cache

After frontend updates, users should:
- Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Or clear browser cache

---

## 📦 Update Both at Once

```bash
# SSH to EC2
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# Update backend
cd ~/AI-Callling-Agent-Backend
git pull origin main
npm ci --only=production
pm2 reload ecosystem.config.js --update-env
pm2 save

# Update frontend
cd ~/AI-Calling-Agent-Frontend
git pull origin main
npm ci --only=production
npm run build
sudo systemctl reload nginx

# Verify both
pm2 status
sudo systemctl status nginx
curl https://calling-api.0804.in/api/v1/health
curl https://calling-dashboard.0804.in
```

---

## 🔍 Check What Changed

Before updating, see what will be updated:

```bash
# Check backend changes
cd ~/AI-Callling-Agent-Backend
git fetch origin
git log HEAD..origin/main --oneline
git diff HEAD origin/main

# Check frontend changes
cd ~/AI-Calling-Agent-Frontend
git fetch origin
git log HEAD..origin/main --oneline
git diff HEAD origin/main
```

---

## 🐛 Troubleshooting Updates

### Backend Not Starting After Update

```bash
# Check logs
pm2 logs calling-agent-api --err --lines 50

# Check if .env is correct
cd ~/AI-Callling-Agent-Backend
cat .env

# Try manual start
cd ~/AI-Callling-Agent-Backend
npm start
# Look for error messages

# Restart PM2
pm2 delete calling-agent-api
pm2 start ecosystem.config.js
pm2 save
```

### Frontend Not Showing Updates

```bash
# Check if build succeeded
cd ~/AI-Calling-Agent-Frontend
npm run build
# Look for errors

# Check build timestamp
ls -lht dist/assets/*.js | head -5
# Should show recent timestamps

# Check nginx is serving correct files
curl https://calling-dashboard.0804.in
# Should show new version

# Clear nginx cache
sudo systemctl reload nginx

# Hard refresh browser: Ctrl+Shift+R
```

### Dependencies Won't Install

```bash
# Clear npm cache
cd ~/AI-Callling-Agent-Backend  # or AI-Calling-Agent-Frontend
rm -rf node_modules
rm package-lock.json
npm install
```

### Git Pull Conflicts

```bash
# Stash local changes
git stash

# Pull latest
git pull origin main

# Reapply stashed changes (if needed)
git stash pop

# Or discard local changes
git reset --hard origin/main
```

---

## 📋 Update Checklist

### Before Updating

- [ ] Check what changed: `git log HEAD..origin/main`
- [ ] Backup `.env` files (if making changes)
- [ ] Note current version: `git log -1 --oneline`
- [ ] Check if dependencies changed: `git diff HEAD origin/main -- package.json`

### During Update

- [ ] Pull latest code: `git pull origin main`
- [ ] Install dependencies (if needed): `npm ci --only=production`
- [ ] Update `.env` (if needed)
- [ ] Backend: Restart PM2
- [ ] Frontend: Rebuild and reload nginx

### After Update

- [ ] Check backend: `pm2 status` and `pm2 logs`
- [ ] Check frontend: Visit `https://calling-dashboard.0804.in`
- [ ] Test API: `curl https://calling-api.0804.in/api/v1/health`
- [ ] Test login/core features
- [ ] Clear browser cache and test

---

## 🚨 Rollback (If Update Breaks)

### Rollback Backend

```bash
cd ~/AI-Callling-Agent-Backend

# Find previous working commit
git log --oneline -10

# Rollback to previous commit
git reset --hard <commit-hash>

# Restart
pm2 restart calling-agent-api
pm2 logs calling-agent-api
```

### Rollback Frontend

```bash
cd ~/AI-Calling-Agent-Frontend

# Rollback to previous commit
git reset --hard <commit-hash>

# Rebuild
npm run build
sudo systemctl reload nginx
```

---

## 📊 Monitoring After Updates

```bash
# Watch backend logs in real-time
pm2 logs calling-agent-api

# Monitor backend resources
pm2 monit

# Watch nginx access logs
sudo tail -f /var/log/nginx/calling-api-access.log
sudo tail -f /var/log/nginx/calling-dashboard-access.log

# Watch nginx error logs
sudo tail -f /var/log/nginx/calling-api-error.log
sudo tail -f /var/log/nginx/calling-dashboard-error.log

# Check system resources
htop
df -h  # Disk space
free -h  # Memory
```

---

## 🔐 Security Updates

```bash
# Update system packages (monthly)
sudo apt update
sudo apt upgrade -y

# Update Node.js (when needed)
nvm install 20  # or latest LTS
nvm use 20
nvm alias default 20

# Update PM2
npm install -g pm2@latest
pm2 update

# Update certbot certificates (auto-renewed, but can force)
sudo certbot renew
```

---

## ⏱️ Zero-Downtime Updates (Backend)

```bash
cd ~/AI-Callling-Agent-Backend
git pull origin main
npm ci --only=production

# Reload instead of restart (zero downtime)
pm2 reload calling-agent-api

# PM2 will restart instances one at a time
```

---

## 📝 Quick Command Reference

```bash
# Backend update
cd ~/AI-Callling-Agent-Backend && git pull && npm ci --only=production && pm2 reload calling-agent-api && pm2 save

# Frontend update
cd ~/AI-Calling-Agent-Frontend && git pull && npm ci --only=production && npm run build && sudo systemctl reload nginx

# Check both services
pm2 status && sudo systemctl status nginx

# View logs
pm2 logs calling-agent-api
sudo tail -f /var/log/nginx/calling-dashboard-error.log
```

---

## 📞 Need Help?

If something goes wrong:

1. Check logs: `pm2 logs` and nginx error logs
2. Check services: `pm2 status` and `sudo systemctl status nginx`
3. Rollback to previous version
4. Review the deployment guides

**Important Files:**
- Backend deployment: `DEPLOYMENT_GUIDE.md`
- Frontend deployment: `FRONTEND_DEPLOYMENT.md`
- Quick references: `QUICK_DEPLOY.md`, `FRONTEND_QUICK_DEPLOY.md`

---

**Pro Tip:** Always test updates in development first before deploying to production!

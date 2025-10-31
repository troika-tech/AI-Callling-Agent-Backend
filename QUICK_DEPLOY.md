# Quick Deployment Reference

## Prerequisites Setup (One-time)

```bash
# 1. Connect to EC2
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# 2. Install Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20 && nvm use 20 && nvm alias default 20

# 3. Install PM2 & Nginx
npm install -g pm2
sudo apt update && sudo apt install nginx certbot python3-certbot-nginx git -y

# 4. Clone BACKEND repository (not frontend - separate repo)
git clone <YOUR-BACKEND-REPO-URL>
cd <YOUR-BACKEND-FOLDER-NAME>
# Example: cd AI-Callling-Agent-Backend

# 5. Setup environment
cp .env.production .env
nano .env  # Edit with your values

# 6. Install dependencies
npm ci --only=production

# 7. Create logs directory
mkdir -p logs

# 8. Start with PM2
pm2 start ecosystem.config.js
pm2 startup  # Run the command it outputs
pm2 save

# 9. Setup SSL
sudo certbot --nginx -d calling-api.0804.in

# 10. Configure Nginx
sudo nano /etc/nginx/sites-available/calling-agent-api
# Paste nginx.conf content
sudo ln -s /etc/nginx/sites-available/calling-agent-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 11. Configure firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Regular Deployment (Updates)

```bash
# Connect to EC2
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-IP>

# Navigate to backend project (adjust folder name to match your repo)
cd ~/AI-Callling-Agent-Backend

# Deploy updates
./deploy.sh

# Or manually:
git pull origin main
npm ci --only=production
pm2 reload ecosystem.config.js --update-env
pm2 save
```

## Useful Commands

```bash
# Check status
pm2 status

# View logs
pm2 logs calling-agent-api

# Restart
pm2 restart calling-agent-api

# Monitor
pm2 monit

# Test health
curl https://calling-api.0804.in/api/v1/health

# View nginx logs
sudo tail -f /var/log/nginx/calling-api-error.log
```

## Environment Variables Checklist

- [ ] `MONGO_URL` - MongoDB connection string
- [ ] `MILLIS_API_KEY` - From Millis dashboard
- [ ] `MILLIS_WEBHOOK_SECRET` - From Millis dashboard
- [ ] `JWT_SECRET` - 128-char random string
- [ ] `CORS_ORIGINS` - https://calling-dashboard.0804.in
- [ ] `RATE_LIMIT_WHITELIST` - Your EC2 public IP
- [ ] `COOKIE_DOMAIN` - .0804.in

## Troubleshooting

```bash
# Application won't start
pm2 logs calling-agent-api --err

# 502 Bad Gateway
pm2 status
sudo systemctl status nginx
sudo tail -100 /var/log/nginx/calling-api-error.log

# Database connection issues
node -e "const mongoose = require('mongoose'); require('dotenv').config(); mongoose.connect(process.env.MONGO_URL).then(() => console.log('✅ Connected')).catch(err => console.log('❌ Error:', err.message))"

# SSL issues
sudo certbot certificates
sudo certbot renew
sudo systemctl reload nginx
```

## Security Reminders

1. Add EC2 IP to MongoDB Atlas Network Access
2. Remove port 5000 from EC2 Security Group (only keep 22, 80, 443)
3. Keep system updated: `sudo apt update && sudo apt upgrade -y`
4. Monitor logs regularly: `pm2 logs`
5. Backup .env file: `cp .env .env.backup`

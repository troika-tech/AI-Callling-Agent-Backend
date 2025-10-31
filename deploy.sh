#!/bin/bash

# Deployment script for Calling Agent Backend
# Run this script on your EC2 instance after initial setup

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Pull latest code
echo "📥 Pulling latest code from git..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Restart application with PM2
echo "🔄 Restarting application..."
pm2 reload ecosystem.config.js --update-env

# Save PM2 process list
pm2 save

echo "✅ Deployment complete!"
echo "📊 Check status: pm2 status"
echo "📝 View logs: pm2 logs calling-agent-api"

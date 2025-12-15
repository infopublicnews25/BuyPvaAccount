#!/bin/bash

# VPS Server Auto Update Script

echo "🚀 Starting BuyPvaAccount Live Server Update..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Navigate to project directory
cd /var/www/BuyPvaAccount || exit 1

echo "📁 Current Directory: $(pwd)"
echo ""

# Pull latest changes from GitHub
echo "📥 Pulling latest changes from GitHub..."
git pull origin main

if [ $? -ne 0 ]; then
    echo "❌ Git pull failed!"
    exit 1
fi
echo "✅ Git pull successful"
echo ""

# Install dependencies if package-lock.json changed
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "⚠️ NPM install had issues (might be normal)"
fi
echo "✅ Dependencies updated"
echo ""

# Restart PM2 app
echo "🔄 Restarting PM2 application..."
pm2 restart BuyPvaAccount

if [ $? -ne 0 ]; then
    echo "⚠️ PM2 restart might have issues, trying status..."
    pm2 status
fi
echo ""

# Show logs
echo "📋 Application Logs:"
pm2 logs BuyPvaAccount --lines 20

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Update Complete!"
echo "🌐 Live Server Updated from GitHub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

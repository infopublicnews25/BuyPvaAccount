#!/bin/bash

echo "========================================"
echo "   VPS DEPLOYMENT SCRIPT"
echo "   BuyPvaAccount - Bulk Upload Update"
echo "========================================"
echo

echo "Current directory: $(pwd)"
echo "Pulling latest code from GitHub..."
git pull origin main

if [ $? -eq 0 ]; then
    echo "✅ Git pull successful"
else
    echo "❌ Git pull failed"
    exit 1
fi

echo
echo "Installing dependencies..."
cd backend
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed"
else
    echo "❌ Dependency installation failed"
    exit 1
fi

cd ..
echo
echo "Restarting PM2 process..."
pm2 restart buypvaaccount

if [ $? -eq 0 ]; then
    echo "✅ PM2 restart successful"
else
    echo "❌ PM2 restart failed"
    exit 1
fi

echo
echo "Checking PM2 status..."
pm2 status
echo
echo "Recent PM2 logs:"
pm2 logs buypvaaccount --lines 5

echo
echo "Testing backend API..."
curl -s http://localhost:3000/api/status

echo
echo "========================================"
echo "DEPLOYMENT SUMMARY:"
echo "✅ Code pulled from GitHub"
echo "✅ Dependencies updated"
echo "✅ Server restarted"
echo "✅ PM2 status checked"
echo "========================================"
echo
echo "Test your website: https://buypvaaccount.com"
echo "Check bulk upload in admin dashboard!"
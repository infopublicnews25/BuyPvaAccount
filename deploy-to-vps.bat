@echo off
echo ========================================
echo    VPS DEPLOYMENT SCRIPT
echo    BuyPvaAccount - Bulk Upload Update
echo ========================================
echo.

echo Step 1: SSH into VPS...
echo Run this command in a new terminal:
echo ssh root@195.35.8.218
echo.

echo After SSH, run these commands on your VPS:
echo ------------------------------------------
echo cd /var/www/buypvaaccount.com
echo git pull origin main
echo cd backend && npm install && cd ..
echo pm2 restart buypvaaccount
echo pm2 status
echo pm2 logs buypvaaccount --lines 5
echo.

echo Step 2: Verify deployment...
echo Test commands:
echo curl http://localhost:3000/api/status
echo curl -I https://buypvaaccount.com/dashboard.html
echo.

echo ========================================
echo DEPLOYMENT COMPLETE CHECKLIST:
echo [ ] SSH successful
echo [ ] Git pull completed
echo [ ] Dependencies installed
echo [ ] PM2 restarted
echo [ ] Backend API responding
echo [ ] Frontend accessible
echo ========================================

pause
# Live Website Update Deployment Guide

## 🚀 Option 1: If Using GitHub Pages / Static Hosting

### Step 1: Verify Git Push
✅ Already done! Changes pushed to: `https://github.com/infopublicnews25/BuyPvaAccount`

### Step 2: Deploy to Production
If your website is on GitHub Pages:
- Push automatically deploys when you push to `main` branch ✅
- Website updates in 1-5 minutes

### Step 3: Clear Cache
- Browser: Press `Ctrl+Shift+Del` → Clear all
- Or hard refresh: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
- Check live site: https://buypvaaccount.com

---

## 🚀 Option 2: If Using VPS / Server Deployment

### Prerequisites:
- Server IP/Domain
- SSH access
- PM2 installed on server

### Step 1: SSH into Server
```bash
ssh user@your-server-ip
cd /var/www/buypvaaccount  # or your project path
```

### Step 2: Pull Latest Changes
```bash
git pull origin main
npm install  # if new dependencies
```

### Step 3: Restart Backend (PM2)
```bash
pm2 restart buypvaaccount
pm2 logs buypvaaccount
```

### Step 4: Verify Deployment
```bash
pm2 status
# Check if app is running
```

### Step 5: Test Live Website
- Visit: https://buypvaaccount.com
- Open Developer Console: F12
- Test notification system:
  1. Go to profile → Notifications tab
  2. Check if notifications appear

---

## 🚀 Option 3: Manual File Transfer (FTP/SFTP)

### Step 1: Compress Latest Changes
```bash
# On local machine
git pull origin main
```

### Step 2: Upload via SFTP
```bash
sftp user@server
cd /var/www/buypvaaccount
put -r *.html
put -r *.js
put -r backend/*
bye
```

### Step 3: Restart Services
```bash
ssh user@server
cd /var/www/buypvaaccount
pm2 restart buypvaaccount
```

---

## 📋 Changes in This Update

### Files Modified:
1. **admin.html** - Added notification test section
2. **profile.html** - Auto-sync and improved notifications
3. **ordermanagement.html** - Notification for all status changes
4. **New files:**
   - email-sync-test.html
   - test-notifications-realtime.html
   - test-notifications.html

### Features Added:
✅ Email synchronization (case-insensitive)
✅ Order integration with notifications
✅ Auto-sync on page load
✅ Improved notification matching
✅ Debug tools for testing

---

## ✅ Post-Deployment Testing

### 1. Test Notification System
```
1. Visit: https://buypvaaccount.com/admin.html
2. Go to Settings tab
3. Send test notification
4. Login to profile.html with same email
5. Check Notifications tab → Should see notification
```

### 2. Test Order Status Update
```
1. In ordermanagement.html
2. Change order status (Confirmed → Processing, etc)
3. Go to customer's profile
4. Check Notifications → Should have order status update
```

### 3. Check Email Sync
```
1. Visit: https://buypvaaccount.com/email-sync-test.html
2. Login with test account
3. Click "Test Email Matching"
4. Should show all orders and notifications matching email
```

---

## 🔍 Quick Deployment Status Check

```bash
# SSH into server
ssh user@your-server

# Check if backend is running
pm2 status

# Check logs for errors
pm2 logs buypvaaccount

# Check disk space
df -h

# Check memory usage
free -h
```

---

## ❓ What You Need to Provide:

Please let me know your deployment method:

1. **GitHub Pages?**
   - Already deployed automatically ✅

2. **VPS/Server?**
   - Server IP/Domain: _______________
   - SSH access: Yes/No
   - PM2 installed: Yes/No

3. **Other Hosting?**
   - Specify provider: _______________
   - FTP/SFTP access: Yes/No

---

## 🎯 Summary

The code is ready for production. You just need to:

1. Tell me your hosting setup
2. I'll provide exact deployment commands
3. Or you can manually pull changes and restart PM2

**Changes are already in GitHub:** `https://github.com/infopublicnews25/BuyPvaAccount`

All notification improvements are ready to go live! 🚀

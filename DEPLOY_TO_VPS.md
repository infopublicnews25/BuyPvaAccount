# 🚀 VPS Deployment Guide

**Date**: December 14, 2025  
**Status**: ✅ READY TO DEPLOY

---

## 📋 Pre-Deployment Checklist

- [ ] VPS access via SSH
- [ ] Git installed on VPS
- [ ] Node.js running
- [ ] Backend server (port 3000)
- [ ] Frontend files served (Nginx/Apache)
- [ ] Domain configured (buypvaaccount.com)

---

## 🔧 Quick Deploy (5 minutes)

### **Step 1: SSH into VPS**
```bash
ssh root@YOUR_VPS_IP
# or
ssh user@YOUR_VPS_IP
```

### **Step 2: Navigate to Project Directory**
```bash
cd /path/to/BuyPvaAccount
# Common paths:
# /var/www/buypvaaccount.com
# /home/user/buypvaaccount
# /opt/buypvaaccount
```

### **Step 3: Pull Latest Code**
```bash
git pull origin main
```

### **Step 4: Install Dependencies (if needed)**
```bash
cd backend
npm install
cd ..
```

### **Step 5: Restart Backend Server**

**Option A: Using PM2** (Recommended)
```bash
pm2 restart server
pm2 logs server
```

**Option B: Using systemd**
```bash
sudo systemctl restart buypvaaccount
sudo systemctl status buypvaaccount
```

**Option C: Using screen/tmux**
```bash
# Kill old process
pkill -f "node backend/server.js"
# Start new
nohup node backend/server.js > backend.log 2>&1 &
```

### **Step 6: Verify Deployment**
```bash
# Check backend running
curl http://localhost:3000/api/status

# Check frontend
curl https://buypvaaccount.com/index.html
```

---

## 📝 Files Changed in This Update

### Frontend Files (Auto-deployed with Nginx/Apache)
```
✅ user-management.html
✅ profile.html
✅ login.html
✅ signup.html
✅ forgot-password.html
✅ admin.html
✅ ordermanagement.html
✅ config.js
```

### Backend Files
```
✅ backend/server.js
✅ backend/package.json
```

### New Files Added
```
✅ debug-signup.html
✅ signup-success.html
✅ test-signup-flow.html
```

### JSON Data Files
```
✅ registered_users.json
✅ orders.json
✅ admin_users.json
```

---

## 🔍 What Was Updated

### 1. **Production API Configuration** ✅
- Fixed hardcoded `localhost:3000` references
- Now uses `config.js` for environment detection
- Automatic API URL based on domain

### 2. **User Management Security** ✅
- Admin-only access with token verification
- Server-side validation of admin role
- Access denied message for non-admins

### 3. **Order Tracking Sync** ✅
- Real-time tracking updates in profile
- Auto-refresh every 3 seconds
- Storage event broadcasting

### 4. **Email System** ✅
- Signup confirmation emails
- Password reset emails
- Uses .env for credentials

---

## 🛠️ Nginx Configuration (If Not Already Set)

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name buypvaaccount.com www.buypvaaccount.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Redirect HTTP to HTTPS
    if ($scheme != "https") {
        return 301 https://$server_name$request_uri;
    }

    root /var/www/buypvaaccount.com;
    index index.html;

    # Frontend files
    location / {
        try_files $uri $uri/ /index.html;
        expires 1h;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Cache static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Disable .env access
    location ~ /\.env {
        deny all;
    }
}
```

---

## 📦 PM2 Configuration (Recommended)

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'server',
      script: './backend/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
```

**Start with PM2:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 🔐 Environment Variables (.env)

Make sure VPS has `.env` file in project root:

```env
# Email Configuration
EMAIL_USER=info.buypvaaccount@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_PROVIDER=gmail

# Database
DB_PATH=./orders.json
USERS_DB=./registered_users.json

# Server
PORT=3000
NODE_ENV=production

# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
```

**⚠️ IMPORTANT**: 
- Keep `.env` file **NEVER** in Git
- Add `.env` to `.gitignore`
- Create `.env` manually on VPS

---

## ✅ Verification Steps

### 1. Check Backend Status
```bash
curl http://localhost:3000/api/status
# Should return: {"status":"OK",...}
```

### 2. Check Frontend
```bash
curl -I https://buypvaaccount.com
# Should return: 200 OK
```

### 3. Test API Endpoint
```bash
curl -X POST https://buypvaaccount.com/api/signup \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test","email":"test@test.com","password":"Test123"}'
```

### 4. Check Email Service
```bash
# Look for email logs
tail -f backend.log | grep -i email
```

### 5. Monitor PM2
```bash
pm2 monit
pm2 logs
pm2 status
```

---

## 🐛 Troubleshooting

### Issue: "Cannot GET /api/..."
**Solution**: Backend not running
```bash
pm2 start ecosystem.config.js
pm2 logs
```

### Issue: "Mixed Content" error
**Solution**: Frontend trying to access http:// API from https://
- Check config.js (should auto-detect)
- Verify Nginx proxy_pass is correct

### Issue: Email not sending
**Solution**: Check .env credentials
```bash
# Test SMTP
npm test-email
```

### Issue: 404 on frontend files
**Solution**: Files not deployed
```bash
# Check files exist
ls -la /var/www/buypvaaccount.com/
# Verify ownership
sudo chown -R www-data:www-data /var/www/buypvaaccount.com/
```

### Issue: Cannot connect to server
**Solution**: Firewall/Port blocking
```bash
# Check if port 3000 is open
sudo ufw allow 3000
# Or check with netstat
sudo netstat -tlnp | grep 3000
```

---

## 📊 Deployment Checklist

- [ ] SSH into VPS
- [ ] Navigate to project directory
- [ ] `git pull origin main`
- [ ] Install dependencies: `npm install`
- [ ] Update .env file with production values
- [ ] Restart backend: `pm2 restart server`
- [ ] Check logs: `pm2 logs`
- [ ] Test API: `curl http://localhost:3000/api/status`
- [ ] Test frontend: Visit https://buypvaaccount.com
- [ ] Test signup: Create test account
- [ ] Check email: Verify confirmation email received
- [ ] Check tracking: Verify order tracking works
- [ ] Check admin: Test user-management access
- [ ] Monitor logs: Watch for errors

---

## 🎯 Post-Deployment

### Monitor Backend
```bash
# Real-time logs
pm2 logs server

# View errors
pm2 logs server --err

# Monitor resources
pm2 monit
```

### Check Performance
```bash
# Verify response time
curl -w "@curl-format.txt" -o /dev/null -s https://buypvaaccount.com

# Check server load
top
free -h
```

### Backup Data
```bash
# Backup user data
cp registered_users.json registered_users.json.backup

# Backup orders
cp orders.json orders.json.backup

# Backup admin users
cp admin_users.json admin_users.json.backup
```

---

## 📞 Emergency Rollback

If something breaks:

```bash
# Stop server
pm2 stop server

# Go back to previous version
git log --oneline
git checkout ab8a6ff  # Previous commit

# Restart
pm2 start server
```

---

## 🚀 Success Indicators

✅ All pages load  
✅ Login works  
✅ Signup works with email  
✅ Order tracking shows status  
✅ Admin can access user-management  
✅ No console errors  
✅ Backend logs show no errors  
✅ Email service active  

---

## 📞 Support

**If something goes wrong:**

1. Check logs: `pm2 logs server`
2. Check status: `pm2 status`
3. Check firewall: `sudo ufw status`
4. Check DNS: `nslookup buypvaaccount.com`
5. Restart: `pm2 restart server`

---

**Status**: ✅ **READY TO DEPLOY**

All changes are in GitHub. Pull latest code and restart backend server!


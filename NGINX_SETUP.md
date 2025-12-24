# Nginx Reverse Proxy Configuration for BuyPvaAccount

## Production Server Setup

### 1. Nginx Configuration Example

Place this in `/etc/nginx/sites-available/buypvaaccount` (or equivalent path):

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name buypvaaccount.com www.buypvaaccount.com;
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Configuration
server {
    listen 443 ssl http2;
    server_name buypvaaccount.com www.buypvaaccount.com;

    # SSL Certificate Configuration
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Static Files (Frontend)
    location / {
        root /home/username/buypvaaccount;
        # Clean URLs:
        # - /contact -> /contact.html
        # - /marketplace -> /marketplace.html
        try_files $uri $uri.html $uri/ /marketplace.html;
        expires 1d;
        add_header Cache-Control "public, max-age=86400";
    }

    # Redirect explicit .html URLs to clean URLs
    rewrite ^/(.*)\.html$ /$1 permanent;

    # API Reverse Proxy (Node.js Backend)
    location /api/ {
        # Proxy to local Node.js server
        proxy_pass http://localhost:3000;
        
        # Proxy Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket Support (if needed)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Uploads Directory (if storing files)
    location /uploads/ {
        alias /home/username/buypvaaccount/uploads/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }

    location ~ /\.env {
        deny all;
    }

    location ~ /admin-credentials.json {
        deny all;
    }

    location ~ /registered_users.json {
        deny all;
    }

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;
    gzip_vary on;
    gzip_disable "MSIE [1-6]\.";
}
```

### 2. Enable the Configuration

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/buypvaaccount /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 3. Node.js Backend Setup (on production server)

```bash
# Navigate to project directory
cd /home/username/buypvaaccount

# Install dependencies
npm install

# Start backend server (use PM2 for persistent process)
npm install -g pm2

# Create PM2 startup configuration
pm2 start backend/server.js --name "buypvaaccount-api"
pm2 startup
pm2 save

# Verify it's running
pm2 status
```

### 4. Environment File (.env)

Ensure production `.env` has:
```dotenv
NODE_ENV=production
PORT=3000
EMAIL_USER=info.buypva@gmail.com
EMAIL_PASSWORD=gmxeltypsbsqrfrr
EMAIL_PROVIDER=gmail
```

## 🔍 Verification Steps

### Test the Setup:

1. **Check Nginx is running:**
   ```bash
   sudo systemctl status nginx
   ```

2. **Check Node.js is running:**
   ```bash
   pm2 status
   ```

3. **Test API endpoint:**
   ```bash
   curl https://buypvaaccount.com/api/health
   ```

4. **Test password reset:**
   - Visit `https://buypvaaccount.com/forgot-password.html`
   - Open DevTools (F12)
   - Console should show: `API Backend: https://buypvaaccount.com/api`
   - Send password reset request
   - Check email inbox

## 📊 Monitoring & Logs

### Nginx Logs:
```bash
# Access logs
tail -f /var/log/nginx/access.log

# Error logs
tail -f /var/log/nginx/error.log
```

### Application Logs:
```bash
# View PM2 logs
pm2 logs buypvaaccount-api

# Real-time logs
pm2 logs buypvaaccount-api --lines 100
```

## 🔄 Updating Production

When updating code:

```bash
# Pull latest changes
cd /home/username/buypvaaccount
git pull

# Restart backend
pm2 restart buypvaaccount-api

# Clear browser cache if needed
# (Nginx cache invalidation if implemented)
```

## 🚨 Troubleshooting

### 404 on /api endpoints
- Check if Node.js backend is running: `pm2 status`
- Verify Nginx proxy_pass is correct
- Check firewall isn't blocking port 3000

### CORS errors
- Verify frontend origin matches CORS whitelist in backend
- Check HTTPS is being used correctly
- Review server.js CORS configuration

### Email not sending
- Check `.env` email credentials
- Verify Gmail app password is correct
- Check backend logs: `pm2 logs buypvaaccount-api`

### High latency
- Check Node.js server logs
- Monitor server resources: `top`, `free -h`
- Consider adding load balancing if needed

---

**Configuration Version**: 1.0
**Last Updated**: December 14, 2025

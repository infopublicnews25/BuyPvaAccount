# 🚀 Production Deployment Checklist

## Pre-Deployment Tasks

### ✅ Security & Configuration
- [x] Update nodemailer to latest secure version
- [x] Generate strong JWT secret
- [x] Create .gitignore file
- [x] Install security packages (helmet, express-rate-limit, express-validator)
- [x] Install performance packages (compression)
- [x] Create production environment file (.env.production)

### 🔧 Environment Setup
- [ ] Copy `.env.production` to `.env` on server
- [ ] Update EMAIL_USER and EMAIL_PASSWORD with production Gmail credentials
- [ ] Set NODE_ENV=production
- [ ] Configure ALLOWED_ORIGINS with your domain
- [ ] Set up proper file permissions (chmod 600 .env)

### 🛡️ Server Security
- [ ] Use HTTPS (SSL certificate)
- [ ] Configure firewall (allow only ports 80, 443, 22)
- [ ] Set up fail2ban for SSH protection
- [ ] Disable root SSH login
- [ ] Install security updates: `sudo apt update && sudo apt upgrade`

### 📊 Database & Files
- [ ] Create backup of all JSON files
- [ ] Set up automated backups (daily)
- [ ] Configure proper file permissions for uploads/ directory
- [ ] Test file upload functionality

### 🔍 Testing
- [ ] Test all API endpoints
- [ ] Test email sending functionality
- [ ] Test file uploads
- [ ] Test admin panel access
- [ ] Test user registration/login
- [ ] Test cart functionality
- [ ] Test all language versions

### 📈 Performance
- [ ] Enable gzip compression
- [ ] Set up CDN for static assets (optional)
- [ ] Configure proper caching headers
- [ ] Test page load times

### 📋 Monitoring & Logging
- [ ] Set up log rotation
- [ ] Configure error monitoring
- [ ] Set up uptime monitoring
- [ ] Configure email alerts for server issues

## Deployment Steps

### 1. Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application directory
sudo mkdir -p /var/www/buypvaaccount
sudo chown -R $USER:$USER /var/www/buypvaaccount
```

### 2. Upload Files
```bash
# Upload project files to server
scp -r ./* user@your-server:/var/www/buypvaaccount/
```

### 3. Server Configuration
```bash
cd /var/www/buypvaaccount/backend

# Install dependencies
npm install --production

# Configure environment
cp .env.production .env
nano .env  # Edit with production values

# Set proper permissions
chmod 600 .env
chmod 755 uploads/
```

### 4. Start Application
```bash
# Using PM2 for production
pm2 start ecosystem.config.js

# Or using npm
npm run production

# Save PM2 configuration
pm2 save
pm2 startup
```

### 5. Web Server Configuration (Nginx)
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL configuration
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Static files
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Optional: redirect explicit .html URLs to clean URLs
    # Example: /contact.html -> /contact
    rewrite ^/(.*)\.html$ /$1 permanent;

    # File uploads
    location /uploads/ {
        alias /var/www/buypvaaccount/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 6. SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Set up auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Post-Deployment Verification

### ✅ Functionality Tests
- [ ] Website loads correctly
- [ ] All pages accessible
- [ ] Language switching works
- [ ] Cart functionality works
- [ ] Admin panel accessible
- [ ] Email sending works
- [ ] File uploads work

### ✅ Security Tests
- [ ] HTTPS enabled
- [ ] Security headers present
- [ ] Admin routes protected
- [ ] Rate limiting working
- [ ] No sensitive data exposed

### ✅ Performance Tests
- [ ] Page load times acceptable
- [ ] Images optimized
- [ ] Compression working
- [ ] No console errors

## Emergency Contacts

- **Hosting Provider Support:**
- **Domain Registrar:**
- **SSL Certificate Issuer:**
- **Email Provider (Gmail):**

## Rollback Plan

If deployment fails:
1. Stop PM2 process: `pm2 stop all`
2. Restore backup files
3. Restart with previous version
4. Check logs for error details

## Monitoring Commands

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs

# Monitor resources
pm2 monit

# Restart application
pm2 restart buypvaaccount

# Check server resources
htop
df -h
free -h
```
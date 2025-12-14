# Password Reset Feature - Production Deployment Guide

## ✅ Configuration Status

### Frontend (config.js)
- ✅ Automatic API endpoint detection
- ✅ Development mode: Uses `http://localhost:3000/api`
- ✅ Production mode: Uses `https://buypvaaccount.com/api`
- ✅ Supports both localhost and domain-based access

### Backend (server.js)
- ✅ CORS configured for production domain
- ✅ Allowed origins: `https://buypvaaccount.com`, `https://www.buypvaaccount.com`
- ✅ Email service configured and tested
- ✅ Rate limiting enabled
- ✅ Security headers configured

### Environment (.env)
- ✅ NODE_ENV=production
- ✅ Email configured: `info.buypva@gmail.com`
- ✅ All security settings in place

## 🚀 Production Deployment Checklist

### Before Going Live:

1. **Server Setup**
   - [ ] Deploy Node.js backend to production server
   - [ ] Ensure port 3000 (or configured port) is accessible internally
   - [ ] Set up reverse proxy (Nginx) to forward `/api` requests to backend
   - [ ] Enable HTTPS/SSL certificate

2. **Domain Configuration**
   - [ ] Update DNS records if needed
   - [ ] Ensure `buypvaaccount.com` resolves correctly
   - [ ] Test both `buypvaaccount.com` and `www.buypvaaccount.com`

3. **Email Setup**
   - [ ] Verify Gmail app password: `gmxeltypsbsqrfrr`
   - [ ] Check Gmail security settings for "Less secure apps" or use App Password
   - [ ] Test sending emails to multiple recipients
   - [ ] Set up email monitoring/logging

4. **SSL/TLS**
   - [ ] Obtain SSL certificate for domain
   - [ ] Configure Nginx to use SSL
   - [ ] Redirect HTTP to HTTPS
   - [ ] Test CORS with HTTPS endpoints

## 🧪 Testing on Production

### Access Points:
- Frontend: `https://buypvaaccount.com/forgot-password.html`
- API Backend: `https://buypvaaccount.com/api` (via Nginx reverse proxy)

### Test Steps:
1. Visit `https://buypvaaccount.com/forgot-password.html`
2. Enter a test email address
3. Check console (F12) for logs
4. Verify email is received
5. Complete password reset flow
6. Test new password with login

## 📋 Endpoints Configuration

### Frontend API Calls:
```javascript
// These will automatically resolve to production endpoints
${API}/send-reset-code      // → https://buypvaaccount.com/api/send-reset-code
${API}/reset-password       // → https://buypvaaccount.com/api/reset-password
```

### Backend Routes:
- `POST /api/send-reset-code` - Send verification code
- `POST /api/reset-password` - Update password

## 🔒 Security Notes

1. **CORS**: Only specific domains allowed in production
2. **Rate Limiting**: 5 attempts per 15 minutes for auth endpoints
3. **Passwords**: Hashed with bcrypt (12 rounds)
4. **Email**: Not exposed in API responses
5. **HTTPS**: Required for production

## 🐛 Troubleshooting Production Issues

### "Email service unavailable" error
- Check if Node.js backend is running
- Verify email configuration in `.env`
- Check Gmail app password is correct
- Review backend logs for error details

### CORS errors in browser console
- Verify frontend and backend domains match CORS whitelist
- Check if using HTTPS/HTTP consistently
- Review browser console error for exact origin

### 404 errors
- Verify API endpoints don't have duplicate `/api`
- Check CONFIG.API is built correctly
- Ensure backend routes are registered

## 📊 Monitoring

### Logs to Monitor:
- Backend logs: Check for `📨 Received password reset request`
- Email delivery: Check for `✅ Reset code sent to:`
- CORS issues: Check for `Access-Control` headers in responses

### Metrics to Track:
- Email delivery success rate
- Password reset completion rate
- API response times
- Failed authentication attempts

## 📞 Support Contact

If issues occur on production:
1. Check backend logs first
2. Verify email configuration
3. Test with console logs enabled
4. Review network requests in DevTools

---

**Last Updated**: December 14, 2025
**Status**: Ready for Production Deployment ✅

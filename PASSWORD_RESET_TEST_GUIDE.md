# Password Reset Email Service - Test Guide

## ✅ Email Service Status

The password reset email service has been **TESTED AND VERIFIED WORKING**:

- ✅ Test email sent successfully to `createsads@gmail.com`
- ✅ Gmail SMTP connection verified
- ✅ Backend server is running on `http://localhost:3000`
- ✅ Email endpoint `/api/send-reset-code` is operational

## 🧪 Testing Instructions

### Step 1: Open Forgot Password Page
1. Open your browser
2. Go to: `http://localhost:3000/forgot-password.html`

### Step 2: Enter Email Address
1. Enter any email address in the form
2. Click "Send Verification Code"

### Step 3: Monitor the Request
**Important:** Open Developer Console (Press `F12`) to see detailed logs:
- `📤 Sending password reset email to: [email]`
- `🔐 Using verification code: [6-digit code]`
- `📡 API endpoint: http://localhost:3000/api/send-reset-code`
- `📨 Response status: 200`
- `✅ Server response: { success: true, message: "..." }`

### Step 4: Check Email
1. Check the inbox of the email address you entered
2. Look for email from: **info.buypva@gmail.com**
3. Subject: **Password Reset Verification Code - BuyPvaAccount**
4. The 6-digit code will be displayed in the email

### Step 5: Complete Password Reset
1. Enter the verification code from the email
2. Create a new password (minimum 6 characters)
3. Confirm the new password
4. Click "Reset Password"

## 🔍 Troubleshooting

### If you don't receive the email:

1. **Check Console (F12):**
   - Look for `✅ Server response: { success: true }`
   - If you see this, the email was sent from the backend

2. **Check Spam Folder:**
   - Gmail might filter emails from the service
   - Add `info.buypva@gmail.com` to contacts

3. **Check Email Logs:**
   - The backend logs all email activities
   - Check the terminal running `node server.js`

### If API is unreachable:

1. **Verify Server is Running:**
   ```powershell
   netstat -ano | Select-String "3000"
   ```
   Should show a listening port

2. **Restart Server if needed:**
   ```powershell
   cd "c:\Users\Khan Saheb On\Project Work\BuyPvaAccount\backend"
   node server.js
   ```

3. **Check CORS Settings:**
   - Frontend running on: `http://localhost:3000` (or appropriate domain)
   - API backend also on: `http://localhost:3000`
   - CORS is enabled in server.js

## 📧 Email Configuration Details

**Configured Email Account:**
- Email: `info.buypva@gmail.com`
- Provider: `Gmail SMTP`
- Configuration File: `backend/.env`

**What Gets Sent in the Email:**
- 6-digit verification code
- Code expiration time (10 minutes)
- Security warning
- Branded with BuyPvaAccount logo

## 🔐 Security Features

✅ Codes expire after 10 minutes
✅ Maximum 3 failed attempts before requiring code resend
✅ Passwords hashed with bcrypt
✅ Rate limiting on API endpoints
✅ CORS protection enabled
✅ Security headers configured

## 📝 Quick Reference

**Backend API Endpoint:** `POST /api/send-reset-code`

Request body:
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

Response:
```json
{
  "success": true,
  "message": "Verification code sent successfully"
}
```

---

**Last Updated:** December 14, 2025
**Test Status:** ✅ VERIFIED WORKING

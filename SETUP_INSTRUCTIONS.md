# 🚀 Complete Setup Guide - Password Reset Email Backend

## Step 1: Install Node.js

1. Download Node.js from: https://nodejs.org/
2. Choose **LTS version** (recommended)
3. Run the installer
4. Keep clicking **Next** with default options
5. Restart your computer after installation

**Verify installation:**
Open PowerShell and run:
```bash
node --version
npm --version
```
You should see version numbers like v18.x.x and 9.x.x

---

## Step 2: Get Gmail App Password

1. Go to: https://myaccount.google.com/security
2. Enable **2-Step Verification** (if not already enabled)
3. After enabling 2FA, go to: https://myaccount.google.com/apppasswords
4. Click **Select app** → Choose **Mail**
5. Click **Select device** → Choose **Other (Custom name)**
6. Type: "BuyPvaAccount"
7. Click **Generate**
8. **COPY the 16-character password** (looks like: xxxx xxxx xxxx xxxx)

---

## Step 3: Configure Backend

1. Open file: `backend\.env`
2. Update with your information:

```env
EMAIL_USER=your-actual-email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
PORT=3000
```

**Example:**
```env
EMAIL_USER=johndoe123@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
PORT=3000
```

---

## Step 4: Install Backend Dependencies

Open PowerShell in your project folder and run:

```bash
cd backend
npm install
```

This will install:
- express (web server)
- nodemailer (email sending)
- cors (allow frontend to connect)
- dotenv (environment variables)

---

## Step 5: Start the Backend Server

**Option A: Normal mode**
```bash
npm start
```

**Option B: Development mode (auto-restart on changes)**
```bash
npm run dev
```

**You should see:**
```
🚀 Password reset server running on http://localhost:3000
📧 Ready to send emails from: youremail@gmail.com
✅ Email server is ready to send messages
```

---

## Step 6: Test Email Sending

### Method 1: Open your website
1. Keep the backend server running
2. Open `forgot-password.html` in your browser
3. Enter an email that exists in your system
4. Click "Send Verification Code"
5. Check your email inbox!

### Method 2: Test via browser console
Open browser console (F12) and paste:

```javascript
fetch('http://localhost:3000/api/send-reset-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: 'test@example.com',
        code: '123456'
    })
})
.then(res => res.json())
.then(data => console.log(data));
```

---

## ✅ Checklist

- [ ] Node.js installed and verified (`node --version`)
- [ ] Gmail 2-Step Verification enabled
- [ ] Gmail App Password generated (16 characters)
- [ ] `.env` file updated with your email and app password
- [ ] Dependencies installed (`npm install` completed successfully)
- [ ] Backend server running (`npm start`)
- [ ] Test email received in inbox

---

## 🔧 Troubleshooting

### Error: "npm not found"
- Node.js not installed or not in PATH
- **Solution:** Install Node.js from https://nodejs.org/ and restart computer

### Error: "Invalid login"
- Wrong Gmail password or using regular password instead of App Password
- **Solution:** Generate new App Password from Google Account settings

### Error: "ECONNREFUSED"
- Backend server not running
- **Solution:** Make sure you ran `npm start` in the backend folder

### Error: "Port 3000 already in use"
- Another app is using port 3000
- **Solution:** Change PORT in `.env` file to 3001 or 5000

### Email not arriving
- Check spam/junk folder
- Verify EMAIL_USER in `.env` is correct
- Check backend terminal for error messages
- Try generating new App Password

---

## 📝 Important Notes

1. **Keep backend running:** The backend server must be running for emails to be sent
2. **Security:** Never share your `.env` file or App Password
3. **Production:** When deploying to production, change `BACKEND_URL` in forgot-password.html to your server address
4. **Free limits:** Gmail allows 500 emails per day for free accounts

---

## 🌐 Production Deployment (Later)

When ready to deploy:
1. Host backend on a service (Heroku, Railway, Render, etc.)
2. Update `BACKEND_URL` in `forgot-password.html` to your server URL
3. Add your domain to CORS whitelist in `server.js`
4. Use environment variables on hosting platform

---

Need help? Check the terminal output for error messages!

# BuyPvaAccount Backend - Password Reset Email Service

This backend server handles sending password reset verification codes via email.

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Gmail App Password

**Important:** You need a Gmail App Password (not your regular Gmail password)

#### Steps to get Gmail App Password:
1. Go to your Google Account: https://myaccount.google.com/
2. Click **Security** (left sidebar)
3. Enable **2-Step Verification** (if not already enabled)
4. After enabling 2FA, go back to Security
5. Search for **App passwords** or go to: https://myaccount.google.com/apppasswords
6. Click **Select app** → Choose **Mail**
7. Click **Select device** → Choose **Other (Custom name)**
8. Enter: "BuyPvaAccount"
9. Click **Generate**
10. Copy the 16-character password (format: xxxx xxxx xxxx xxxx)

### 3. Update .env File
Edit the `.env` file in the `backend` folder:

```env
EMAIL_USER=youremail@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
PORT=3000
```

Replace:
- `youremail@gmail.com` with your actual Gmail address
- `xxxx xxxx xxxx xxxx` with the 16-character App Password you generated

### 4. Start the Server

**Development mode (auto-restart on changes):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

You should see:
```
🚀 Password reset server running on http://localhost:3000
📧 Ready to send emails from: youremail@gmail.com
✅ Email server is ready to send messages
```

### 5. Test the Server

Open browser and go to: http://localhost:3000/api/health

You should see: `{"status":"OK","message":"Password reset server is running"}`

## API Endpoints

### Health Check
```
GET http://localhost:3000/api/health
```

### Send Reset Code
```
POST http://localhost:3000/api/send-reset-code
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Verification code sent successfully"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Failed to send verification code"
}
```

## Security Notes

- Never commit `.env` file to git
- Use App Password, not your main Gmail password
- Keep your App Password secret
- The server uses CORS to allow frontend requests

## Troubleshooting

### Error: "Invalid login"
- Make sure you're using Gmail App Password, not regular password
- Check that 2-Step Verification is enabled
- Regenerate App Password if needed

### Error: "ECONNREFUSED"
- Check your internet connection
- Try disabling antivirus/firewall temporarily
- Make sure Gmail isn't blocking the connection

### Port already in use
- Change PORT in .env file to another number (e.g., 3001, 5000)

## Frontend Integration

The frontend (forgot-password.html) is already configured to connect to this backend server.

Make sure the backend is running before testing password reset functionality.

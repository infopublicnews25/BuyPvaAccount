# Setting Up Personal Email Sending

Since Gmail and Outlook require App Passwords (which need 2FA), here are your options:

## Option 1: Enable Outlook SMTP (Recommended)

Your Outlook account needs to allow SMTP authentication:

1. Go to: https://outlook.live.com/mail/options/mail/accounts
2. Click on **"Forwarding and POP/IMAP"**
3. Enable **"Let devices and apps use POP"**
4. Save changes

Then your backend should work with your current credentials!

## Option 2: Use Gmail with App Password

1. Use your Gmail account instead
2. Go to: https://myaccount.google.com/security
3. Enable 2-Step Verification
4. Create App Password at: https://myaccount.google.com/apppasswords
5. Update .env with Gmail and App Password

## Option 3: Use Free SMTP2GO (100 emails/day)

1. Sign up at: https://www.smtp2go.com/pricing/ (Free tier)
2. Verify your email
3. Get SMTP credentials from dashboard
4. Update .env:
```
EMAIL_USER=your-smtp2go-username
EMAIL_PASSWORD=your-smtp2go-password
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
```

## Option 4: Keep Current System (Terminal-Based)

The current "simple mode" works perfectly for development:
- Codes appear in terminal
- You manually send codes to users
- No email configuration needed
- Fully functional for testing

---

**Which option would you like to try?**

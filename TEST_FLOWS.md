# BuyPvaAccount User System - Complete Test Flows

## System Overview
- **Signup**: Users can register with email, password, phone, country
- **Login**: Registered users can login with email + password
- **Forgot Password**: Users can reset password via email verification code
- **Auto Member**: When users place order without being members, they auto-become members with temporary password
- **Profile**: Logged-in users see their profile with order history

---

## Test Flow 1: Normal Signup → Login → Profile

### Prerequisites
- Backend server running on http://localhost:3000
- Fresh browser (clear localStorage)

### Steps
1. Go to http://localhost:3000/signup.html
2. Fill form:
   - Full Name: `Test User One`
   - Email: `test.user.one@example.com`
   - Phone: `+880179XXXXXXXX`
   - Country: `Bangladesh`
   - Password: `SecurePass123!`
   - Confirm Password: `SecurePass123!`
3. Click "Create Account"
4. Expected: Success message → Redirected to profile.html
5. Verify: User data shows in profile page

### Then: Login as this user
1. Logout or clear localStorage
2. Go to http://localhost:3000/login.html
3. Enter:
   - Email: `test.user.one@example.com`
   - Password: `SecurePass123!`
4. Click "Login"
5. Expected: Success message → Redirected to profile.html
6. Verify: Same user data shows in profile

---

## Test Flow 2: Forgot Password → Password Reset → Login

### Prerequisites
- User from Test Flow 1 exists (or use any registered user)

### Steps
1. Go to http://localhost:3000/login.html
2. Click "Forgot password?"
3. On reset page, enter email: `test.user.one@example.com`
4. Click "Send Verification Code"
5. Check console (F12) for verification code (email service may show fallback)
6. Enter the 6-digit code in verification field
7. Click "Verify Code"
8. Expected: Code verified message
9. Enter new password: `NewPassword456!`
10. Confirm new password: `NewPassword456!`
11. Click "Reset Password"
12. Expected: Success message → Redirected to login.html

### Then: Login with new password
1. Enter email and new password
2. Expected: Successful login with new credentials

---

## Test Flow 3: Order Without Account → Auto Member Creation → Forgot Password

### Prerequisites
- Clear localStorage (simulate non-member user)
- Fresh browser session

### Steps
1. Go to http://localhost:3000/Cartpage.html or marketplace.html
2. Add products to cart
3. Go to http://localhost:3000/Checkout.html
4. Fill billing details:
   - First Name: `Auto`
   - Last Name: `Member`
   - Email: `auto.member@example.com`
   - Phone: `+880179XXXXXXXX`
   - Country: `Bangladesh`
5. Select payment method: `COD` or `Crypto`
6. Check "I agree to terms"
7. Click "Place Order"
8. Expected: Order success page with order ID
9. User should be auto-registered in backend

### Then: Access Profile as newly created member
1. Go to http://localhost:3000/profile.html
2. Expected: Profile shows with order data (auto-created user might show limited info)

### Then: Reset password for auto-created user
1. Go to http://localhost:3000/forgot-password.html
2. Enter email: `auto.member@example.com`
3. Send verification code
4. Verify code with console code
5. Set new password
6. Go back to login.html
7. Login with new password
8. Expected: Successful login

---

## Test Flow 4: Duplicate Email Prevention

### Prerequisites
- Test user exists: `test.user.one@example.com`

### Steps
1. Go to signup.html
2. Try to register with same email: `test.user.one@example.com`
3. Fill other fields
4. Click "Create Account"
5. Expected: Error message "An account with this email already exists"

---

## Test Flow 5: Password Validation

### Prerequisites
- Fresh signup.html page

### Steps
1. Go to signup.html
2. Test Case A: Short password
   - Fill all fields
   - Enter password: `abc`
   - Expected: Error "Password must be at least 6 characters"
3. Test Case B: Non-matching passwords
   - Password: `SecurePass123!`
   - Confirm: `DifferentPass123!`
   - Expected: Error "Passwords do not match"
3. Test Case C: Valid password
   - Both fields same with 6+ chars
   - Should proceed to registration

---

## Test Flow 6: Login Validation

### Prerequisites
- Registered user exists

### Steps
1. Go to login.html
2. Test Case A: Wrong password
   - Correct email, wrong password
   - Expected: Error "Incorrect password"
3. Test Case B: Non-existent email
   - Non-registered email
   - Expected: Error "No account found with this email"
4. Test Case C: Correct credentials
   - Should login successfully

---

## Backend Verification

### Check registered_users.json
```bash
# Backend directory
cat ../registered_users.json | jq '.'
```

Expected structure:
```json
[
  {
    "fullName": "Test User One",
    "email": "test.user.one@example.com",
    "phone": "+880179XXXXXXXX",
    "country": "Bangladesh",
    "authType": "email",
    "passwordHash": "$2b$12$...",
    "passwordMigrated": true,
    "passwordMigratedAt": "2025-12-14T...",
    "createdAt": "2025-12-14T..."
  },
  {
    "fullName": "Auto Member",
    "email": "auto.member@example.com",
    "phone": "+880179XXXXXXXX",
    "country": "Bangladesh",
    "authType": "email",
    "autoCreated": true,
    "passwordHash": "$2b$12$...",
    "passwordMigrated": true,
    "passwordMigratedAt": "2025-12-14T...",
    "createdAt": "2025-12-14T..."
  }
]
```

---

## Summary of Features

✅ **Signup System**
- User registration with bcrypt password hashing
- Email validation
- Phone and country collection
- Password strength checking
- Duplicate email prevention

✅ **Login System**
- Email + password authentication
- Client auth storage (localStorage)
- Profile redirection
- Error handling for invalid credentials

✅ **Password Reset System**
- Email-based verification code
- Code expiration (10 minutes)
- Attempt limiting
- Resend code functionality
- Bcrypt password update in database

✅ **Auto Member System**
- Automatic registration on order checkout
- Temporary password generation
- Password reset capability via forgot-password
- Profile access for auto-created members

✅ **Profile System**
- User data display
- Order history
- Member verification

---

## Known Limitations & Notes

1. **Email Service**: If email provider not configured, verification codes appear in browser console (F12)
2. **Password Storage**: All passwords are bcrypt hashed (SHA-256 for backward compatibility)
3. **Auto-created Users**: Cannot login until they reset password (secure design)
4. **Session**: Uses localStorage (client-side). No server-side session required
5. **CORS**: Backend has CORS enabled for frontend communication

---

## Troubleshooting

### Issue: Signup fails with "Unable to contact server"
- Check if backend is running: `node backend/server.js`
- Check console (F12) for detailed error
- Verify CONFIG.API in config.js points to correct backend URL

### Issue: Email not being sent
- Check backend logs for email service errors
- Email service must be configured in backend/.env
- Fallback: Codes appear in console (F12)

### Issue: Login page not recognizing registered user
- Check registered_users.json for user existence
- Check email is lowercase
- Verify password is hashed in database

### Issue: Forgot password code not working
- Code expires after 10 minutes
- Only 3 attempts allowed (then must resend)
- Check console (F12) if email service unavailable

---

## API Endpoints Summary

### Client-Facing Endpoints
- `POST /api/signup` - Register new user
- `POST /api/login` - Authenticate user
- `POST /api/auto-register` - Auto-register user from checkout
- `POST /api/send-reset-code` - Send password reset code via email
- `POST /api/reset-password` - Update password after verification

---

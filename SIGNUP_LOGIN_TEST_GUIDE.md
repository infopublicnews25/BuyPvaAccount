# Signup → Login → Profile.html Flow Test Guide

## Overview
This guide validates the complete authentication flow:
1. **Signup** → Create new account & set `client_auth` localStorage
2. **Profile.html Access** → Verify authentication guard recognizes signed-up user
3. **Login** → Authenticate existing user and redirect to profile.html

## Test Procedure

### Test 1: Fresh Signup Flow (Browser Testing)

**Prerequisites:**
- Clear browser localStorage: Open DevTools → Application → Clear all
- Use incognito window (optional, for clean session)

**Steps:**

1. **Navigate to Signup Page**
   ```
   https://buypvaaccount.com/signup.html
   ```

2. **Fill Signup Form**
   - **Full Name:** Test User 2025
   - **Email:** test.user.2025@gmail.com (or any test email)
   - **Phone:** +88017XXXXXXXX
   - **Country:** Bangladesh
   - **Password:** TestPassword123!

3. **Check DevTools Before Submission**
   - Open DevTools → Console
   - Note: Should show "🔚 Production Mode - API: https://buypvaaccount.com/api"

4. **Submit Form**
   - Click "Create Account"
   - Should see: "Account created successfully! Redirecting to profile..."

5. **Check localStorage After Redirect**
   - DevTools → Application → localStorage
   - Should contain: `client_auth` with user data
   ```javascript
   // Example:
   {
     "email": "test.user.2025@gmail.com",
     "fullName": "Test User 2025",
     "phone": "+88017XXXXXXXX",
     "country": "Bangladesh",
     "authType": "email",
     "signupTime": "2025-01-14T10:30:00.000Z"
   }
   ```

6. **Verify Profile.html Display**
   - Should automatically redirect to profile.html
   - Should NOT show "Please login first" popup
   - Should display user profile with:
     - User name
     - User email
     - Orders section
     - Profile settings

### Test 2: Login Flow (Browser Testing)

**Prerequisites:**
- Use the account created in Test 1
- Clear browser localStorage or use new incognito window

**Steps:**

1. **Navigate to Login Page**
   ```
   https://buypvaaccount.com/login.html
   ```

2. **Fill Login Form**
   - **Email:** test.user.2025@gmail.com
   - **Password:** TestPassword123!

3. **Check DevTools Before Submission**
   - Open DevTools → Console
   - Monitor Network tab for API calls

4. **Submit Form**
   - Click "Login"
   - Should see: "Login successful! Redirecting to profile..."
   - Check Network tab: `/api/login` should return 200 OK

5. **Check Response Data**
   - Network tab → `/api/login` response should include:
   ```json
   {
     "success": true,
     "user": {
       "email": "test.user.2025@gmail.com",
       "fullName": "Test User 2025",
       "phone": "+88017XXXXXXXX",
       "country": "Bangladesh",
       "authType": "email"
     }
   }
   ```

6. **Check localStorage After Redirect**
   - DevTools → Application → localStorage
   - Should contain: `client_auth` with user data
   ```javascript
   {
     "email": "test.user.2025@gmail.com",
     "fullName": "Test User 2025",
     "phone": "+88017XXXXXXXX",
     "country": "Bangladesh",
     "authType": "email",
     "loginTime": "2025-01-14T10:30:00.000Z"
   }
   ```

7. **Verify Profile.html Display**
   - Should automatically redirect to profile.html
   - Should NOT show "Please login first" popup
   - Should display user profile

### Test 3: Rate Limiting Check

**If Login Shows 429 Error:**

This means too many authentication attempts in 15 minutes (limit: 5 attempts)

**To Clear Rate Limit:**
1. Wait 15 minutes, OR
2. SSH into VPS and restart server:
   ```bash
   ssh root@195.35.8.218
   cd /var/www/BuyPvaAccount
   pm2 restart BuyPvaAccount
   ```

**Rate Limit Configuration:**
- **Endpoint:** `/api/login`, `/api/send-reset-code`
- **Limit:** 5 attempts per 15 minutes
- **Header Check:** Response includes `Retry-After` with seconds remaining

### Test 4: Cross-Browser Testing

**Test in Multiple Browsers:**
- Chrome / Chromium
- Firefox
- Safari (if available)
- Edge

**Each Browser Test:**
1. Open profile.html without login → Should show popup
2. Complete signup flow → Should show profile
3. Clear localStorage
4. Complete login flow → Should show profile

## Troubleshooting

### Issue: "Please login first" popup appears after signup

**Solution 1 - Verify client_auth is set:**
```javascript
// In DevTools console:
localStorage.getItem('client_auth')
```
Should return JSON with user data.

**Solution 2 - Check signup.html response:**
1. DevTools → Network tab
2. Refresh signup.html
3. Look for `/api/save-user` and `/api/csrf-token` calls
4. Both should return 200 OK

**Solution 3 - Verify profile.html authentication guard:**
```javascript
// In profile.html's script (DevTools console):
const currentUser = secureStorage.getSensitive('client_auth') ||
                    secureStorage.get('client_auth') ||
                    JSON.parse(localStorage.getItem('client_auth') || 'null');
console.log('Current User:', currentUser);
```
Should log the user object, not null.

### Issue: Login returns 404 error

**Solution 1 - Verify endpoint exists:**
```bash
# SSH into VPS
ssh root@195.35.8.218
curl https://buypvaaccount.com/api/login -X POST -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"test"}' -k
```
Should return JSON response, not 404 HTML.

**Solution 2 - Check Nginx routing:**
```bash
ssh root@195.35.8.218
curl -I https://localhost:3000/api/login
```
Should show server response, confirming backend is responding.

### Issue: Login returns 429 (Too Many Requests)

**Cause:** More than 5 login attempts in 15 minutes

**Solution:**
1. Wait 15 minutes, OR
2. Use different email address
3. Check rate limit configuration in [backend/server.js](backend/server.js#L203)

### Issue: Password validation errors

**Common Issues:**
- Password too short (minimum 8 characters)
- No uppercase letter
- No special character
- No number

**Check password requirements in:**
- [signup.html](signup.html#L200) - Client-side validation
- [backend/server.js](backend/server.js#L1950) - Server-side validation

## Code Changes Made

### Signup.html Fix
**What Changed:** Added `client_auth` localStorage after successful signup

**Before:**
```javascript
// Removed client_auth to force login page
try { localStorage.removeItem('client_auth'); localStorage.removeItem('clientAuth'); } catch (e) {}
```

**After:**
```javascript
// Set client_auth so profile.html recognizes the user
const authData = {
    email: formData.email,
    fullName: formData.fullName,
    phone: formData.phone,
    country: formData.country,
    authType: "email",
    signupTime: new Date().toISOString()
};
localStorage.setItem('client_auth', JSON.stringify(authData));
```

**Impact:**
- Newly signed-up users can immediately access profile.html
- No need to log in again after signup
- profile.html's authentication guard recognizes the user

## Expected Results

### ✅ All Tests Pass When:
1. **Signup → Profile:** User signs up, profile.html loads immediately with user data
2. **Login → Profile:** User logs in, profile.html loads immediately with user data
3. **Rate Limiting:** If attempted 6 times, 6th attempt returns 429 with Retry-After header
4. **localStorage:** Always contains `client_auth` after signup or login
5. **No Popup:** Profile.html never shows "Please login first" popup after successful auth

### ❌ Tests Fail When:
1. "Please login first" popup appears after signup or login
2. `/api/login` returns 404 (routing issue)
3. Signup form shows validation errors without user interaction
4. Profile.html redirects back to login.html

## Verification Commands

### Verify Backend Endpoints
```bash
# SSH into VPS
ssh root@195.35.8.218

# Check /api/login endpoint
curl -X POST https://buypvaaccount.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' \
  -k 2>/dev/null | jq .

# Check /api/csrf-token endpoint  
curl https://buypvaaccount.com/api/csrf-token -k 2>/dev/null | jq .

# Check /api/save-user endpoint
curl -X POST https://buypvaaccount.com/api/save-user \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","fullName":"Test"}' \
  -k 2>/dev/null | jq .
```

### Verify PM2 Server Status
```bash
ssh root@195.35.8.218
pm2 status BuyPvaAccount        # Check if running
pm2 logs BuyPvaAccount          # View live logs
pm2 restart BuyPvaAccount       # Restart if needed
```

## References

- [Frontend config.js](config.js) - API endpoint detection
- [Backend server.js](backend/server.js) - API endpoints and routes
- [Login implementation](login.html#L59) - Login form handler
- [Signup implementation](signup.html#L430) - Signup form handler
- [Profile.html authentication](profile.html#L1054) - Authentication guard

---

**Last Updated:** January 14, 2025
**Test Status:** Ready for execution

# 🧪 Manual Testing Guide - Step by Step

## Test Scenario: Complete Signup → Success → Login Flow

### ✅ Prerequisites Check
- [ ] Backend server running: `node backend/server.js`
- [ ] Server shows: "🚀 Password reset server running on http://localhost:3000"
- [ ] Browser can access: http://localhost:3000

---

## 🎯 TEST 1: Signup Flow (Sign Up → Success Page → Login)

### Step 1.1: Open Signup Page
**Action**: Go to `http://localhost:3000/signup.html`

**Expected**: 
- Signup form loads
- Fields visible: Full Name, Email, Phone, Country, Password, Confirm Password
- "Create Account" button ready

---

### Step 1.2: Fill Form with Test Data
**Action**: Enter in form:
```
Full Name:        Test User December
Email:            testdec14@example.com
Phone:            +8801700000099
Country:          Bangladesh
Password:         TestPass12345!
Confirm Password: TestPass12345!
```

**Expected**:
- Form accepts all inputs
- Password strength indicator shows (Weak/Medium/Strong)
- All required fields filled

---

### Step 1.3: Submit Form
**Action**: Click "Create Account" button

**Expected**:
- Button shows "Creating Account..." (loading state)
- Success message appears
- Page redirects after 800ms

---

### Step 1.4: Verify Success Page
**Target Page**: `signup-success.html?email=testdec14@example.com`

**Expected**:
- ✓ Success checkmark visible (animated)
- ✓ Heading: "Account Created!"
- ✓ Subheading: "Welcome to BuyPvaAccount"
- ✓ Email displayed in box labeled "Registered Email"
- ✓ Email shows exactly: `testdec14@example.com`
- ✓ Green "Continue to Login →" button
- ✓ Security tip visible at bottom

---

### Step 1.5: Navigate to Login
**Action**: Click "Continue to Login →" button

**Expected**:
- Redirected to: `login.html?email=testdec14@example.com`

---

### Step 1.6: Verify Login Page
**Target Page**: `login.html?email=testdec14@example.com`

**Expected**:
- ✓ Email field pre-filled: `testdec14@example.com`
- ✓ Green info box visible
- ✓ Info box shows: "✅ Account created! Login with testdec14@example.com"
- ✓ Email shown in blue monospace font
- ✓ Password field auto-focused (cursor visible)
- ✓ "Login" button ready

---

### Step 1.7: Complete Login
**Action**: 
- Type password: `TestPass12345!`
- Click "Login" button

**Expected**:
- Button shows "Signing in..." (loading)
- Success message: "Login successful! Redirecting to profile..."
- Page redirects to: `profile.html`
- Profile page shows user data:
  - Name: Test User December
  - Email: testdec14@example.com
  - Phone: +8801700000099
  - Country: Bangladesh

---

## 🎯 TEST 2: Duplicate Email Prevention

### Step 2.1: Try Signup with Same Email
**Action**: Go back to `signup.html`

**Expected**: Fresh page loads

---

### Step 2.2: Fill Form with Duplicate Email
**Action**: Enter:
```
Full Name:        Another User
Email:            testdec14@example.com  (SAME EMAIL!)
Phone:            +8801700000111
Country:          Bangladesh
Password:         AnotherPass123!
Confirm Password: AnotherPass123!
```

---

### Step 2.3: Submit Form
**Action**: Click "Create Account"

**Expected**:
- ✗ Error message appears
- Error says: "An account with this email already exists"
- Form stays on signup page
- User can try again

---

## 🎯 TEST 3: Password Validation

### Step 3.1: Test Short Password
**Action**: Go to `signup.html`

**Expected**: Fresh page loads

---

### Step 3.2: Fill Form with Short Password
**Action**: Enter:
```
Full Name:        Test Short
Email:            testshort14@example.com
Phone:            +8801700000222
Country:          Bangladesh
Password:         abc          (Only 3 chars!)
Confirm Password: abc
```

**Expected**:
- Form validates on submit
- Error message appears
- Error says: "Password must be at least 6 characters long"

---

### Step 3.3: Test Non-Matching Passwords
**Action**: Change to:
```
Password:         TestPass123!
Confirm Password: DifferentPass123!
```

**Expected**:
- Error message: "Passwords do not match"

---

## 🎯 TEST 4: Password Reset (Forgot Password)

### Step 4.1: Open Forgot Password
**Action**: From `login.html`, click "Forgot password?" link

**Expected**: Redirected to `forgot-password.html`

---

### Step 4.2: Enter Email
**Action**: 
- Enter email: `testdec14@example.com`
- Click "Send Verification Code"

**Expected**:
- Button shows "Sending..." 
- Success message: "✅ Verification code sent! Check your email."
- Moves to Step 2 (code verification)

---

### Step 4.3: Verify Code (Fallback)
**Note**: If email service not configured, code appears in console

**Action**:
- Open console (F12 → Console)
- Look for: "🔐 VERIFICATION CODE (FALLBACK): 123456"
- Copy the code

---

### Step 4.4: Enter Code
**Action**: 
- Enter the 6-digit code
- Click "Verify Code"

**Expected**:
- Code verified message
- Moves to Step 3 (password reset)

---

### Step 4.5: Set New Password
**Action**: 
```
New Password:         NewPass999!
Confirm New Password: NewPass999!
```

**Expected**:
- Success: "Password reset successful! Redirecting to login..."
- Redirected to `login.html`

---

### Step 4.6: Login with New Password
**Action**: 
```
Email:    testdec14@example.com
Password: NewPass999!
```

**Expected**:
- Login successful
- Redirected to profile
- User data loads

---

## 🎯 TEST 5: Auto-Member Creation (Checkout)

### Step 5.1: Go to Checkout
**Action**: Go to `Checkout.html` (add products first if needed)

**Expected**: Checkout page loads

---

### Step 5.2: Fill Billing Details
**Action**: Enter:
```
First Name:  John
Last Name:   Doe
Email:       john.auto@example.com  (NEW EMAIL - not a member)
Phone:       +8801700000333
Country:     Bangladesh
```

---

### Step 5.3: Accept Terms & Place Order
**Action**: 
- Check "I agree to terms"
- Click "Place Order"

**Expected**:
- Success page loads
- Order created

---

### Step 5.4: Test Password Reset for Auto-Member
**Action**: Go to `forgot-password.html`

**Expected**: Fresh page loads

---

### Step 5.5: Reset Auto-Member Password
**Action**:
- Email: `john.auto@example.com`
- Get code from console
- Verify code
- Set password: `NewAutoPass123!`

**Expected**:
- Password reset successful

---

### Step 5.6: Login as Auto-Member
**Action**: Go to `login.html`

**Expected**: Normal login page

---

### Step 5.7: Login
**Action**:
```
Email:    john.auto@example.com
Password: NewAutoPass123!
```

**Expected**:
- Login successful
- Profile shows user data
- Orders visible

---

## 📊 Database Verification

### Check registered_users.json
**Location**: `registered_users.json`

**Verify Structure**:
```json
{
  "fullName": "Test User December",
  "email": "testdec14@example.com",
  "phone": "+8801700000099",
  "country": "Bangladesh",
  "authType": "email",
  "passwordHash": "$2b$12$...",
  "passwordMigrated": true,
  "passwordMigratedAt": "2025-12-14T...",
  "createdAt": "2025-12-14T..."
}
```

**Key Points**:
- ✓ Password is bcrypt hash (starts with `$2b$12$`)
- ✓ Never plain text
- ✓ `passwordMigrated: true`
- ✓ Created date present
- ✓ Auto-created users have `"autoCreated": true`

---

## ✅ Final Checklist

### Signup Flow
- [ ] Signup form validates correctly
- [ ] Success page shows with email
- [ ] Email displayed clearly
- [ ] Login page has email pre-filled
- [ ] Info box shows email

### Login Flow
- [ ] Can login with correct password
- [ ] Wrong password rejected
- [ ] Non-existent email rejected
- [ ] Profile loads correctly

### Password Reset
- [ ] Can request reset code
- [ ] Code verification works
- [ ] New password accepted
- [ ] Can login with new password

### Auto-Member
- [ ] Can place order as non-member
- [ ] User auto-created
- [ ] Can reset password
- [ ] Can login afterward

### Security
- [ ] Duplicate email prevented
- [ ] Short passwords rejected
- [ ] Passwords bcrypt hashed
- [ ] No plain text storage

---

## 🐛 Troubleshooting

### Signup fails with "Server error"
- Check backend console for errors
- Verify registered_users.json is writable
- Check if email already exists

### Success page not showing
- Check URL has email parameter
- Check redirect timing in browser
- Check console for JavaScript errors

### Login page shows empty email
- URL might not have email parameter
- Try manually going to `login.html?email=testdec14@example.com`

### Info box not showing
- Check browser console (F12) for errors
- Refresh page
- Check if email parameter is in URL

---

## Summary

All three features tested:
✅ Signup with validation
✅ Success page with email display
✅ Login with email pre-fill

Flow verification:
✅ Signup → Success → Login → Profile
✅ Email shown at each step
✅ Security validations working
✅ Database correctly updated

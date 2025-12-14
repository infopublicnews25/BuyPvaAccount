# Order Management & Notification System Test Guide

## Overview
This guide validates the order management system including:
1. **Order Placement** → Customer places order via checkout
2. **Order Storage** → Data saved to orders.json
3. **Order Notifications** → Email sent to admin + customer
4. **Order Dashboard** → Admin can view/manage orders in ordermanagement.html
5. **Order Updates** → Admin can update status → triggers delivery email

## System Architecture

### Data Flow
```
Customer → Checkout.html → /api/orders (POST)
                           ↓
                    orders.json (save)
                           ↓
                    Email Service (admin notification)
                           ↓
Admin → ordermanagement.html → /api/admin/orders (GET)
                           ↓
                    Display orders + allow status update
```

### Files Involved
- **Frontend:** Checkout.html, ordermanagement.html
- **Backend:** backend/server.js (routes: /api/orders, /api/admin/orders)
- **Storage:** orders.json
- **Email:** Gmail SMTP (info.buypva@gmail.com)
- **Config:** config.js, backend/.env

## Test Procedure

### Test 1: Place Order via Checkout

**Prerequisites:**
- User is logged in (client_auth in localStorage)
- Page: https://buypvaaccount.com/Checkout.html

**Steps:**

1. **Add Products to Cart**
   - Browse marketplace.html
   - Add items to cart (should be saved in localStorage)

2. **Navigate to Checkout**
   ```
   https://buypvaaccount.com/Checkout.html
   ```

3. **Verify Order Form**
   - Should show:
     - Customer name (pre-filled from profile)
     - Customer email
     - Product list
     - Total price
     - Payment button

4. **Submit Order**
   - Click "Place Order" or "Pay Now"
   - DevTools → Network tab
   - Should show POST to `/api/orders` with 200 OK response
   - Response should contain: `{"success": true, "message": "Order saved"}`

5. **Check Response**
   ```javascript
   {
     "success": true,
     "message": "Order saved successfully",
     "orderId": "ORD1765705071451DGWO2"
   }
   ```

### Test 2: Verify Order Email Notifications

**Prerequisites:**
- Email service is configured (Gmail SMTP)
- Admin email set in backend/server.js (ADMIN_EMAIL)
- Customer email captured from order

**Expected Emails:**

**Admin Email:**
- **To:** admin@buypvaaccount.com
- **Subject:** New Order Placed #ORD1765705071451DGWO2
- **Content:**
  - Order ID
  - Customer name & email
  - Product list with quantities
  - Total amount
  - Status: Pending

**Customer Email:**
- **To:** customer@example.com
- **Subject:** Order Confirmation - #ORD1765705071451DGWO2
- **Content:**
  - Order confirmation
  - Product list
  - Total amount
  - Status message: "We will notify you when your order is delivered"

**Verification Steps:**
1. Check admin email inbox (email configured in env)
2. Check customer email inbox (email used during checkout)
3. Look for emails from: info.buypva@gmail.com
4. Verify content includes order ID and details

### Test 3: Verify Order Data in ordermanagement.html

**Prerequisites:**
- Admin user logged in (admin_auth_token in localStorage)
- Page: https://buypvaaccount.com/ordermanagement.html

**Steps:**

1. **Login as Admin**
   - admin.html or direct authentication

2. **Navigate to Orders Tab**
   - ordermanagement.html should load
   - Should show "Orders" tab active

3. **Check Orders List**
   - Should display newly placed order
   - Should show:
     - Order ID (ORD1765705071451DGWO2)
     - Customer name
     - Total amount
     - Status (Pending)
     - Date created

4. **DevTools Network Check**
   - Network tab → look for `/api/admin/orders` call
   - Should return 200 OK with orders array
   - Each order should have: orderId, customer, items, totals, status

5. **Verify Status Counts**
   - Top of page should show:
     - All: X
     - Pending: 1
     - Confirmed: 0
     - Completed: 0

### Test 4: Update Order Status (Admin Action)

**Prerequisites:**
- Admin logged in
- Order visible in ordermanagement.html

**Steps:**

1. **Select Order from List**
   - Click on order row
   - Should show order details panel

2. **Change Status Dropdown**
   - Current status: Pending
   - Click dropdown → Select "Completed"

3. **Verify Status Update**
   - Should show success message
   - Status changes in UI
   - DevTools → Network: PUT to `/api/admin/orders/{orderId}/status`
   - Response: `{"success": true, "message": "Order status updated"}`

4. **Verify Delivery Email Sent**
   - When status changes to "Completed"
   - Customer should receive delivery notification email
   - Email subject: "Order Delivered - #ORD..."
   - Email includes: "Your order has been delivered"

5. **Check Status Counts Update**
   - Pending count should decrease
   - Completed count should increase

### Test 5: Backend Stability (No Crashes)

**Prerequisites:**
- SSH access to VPS
- Run complete test flow above

**Verification:**

1. **Check PM2 Status**
   ```bash
   ssh root@195.35.8.218 "pm2 status BuyPvaAccount"
   ```
   - Should show: `online` status
   - Uptime should increase continuously
   - Restart count (↺) should NOT increase during test

2. **Check Error Logs**
   ```bash
   ssh root@195.35.8.218 "pm2 logs BuyPvaAccount --lines 10"
   ```
   - Should NOT see: `setImmediate(...) is not a function` error
   - Should see order logs: `📦 New order received`, `📧 Sending emails`
   - No "Server error" or crash logs

3. **Memory Usage**
   - Should be stable (not growing)
   - Typical: 50-100 MB
   - Alert if exceeds 200+ MB

## Code Changes Made (Dec 14, 2025)

### Fix 1: setImmediate → Promise.resolve()
**File:** backend/server.js line 681
**Problem:** Backend crashed with "setImmediate is not a function" after every order
**Solution:** Replaced with `Promise.resolve().then()` for cross-platform compatibility
**Impact:** Backend no longer crashes when processing orders

### Fix 2: Order API Endpoint
**File:** ordermanagement.html line 964
**Problem:** Double `/api` path: `${CONFIG.API}/api/admin/orders`
**Solution:** Changed to `${CONFIG.API}/admin/orders`
**Impact:** Orders now load properly in admin dashboard

## Troubleshooting

### Issue: Order Page Shows "No Orders"

**Check 1 - Verify Backend Connection:**
```javascript
// In Checkout.html DevTools console:
fetch(CONFIG.API + '/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        customer: { email: 'test@test.com', fullName: 'Test' },
        items: [{ name: 'Product', quantity: 1, price: 10 }],
        totals: { sub: 10, tot: 10 }
    })
})
.then(r => r.json())
.then(d => console.log(d))
```
Should return: `{"success": true, "orderId": "ORD..."}`

**Check 2 - Verify Admin API:**
```javascript
// In ordermanagement.html DevTools console:
fetch(CONFIG.API + '/admin/orders', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_auth_token') }
})
.then(r => r.json())
.then(d => console.log(d))
```
Should return: `{"success": true, "orders": [...]}`

**Check 3 - Verify orders.json**
```bash
ssh root@195.35.8.218 "cat /var/www/BuyPvaAccount/orders.json | head -c 500"
```
Should show JSON array with order objects.

### Issue: Emails Not Sending

**Check Email Configuration:**
```bash
ssh root@195.35.8.218 "cat /var/www/BuyPvaAccount/backend/.env | grep EMAIL"
```
Should show:
```
EMAIL_PROVIDER=gmail
EMAIL_USER=info.buypva@gmail.com
EMAIL_PASSWORD=gmxeltypsbsqrfrr
```

**Check Email Transporter Status:**
```bash
ssh root@195.35.8.218 "pm2 logs BuyPvaAccount --lines 20 | grep -i 'email\|transporter'"
```
Should see: `✅ Email server is ready to send messages`

**Check Order Email Logs:**
```bash
ssh root@195.35.8.218 "pm2 logs BuyPvaAccount --lines 50 | grep 'Sending emails\|Admin notification\|Order confirmation'"
```
Should see:
- `📧 Sending emails for order ORD...`
- `✅ Admin notification sent for order ORD...`
- `✅ Order confirmation sent to customer...`

### Issue: Backend Keeps Crashing (↺ count increasing)

**Check Process Status:**
```bash
ssh root@195.35.8.218 "pm2 info BuyPvaAccount | grep -A5 'status\|unstable_restarts'"
```

**Restart and Check Logs:**
```bash
ssh root@195.35.8.218 "pm2 restart BuyPvaAccount && sleep 2 && pm2 logs BuyPvaAccount --lines 20"
```

**Common Causes & Solutions:**
1. **Memory leak** → Restart server, check logs for issues
2. **Email transporter timeout** → Increase timeout in backend/server.js
3. **orders.json corruption** → Restore from backup or delete to rebuild
4. **Missing environment variables** → Check backend/.env file

### Issue: CORS Error When Fetching Orders

**Solution 1 - Check Production Domain:**
```bash
# In ordermanagement.html console:
console.log(CONFIG.API);
```
Should output: `https://buypvaaccount.com/api`

**Solution 2 - Check Backend CORS Configuration:**
```bash
ssh root@195.35.8.218 "grep -A5 'cors' /var/www/BuyPvaAccount/backend/server.js"
```

**Solution 3 - Check Nginx Proxy:**
```bash
ssh root@195.35.8.218 "curl -I https://buypvaaccount.com/api/health -k"
```
Should return: HTTP/1.1 200 OK

## Expected System Status

### ✅ All Tests Pass When:
1. **Orders can be placed** via Checkout.html
2. **Order confirmation emails** sent within 2 seconds
3. **Orders visible in admin dashboard** immediately
4. **Admin can update status** without errors
5. **Delivery emails** sent when status changes to Completed
6. **Backend stable** with no crashes (↺ count constant)
7. **Memory usage** stable (no growth)
8. **Logs clean** (no error messages)

### ❌ Tests Fail When:
1. Checkout shows "Failed to save order"
2. Emails not received by customer/admin
3. ordermanagement.html shows empty list
4. Status update shows error message
5. Backend shows "online" for 5 seconds then crashes
6. Memory usage grows continuously
7. Logs show errors or warnings

## Quick Test Checklist

```
□ Place test order via Checkout.html
□ Check order ID in response
□ Verify order appears in ordermanagement.html within 5 seconds
□ Check admin received email from info.buypva@gmail.com
□ Check customer received confirmation email
□ Update order status to "Completed"
□ Verify customer received delivery email
□ Check backend logs show no errors
□ Verify PM2 uptime increasing (not crashing)
```

## References

- [Checkout.html](Checkout.html) - Order placement form
- [ordermanagement.html](ordermanagement.html) - Admin order dashboard
- [backend/server.js](backend/server.js) - API endpoints
- [orders.json](orders.json) - Order storage file
- [config.js](config.js) - API endpoint configuration

---

**Last Updated:** December 14, 2025
**Status:** Production Ready
**Backend Stability:** Fixed (setImmediate → Promise.resolve)
**Order API:** Verified Working

# Notification System - Testing Guide

## 🚀 Status: DEPLOYED ✅
- Code pushed to GitHub (commit c4e43e1)
- Production server updated at 195.35.8.218
- PM2 server restarted

---

## Quick Test Steps

### Test 1: Status Change Notification (CRITICAL TEST)

**Setup:**
1. Open `ordermanagement.html` in browser at http://your-site.com/ordermanagement.html
2. Open `profile.html` in another tab at http://your-site.com/profile.html
3. Login with same account in profile tab

**Steps:**
```
1. In ordermanagement tab:
   - Find any order with status "pending" or "confirmed"
   - Click expand button to see order details
   - Look for order details: Order ID, Customer email, Current status
   
2. Click status change button:
   - "✓ Confirm Order" (pending → confirmed) OR
   - "⚙️ Start Processing" (confirmed → processing) OR
   - "🎉 Mark Completed" (processing → completed)
   
3. Check browser console (F12) - should show:
   ✅ Auto-notification created: {
     email: "customer@example.com",
     icon: "✅",
     title: "Order Confirmed",
     message: "...",
     orderId: "ORD-..."
   }
   
4. Switch to profile.html tab
   
5. Go to "Notifications" section (left menu)
   
6. EXPECTED RESULT: 
   ✅ See new notification:
   - Icon: ✅ (or ⚙️, 🎉 depending on status)
   - Title: "Order Confirmed" (or appropriate status)
   - Message: "Great news! Your order #ORD-... has been confirmed..."
   - Badge: "Status Update" 
   - Timestamp: Just now
   - Action buttons: "Track Order" and "View Orders"
```

### Test 2: Delivery Notification

**Setup:**
1. Open ordermanagement.html
2. Open profile.html in another tab
3. Have customer email ready

**Steps:**
```
1. In ordermanagement.html:
   - Go to "Delivery File Management" tab
   - Find "Send Delivery File" button
   - Enter:
     - Order ID: (existing order ID)
     - Customer Email: customer@example.com
     - Select files or browse
   
2. Click "Send File" button
   
3. Check console - should show:
   📥 Delivery notification created for customer@example.com
   
4. Switch to profile.html tab
   
5. Go to Notifications section
   
6. EXPECTED: See "📥 Files Delivered" notification
   - Icon: 📥
   - Title: "Files Delivered"
   - Message: "Your files for order #ORD-... are ready for download"
```

### Test 3: Multiple Status Changes (Notification Sequence)

**Steps:**
```
1. In ordermanagement.html, change order status multiple times:
   - pending → confirmed (✅)
   - confirmed → processing (⚙️)
   - processing → completed (🎉)
   
2. In profile.html notifications, you should see:
   ✅ Order Confirmed
   ⚙️ Order is Being Processed  
   🎉 Order Completed
   (All showing in notifications list)
   
3. Verify unread count increases:
   Badge next to "Notifications" shows: 3
```

### Test 4: Manual Admin Notification

**Steps:**
```
1. In ordermanagement.html:
   - Go to "Send Notification" tab
   - Enter customer email
   - Select custom icon (📢 or other)
   - Type custom title: "Special Offer"
   - Type message: "Check out our new products!"
   
2. Click "Send Notification"
   
3. In profile.html:
   - Go to Notifications
   - EXPECTED: See "📢 Special Offer" with your custom message
```

### Test 5: Cross-Tab Real-Time Sync (No Refresh Needed)

**Steps:**
```
1. Open ordermanagement.html in Tab A
2. Open profile.html in Tab B
3. In Tab A: Change order status to "processing"
4. Watch Tab B notifications section
5. EXPECTED: New notification appears within 3-4 seconds
   - NO manual refresh needed!
   - Auto-updates via StorageEvent
```

---

## Browser Console Debugging

### Check What's in localStorage

**In profile.html console (F12 → Console tab):**

```javascript
// See all notifications
JSON.parse(localStorage.getItem('admin_notifications'))

// See current user
currentUser

// See specific user's notifications
const admin = JSON.parse(localStorage.getItem('admin_notifications') || '[]');
admin.filter(n => n.email === 'customer@example.com')

// Check order details
const orders = JSON.parse(localStorage.getItem('all_orders') || '[]');
orders[0]  // See first order structure
```

### Expected Output Format

**admin_notifications entry:**
```javascript
{
  id: "AUTO-1704067890123",
  email: "customer@example.com",  // ← CRITICAL: Must have email
  icon: "✅",
  title: "Order Confirmed",
  message: "Great news! Your order #ORD-12345 has been confirmed...",
  sentDate: "2024-01-01T10:00:00.000Z",
  orderId: "ORD-12345",
  statusChange: {
    from: "pending",
    to: "confirmed"
  }
}
```

---

## Troubleshooting

### Problem: Notification Not Appearing

**Check 1: Is notification created in localStorage?**
```
Open ordermanagement.html console:
console.log(JSON.parse(localStorage.getItem('admin_notifications')))
Should show entries with your customer email
```

**Check 2: Is customer email correct?**
```
In profile.html console:
console.log(currentUser.email)
Should match the email in admin_notifications
```

**Check 3: Is loadNotifications() being called?**
```
In profile.html console:
Add breakpoint or log at line where loadNotifications() defined
Should show: "Loading notifications..."
```

### Problem: Old Notifications Still Showing

**Fix:**
```javascript
// Clear old test data
localStorage.removeItem('admin_notifications');
localStorage.removeItem('read_notifications');
localStorage.removeItem('deleted_notifications');

// Refresh page
window.location.reload();
```

### Problem: Email Not Matching

**Check:**
```
In profile.html:
- Login email: currentUser.email (should be lowercase)
- Notification email: admin_notifications[n].email

These must match exactly (case-insensitive with toLowerCase())
```

---

## Key Verification Points

### ✅ Must Verify These Work:

1. **Notification Creation**
   - [ ] Admin changes status → Notification created in admin_notifications
   - [ ] Has customer email (not empty)
   - [ ] Has correct icon/title/message
   - [ ] Has sentDate and orderId

2. **Notification Display**
   - [ ] loadNotifications() filters by user email
   - [ ] Notifications show in profile.html
   - [ ] Correct icon and message displayed
   - [ ] Unread badge shows count

3. **Notification Actions**
   - [ ] Click "Track Order" → Goes to tracking page
   - [ ] Click "View Orders" → Goes to orders section
   - [ ] Click X button → Deletes notification
   - [ ] Click notification → Marks as read

4. **Real-Time Sync**
   - [ ] No refresh needed when status changes
   - [ ] Notifications appear within 3-4 seconds
   - [ ] Works across multiple tabs

5. **All Notification Types**
   - [ ] Status change (AUTO-*)
   - [ ] Delivery file (DELIVERY-*)
   - [ ] Manual message (NOTIF-*)

---

## Success Criteria

### Test is PASSED if:

✅ Admin changes order status
✅ Customer's notifications tab shows the status change notification (3-4 seconds later)
✅ Notification has correct icon, title, and message
✅ Multiple status changes create multiple notifications
✅ Delivery files create notification
✅ Manual notifications work
✅ No page refresh needed for real-time sync
✅ Wrong email doesn't see notification (proper filtering)
✅ Action buttons (Track Order, View Orders) work
✅ Delete notification removes it
✅ Unread badge count is correct

### Test is FAILED if:

❌ Notification doesn't appear in customer's list
❌ Wrong customer sees another customer's notification
❌ Notification has empty email or wrong message
❌ Page refresh required to see notification
❌ Unread badge doesn't update
❌ Action buttons don't work

---

## Test Data

Use these test accounts:

```
Account 1:
Email: customer1@example.com
Name: Test Customer 1

Account 2:
Email: customer2@example.com
Name: Test Customer 2

Test Orders:
Order 1: ORD-20240101-001
Order 2: ORD-20240101-002
```

---

## After Testing

Once all tests pass:

1. ✅ Document any issues found
2. ✅ Test with multiple browsers (Chrome, Firefox, Safari)
3. ✅ Test with multiple users
4. ✅ Monitor server logs for errors
5. ✅ Update status: PRODUCTION READY

---

## Success Report Template

```
NOTIFICATION SYSTEM TEST REPORT
Date: ___________
Tester: ________

Test 1: Status Change Notification
- Result: PASS / FAIL
- Notes: ________________

Test 2: Delivery Notification
- Result: PASS / FAIL
- Notes: ________________

Test 3: Multiple Status Changes
- Result: PASS / FAIL
- Notes: ________________

Test 4: Manual Notification
- Result: PASS / FAIL
- Notes: ________________

Test 5: Cross-Tab Sync
- Result: PASS / FAIL
- Notes: ________________

Overall Status: ✅ WORKING / ❌ NEEDS FIX
Issues Found: ________________
Fixes Required: ________________
```

---

## Next Steps if Issues Found

1. Check browser console for errors (F12 → Console)
2. Verify localStorage data structure
3. Check ordermanagement.html is creating notifications
4. Verify profile.html is loading notifications
5. Ensure email is being set correctly in notification
6. Check StorageEvent is being dispatched

**If still having issues:**
- Enable console.log statements in code
- Check network tab for API errors
- Verify localStorage permissions
- Test in incognito mode
- Clear browser cache and reload

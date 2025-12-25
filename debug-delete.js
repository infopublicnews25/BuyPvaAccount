// Emergency Delete Debug & Fix Script
// Run this in browser console on products.html page

console.log('🚨 EMERGENCY DELETE DEBUG STARTED');

// Test 1: Check if deleteProduct function exists
console.log('1️⃣ Function Check:');
console.log('   - deleteProduct exists:', typeof deleteProduct === 'function');
console.log('   - refreshAuthIfNeeded exists:', typeof refreshAuthIfNeeded === 'function');
console.log('   - getStaffToken exists:', typeof getStaffToken === 'function');

// Test 2: Check authentication
const token = localStorage.getItem('admin_auth_token');
console.log('2️⃣ Auth Check:');
console.log('   - Token exists:', !!token);
console.log('   - Token length:', token ? token.length : 0);

// Test 3: Check API connectivity
console.log('3️⃣ API Test:');
fetch('/api/products')
  .then(r => r.json())
  .then(data => {
    console.log('   - API reachable:', data.success ? 'YES' : 'NO');
    console.log('   - Products count:', data.products ? data.products.length : 0);
    if (data.products && data.products.length > 0) {
      const testId = data.products[0].id;
      console.log('   - Sample ID:', testId);

      // Test 4: Direct delete test
      console.log('4️⃣ Direct Delete Test:');
      directDeleteTest(testId);
    }
  })
  .catch(err => console.error('   - API Error:', err));

function directDeleteTest(productId) {
  console.log('🧪 Testing delete for ID:', productId);

  const headers = {
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json'
  };

  console.log('📤 Headers:', headers);

  fetch(`/api/products/${productId}`, {
    method: 'DELETE',
    headers: headers
  })
  .then(response => {
    console.log('📥 Status:', response.status);
    return response.text(); // Use text() first to see raw response
  })
  .then(text => {
    console.log('📋 Raw Response:', text);
    try {
      const data = JSON.parse(text);
      console.log('📋 Parsed Response:', data);
      if (data.success) {
        console.log('✅ DELETE SUCCESS!');
        // Reload page to see changes
        setTimeout(() => location.reload(), 1000);
      } else {
        console.log('❌ DELETE FAILED:', data.message);
      }
    } catch (e) {
      console.log('❌ JSON Parse Error:', e);
    }
  })
  .catch(err => console.error('💥 Network Error:', err));
}

// Make function global for manual testing
window.directDeleteTest = directDeleteTest;

console.log('🎯 EMERGENCY DEBUG COMPLETE!');
console.log('💡 Try: directDeleteTest("PRODUCT_ID")');
console.log('🔄 Auto-test will run...');
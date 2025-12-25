// Debug script for product delete issue
// Run this in browser console on products.html page

console.log('=== PRODUCT DELETE DEBUG ===');

// Check authentication
const token = localStorage.getItem('admin_auth_token');
console.log('Auth token exists:', !!token);
console.log('Token length:', token ? token.length : 0);

// Check if on products page
console.log('Current URL:', window.location.href);

// Test API connectivity
fetch('/api/products', {
    headers: {
        'Authorization': token ? `Bearer ${token}` : ''
    }
})
.then(r => r.json())
.then(data => {
    console.log('API connectivity test:', data.success ? 'SUCCESS' : 'FAILED');
    console.log('Products count:', data.products ? data.products.length : 0);
})
.catch(err => console.error('API test failed:', err));

// Test delete function (replace PRODUCT_ID with actual ID)
function testDelete(productId) {
    console.log('Testing delete for product:', productId);

    fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(r => r.json())
    .then(data => {
        console.log('Delete response:', data);
    })
    .catch(err => console.error('Delete failed:', err));
}

// Usage: testDelete('YOUR_PRODUCT_ID')
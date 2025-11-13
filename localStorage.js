// Set test user in localStorage
localStorage.setItem('registered_users', '{"password":"dGVzdDEyMw==","fullName":"Test Customer","phone":"01700000000","authType":"email","email":"test@customer.com","country":"Bangladesh"}');

// Set test order in localStorage
const testOrder = {
    orderId: 'TEST001',
    customer: {
        email: 'test@customer.com',
        fullName: 'Test Customer',
        phone: '01700000000',
        country: 'Bangladesh'
    },
    items: [
        {
            name: 'Gmail PVA',
            quantity: 2,
            price: 5.99
        },
        {
            name: 'Facebook PVA',
            quantity: 1,
            price: 3.99
        }
    ],
    total: 15.97,
    status: 'completed',
    createdAt: new Date().toISOString(),
    deliveryFiles: [
        {
            name: 'Gmail Accounts.txt',
            url: '#'
        },
        {
            name: 'Facebook Account.txt',
            url: '#'
        }
    ]
};

localStorage.setItem('client_orders', JSON.stringify([testOrder]));

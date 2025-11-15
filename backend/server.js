const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { verifyAdmin, createUser, getAllUsers, updateUser, deleteUser, verifyToken, storeUserToken, updateAdminCredentials } = require('./admin-auth');

// Users file path
const USERS_FILE = path.join(__dirname, '../registered_users.json');

// Helper to read all users
function readAllUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading registered_users.json:', e);
    }
    return [];
}

// Helper to write all users
function writeAllUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing registered_users.json:', e);
        return false;
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Authentication middleware
const authenticateAdmin = async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    try {
        const result = await verifyToken(token);
        if (result.success) {
            req.user = result.user;
            next();
        } else {
            res.status(401).json({ success: false, message: 'Invalid token' });
        }
    } catch (error) {
        res.status(401).json({ success: false, message: 'Authentication failed' });
    }
};

// Protected route for admin.html (must come before static middleware)
app.get('/admin.html', authenticateAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// Add a less obvious admin route as well
app.get('/dashboard', authenticateAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// Serve static files from the parent directory (where admin.html is located)
app.use(express.static(path.join(__dirname, '..')));

// Admin login endpoint
app.post('/api/admin-login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    try {
        const result = await verifyAdmin(username, password);
        if (result.success) {
            // Generate a secure token
            const token = await bcrypt.hash(Date.now().toString() + username, 8);
            
            // Store token for the user
            await storeUserToken(username, token);
            
            res.json({ 
                success: true, 
                token,
                user: result.user
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// User management endpoints
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = getAllUsers();
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

app.post('/api/admin/users', authenticateAdmin, async (req, res) => {
    const { username, email, role, password } = req.body;
    if (!username || !email || !role || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    try {
        const result = await createUser({ username, email, role, password });
        if (result.success) {
            res.json({ success: true, user: result.user });
        } else {
            res.status(400).json({ success: false, message: result.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create user' });
    }
});

app.put('/api/admin/users/:username', authenticateAdmin, async (req, res) => {
    const { username } = req.params;
    const updateData = req.body;
    
    try {
        const result = await updateUser(username, updateData);
        if (result.success) {
            res.json({ success: true, user: result.user });
        } else {
            res.status(404).json({ success: false, message: result.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
});

app.delete('/api/admin/users/:username', authenticateAdmin, (req, res) => {
    const { username } = req.params;
    
    try {
        const result = deleteUser(username);
        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: result.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
});

app.put('/api/admin/credentials', authenticateAdmin, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    
    try {
        const result = await updateAdminCredentials(username, password);
        if (result.success) {
            res.json({ success: true, message: 'Admin credentials updated successfully' });
        } else {
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update admin credentials' });
    }
});

// API to save a new user
app.post('/api/save-user', (req, res) => {
    const user = req.body;
    if (!user || !user.email) {
        return res.status(400).json({ success: false, message: 'User data missing or invalid' });
    }
    const users = readAllUsers();
    if (users.some(u => u.email === user.email)) {
        return res.status(409).json({ success: false, message: 'User already exists' });
    }
    users.push(user);
    if (writeAllUsers(users)) {
        res.json({ success: true, message: 'User saved successfully' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to save user' });
    }
});


// Orders file path
const ORDERS_FILE = path.join(__dirname, '../orders.json');

// Admin notification email (site owner)
const ADMIN_EMAIL = 'info.buypva@gmail.com';
// Helper to read all orders
function readAllOrders() {
    try {
        if (fs.existsSync(ORDERS_FILE)) {
            const data = fs.readFileSync(ORDERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading orders.json:', e);
    }
    return [];
}

// Helper to write all orders
function writeAllOrders(orders) {
    try {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing orders.json:', e);
        return false;
    }
}


// API to save a new order
app.post('/api/save-order', (req, res) => {
    const order = req.body;
    if (!order || !order.orderId) {
        return res.status(400).json({ success: false, message: 'Order data missing or invalid' });
    }
    const orders = readAllOrders();
    orders.push(order);
    if (writeAllOrders(orders)) {
        // After saving the order, attempt to send ADMIN-only notification (customer delivery email
        // will be sent later when admin marks order as 'Completed')
        (async () => {
            if (!transporter || !emailConfig) {
                console.warn('Email not configured. Skipping admin notification for new order.');
                return;
            }

            try {
                // Build items HTML for admin message
                let itemsHTML = '';
                (order.items || []).forEach(item => {
                    const unitPrice = item.unitPrice || item.price || 0;
                    const itemTotal = item.total || (unitPrice * (item.quantity || 1));
                    itemsHTML += `\n                        <tr>\n                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>\n                            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity || 1}</td>\n                            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${Number(unitPrice).toFixed(2)}</td>\n                            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${Number(itemTotal).toFixed(2)}</td>\n                        </tr>\n                    `;
                });

                const adminMail = {
                    from: { name: 'BuyPvaAccount', address: emailConfig.email },
                    to: ADMIN_EMAIL,
                    subject: `New Order Placed #${order.orderId}`,
                    html: `<!doctype html><html><body><h2>New order received</h2>\n                        <p>Order #: <strong>${order.orderId}</strong></p>\n                        <p>Customer: <strong>${order.customer?.fullName || order.customer?.email || order.email}</strong></p>\n                        <p>Email: ${order.customer?.email || order.email || 'N/A'}</p>\n                        <p>Phone: ${order.customer?.phone || 'N/A'}</p>\n                        <h3>Items</h3>\n                        <table style="width:100%; border-collapse:collapse;">${itemsHTML}</table>\n                        <p>Total: <strong>$${(order.totals && order.totals.tot) ? Number(order.totals.tot).toFixed(2) : '0.00'}</strong></p>\n                        <p>View orders in admin dashboard.</p>\n                        </body></html>`,
                    text: `New order #${order.orderId} placed by ${order.customer?.fullName || order.customer?.email || 'N/A'}`
                };

                try {
                    await transporter.sendMail(adminMail);
                    console.log(`✅ Admin notification sent for order ${order.orderId}`);
                } catch (sendErr) {
                    console.error(`❌ Failed to send admin notification for order ${order.orderId}:`, sendErr);
                }

                // Attempt to send order confirmation to the customer (immediate confirmation)
                try {
                    const customerEmail = order.customer?.email || order.email;
                    if (customerEmail) {
                        const customerMail = {
                            from: { name: 'BuyPvaAccount', address: emailConfig.email },
                            to: customerEmail,
                            subject: `Order Confirmation - #${order.orderId}`,
                            html: `<!doctype html><html><body><h2>Thank you for your order</h2>
                                <p>Order #: <strong>${order.orderId}</strong></p>
                                <p>Hello ${order.customer?.fullName || customerEmail},</p>
                                <p>We have received your order. Here are the details:</p>
                                <h3>Items</h3>
                                <table style="width:100%; border-collapse:collapse;">${itemsHTML}</table>
                                <p>Total: <strong>$${(order.totals && order.totals.tot) ? Number(order.totals.tot).toFixed(2) : '0.00'}</strong></p>
                                <p>We will notify you when your order is delivered.</p>
                                <p>Best regards,<br/>BuyPvaAccount Team</p>
                                </body></html>`,
                            text: `Order Confirmation - #${order.orderId}\n\nThank you for your order. We will notify you when your order is delivered.`
                        };

                        try {
                            await transporter.sendMail(customerMail);
                            console.log(`✅ Order confirmation sent to customer ${customerEmail} for order ${order.orderId}`);
                        } catch (custErr) {
                            console.error(`❌ Failed to send order confirmation to ${customerEmail} for order ${order.orderId}:`, custErr);
                        }
                    } else {
                        console.warn(`No customer email provided for order ${order.orderId}; skipping customer confirmation.`);
                    }
                } catch (custPrepareErr) {
                    console.error('Error preparing customer confirmation email:', custPrepareErr);
                }
            } catch (emailErr) {
                console.error('Error preparing admin notification email:', emailErr);
            }
        })();

        res.json({ success: true, message: 'Order saved successfully' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to save order' });
    }
});


// Email configuration file path
const EMAIL_CONFIG_FILE = path.join(__dirname, 'email-config.json');

// Load email configuration from file
let emailConfig = null;
let transporter = null;

function loadEmailConfig() {
    try {
        if (fs.existsSync(EMAIL_CONFIG_FILE)) {
            const data = fs.readFileSync(EMAIL_CONFIG_FILE, 'utf8');
            emailConfig = JSON.parse(data);
            createTransporter();
            return true;
        }
    } catch (error) {
        console.error('Error loading email config:', error);
    }
    return false;
}

function createTransporter() {
    if (!emailConfig) return;

    const config = {
        auth: {
            user: emailConfig.email,
            pass: emailConfig.password
        }
    };

    // Configure based on provider
    if (emailConfig.provider === 'gmail') {
        config.service = 'gmail';
    } else if (emailConfig.provider === 'outlook') {
        config.service = 'hotmail';
    } else if (emailConfig.provider === 'yahoo') {
        config.service = 'yahoo';
    }

    transporter = nodemailer.createTransport(config);
    
    // Verify transporter
    transporter.verify((error, success) => {
        if (error) {
            console.error('❌ Email transporter error:', error.message);
        } else {
            console.log('✅ Email server is ready to send messages');
            console.log(`📧 Sending from: ${emailConfig.email}`);
        }
    });
}

// Load config on startup
loadEmailConfig();

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Password reset server is running' });
});

// Get email configuration status
app.get('/api/email-status', (req, res) => {
    if (emailConfig) {
        res.json({
            configured: true,
            email: emailConfig.email,
            provider: emailConfig.provider
        });
    } else {
        res.json({ configured: false });
    }
});

// Configure email endpoint
app.post('/api/configure-email', async (req, res) => {
    const { provider, email, password } = req.body;

    if (!provider || !email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Provider, email, and password are required'
        });
    }

    try {
        // Save configuration
        emailConfig = { provider, email, password };
        fs.writeFileSync(EMAIL_CONFIG_FILE, JSON.stringify(emailConfig, null, 2));
        
        // Create new transporter
        createTransporter();
        
        res.json({
            success: true,
            message: 'Email configuration saved successfully'
        });
    } catch (error) {
        console.error('Error saving email config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save configuration'
        });
    }
});

// Test email configuration
app.post('/api/test-email', async (req, res) => {
    const { provider, email, password } = req.body;

    if (!provider || !email || !password) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required'
        });
    }

    try {
        // Create temporary transporter for testing
        const config = { auth: { user: email, pass: password } };
        
        if (provider === 'gmail') config.service = 'gmail';
        else if (provider === 'outlook') config.service = 'hotmail';
        else if (provider === 'yahoo') config.service = 'yahoo';
        
        const testTransporter = nodemailer.createTransport(config);
        
        // Verify connection
        await testTransporter.verify();
        
        res.json({
            success: true,
            message: 'Email configuration is valid'
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message || 'Email configuration test failed'
        });
    }
});

// Send verification code endpoint
app.post('/api/send-reset-code', async (req, res) => {
    const { email, code } = req.body;

    // Validation
    if (!email || !code) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and verification code are required' 
        });
    }

    // Check if email is configured
    if (!transporter || !emailConfig) {
        return res.status(503).json({
            success: false,
            message: 'Email service not configured. Please configure email first.'
        });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid email address' 
        });
    }

    // Code validation (6 digits)
    if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid verification code format' 
        });
    }

    // Email options
    const mailOptions = {
        from: {
            name: 'BuyPvaAccount',
            address: emailConfig.email
        },
        to: email,
        subject: 'Password Reset Verification Code - BuyPvaAccount',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .code-box { background: white; border: 2px dashed #667eea; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
                    .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
                    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
                    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Password Reset Request</h1>
                    </div>
                    <div class="content">
                        <p>Hello,</p>
                        <p>You have requested to reset your password for your BuyPvaAccount. Please use the verification code below to proceed:</p>
                        
                        <div class="code-box">
                            <div class="code">${code}</div>
                            <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">This code will expire in 10 minutes</p>
                        </div>

                        <div class="warning">
                            <strong>⚠️ Security Notice:</strong> If you did not request this password reset, please ignore this email. Your account remains secure.
                        </div>

                        <p>For security reasons, do not share this code with anyone.</p>
                        
                        <p>Best regards,<br><strong>BuyPvaAccount Team</strong></p>
                    </div>
                    <div class="footer">
                        <p>This is an automated message, please do not reply to this email.</p>
                        <p>&copy; 2025 BuyPvaAccount. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `
Password Reset Verification Code

Hello,

You have requested to reset your password for your BuyPvaAccount.

Your verification code is: ${code}

This code will expire in 10 minutes.

If you did not request this password reset, please ignore this email.

Best regards,
BuyPvaAccount Team
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Reset code sent to: ${email} (from: ${emailConfig.email})`);
        
        res.json({ 
            success: true, 
            message: 'Verification code sent successfully' 
        });
    } catch (error) {
        console.error('❌ Error sending email:', error);
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send verification code. Please check email configuration.' 
        });
    }
});

// Send order confirmation email endpoint
app.post('/api/send-order-confirmation', async (req, res) => {
    const { email, orderData } = req.body;

    // Validation
    if (!email || !orderData) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and order data are required' 
        });
    }

    // Check if email is configured
    if (!transporter || !emailConfig) {
        return res.status(503).json({
            success: false,
            message: 'Email service not configured.'
        });
    }

    // Build order items HTML
    let itemsHTML = '';
    orderData.items.forEach(item => {
        const unitPrice = item.unitPrice || item.price || 0;
        const itemTotal = item.total || (unitPrice * item.quantity);
        itemsHTML += `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${unitPrice.toFixed(2)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${itemTotal.toFixed(2)}</td>
            </tr>
        `;
    });

    // Email options
    const mailOptions = {
        from: {
            name: 'BuyPvaAccount',
            address: emailConfig.email
        },
        to: email,
        subject: `Order Confirmation #${orderData.orderId} - BuyPvaAccount`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .success-box { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .order-info { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
                    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                    .info-label { font-weight: bold; color: #666; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #dee2e6; }
                    .totals { background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 8px; }
                    .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
                    .grand-total { font-size: 18px; font-weight: bold; color: #667eea; padding-top: 10px; border-top: 2px solid #667eea; margin-top: 10px; }
                    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
                    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Thank You for Your Order!</h1>
                    </div>
                    <div class="content">
                        <p style="font-size: 16px; margin-bottom: 25px;">Your order has been successfully placed and is being processed.</p>

                        <div class="order-info">
                            <h2 style="margin-top: 0; color: #667eea;">Order Details</h2>
                            <div class="info-row">
                                <span class="info-label">Order Number:</span>
                                <span><strong>${orderData.orderId}</strong></span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Order Date:</span>
                                <span>${new Date(orderData.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Payment Method:</span>
                                <span>${orderData.paymentMethod === 'crypto' ? 'Cryptocurrency' : 'Cash on Delivery'}</span>
                            </div>
                            <div class="info-row" style="border-bottom: none;">
                                <span class="info-label">Status:</span>
                                <span style="color: #ffc107; font-weight: bold;">Pending</span>
                            </div>
                        </div>

                        <h3>Items Ordered:</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th style="text-align: center;">Qty</th>
                                    <th style="text-align: right;">Price</th>
                                    <th style="text-align: right;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHTML}
                                <tr>
                                    <td colspan="3" style="padding: 15px 10px; text-align: right; font-weight: bold; border-top: 2px solid #dee2e6;">Subtotal:</td>
                                    <td style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 18px; color: #667eea; border-top: 2px solid #dee2e6;">$${orderData.totals.tot.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <h3>Shipping Address:</h3>
                        <div class="order-info">
                            <p style="margin: 0;">
                                <strong>${orderData.customer.fullName}</strong><br>
                                ${orderData.customer.phone ? orderData.customer.phone + '<br>' : ''}
                                ${orderData.customer.email}<br>
                                ${orderData.customer.country || 'N/A'}
                                ${orderData.customer.extra ? '<br>' + orderData.customer.extra : ''}
                            </p>
                        </div>

                        <div style="text-align: center;">
                            <a href="https://buypvaaccount.com/profile.html" class="button">Track Your Order</a>
                        </div>

                        <p style="margin-top: 30px;">If you have any questions about your order, please contact our support team.</p>
                        
                        <p>Best regards,<br><strong>BuyPvaAccount Team</strong></p>
                    </div>
                    <div class="footer">
                        <p>This is an automated message, please do not reply to this email.</p>
                        <p>&copy; 2025 BuyPvaAccount. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `
Order Confirmation #${orderData.orderId}

Thank you for your order!

Order Details:
- Order Number: ${orderData.orderId}
- Order Date: ${new Date(orderData.createdAt).toLocaleDateString()}
- Payment Method: ${orderData.paymentMethod === 'crypto' ? 'Cryptocurrency' : 'Cash on Delivery'}
- Status: Pending

Shipping Address:
${orderData.customer.fullName}
${orderData.customer.phone}
${orderData.customer.email}
${orderData.customer.country}

Total: $${orderData.totals.tot.toFixed(2)}

Best regards,
BuyPvaAccount Team
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Order confirmation sent to: ${email} (Order: ${orderData.orderId})`);
        
        res.json({ 
            success: true, 
            message: 'Order confirmation sent successfully' 
        });
    } catch (error) {
        console.error('❌ Error sending order email:', error);
        
        res.json({ 
            success: false, 
            message: 'Failed to send order confirmation email'
        });
    }
});

// Send order delivery confirmation email endpoint
app.post('/api/send-order-delivery-confirmation', async (req, res) => {
    const { email, orderData } = req.body;

    // Validation
    if (!email || !orderData) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and order data are required' 
        });
    }

    // Check if email is configured
    if (!transporter || !emailConfig) {
        return res.status(503).json({
            success: false,
            message: 'Email service not configured.'
        });
    }

    // Build order items HTML
    let itemsHTML = '';
    orderData.items.forEach(item => {
        const unitPrice = item.unitPrice || item.price || 0;
        const itemTotal = item.total || (unitPrice * item.quantity);
        itemsHTML += `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${unitPrice.toFixed(2)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${itemTotal.toFixed(2)}</td>
            </tr>
        `;
    });

    // Email options
    const mailOptions = {
        from: {
            name: 'BuyPvaAccount',
            address: emailConfig.email
        },
        to: email,
        subject: `🎉 Order Delivered Successfully #${orderData.orderId} - BuyPvaAccount`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .success-box { background: #d4edda; border-left: 4px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 8px; }
                    .delivery-icon { font-size: 48px; margin-bottom: 15px; }
                    .order-info { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
                    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                    .info-label { font-weight: bold; color: #666; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #dee2e6; }
                    .download-section { background: #e3f2fd; border: 2px solid #2196f3; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
                    .download-button { display: inline-block; padding: 15px 30px; background: #2196f3; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 10px 0; }
                    .order-history { background: white; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea; }
                    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Order Successfully Delivered!</h1>
                    </div>
                    <div class="content">
                        <div class="success-box">
                            <div class="delivery-icon">📦✅</div>
                            <h2 style="margin: 0 0 10px 0; color: #28a745;">Your Order Has Been Delivered Successfully!</h2>
                            <p style="margin: 0; font-size: 16px;">Please check your profile's Download section to access your purchased items.</p>
                        </div>

                        <div class="order-info">
                            <h2 style="margin-top: 0; color: #667eea;">Order Details</h2>
                            <div class="info-row">
                                <span class="info-label">Order Number:</span>
                                <span><strong>${orderData.orderId}</strong></span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Order Date:</span>
                                <span>${new Date(orderData.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Delivery Date:</span>
                                <span>${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Payment Method:</span>
                                <span>${orderData.paymentMethod === 'crypto' ? 'Cryptocurrency' : 'Cash on Delivery'}</span>
                            </div>
                            <div class="info-row" style="border-bottom: none;">
                                <span class="info-label">Status:</span>
                                <span style="color: #28a745; font-weight: bold;">✅ Delivered</span>
                            </div>
                        </div>

                        <h3>Delivered Items:</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th style="text-align: center;">Qty</th>
                                    <th style="text-align: right;">Price</th>
                                    <th style="text-align: right;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHTML}
                                <tr>
                                    <td colspan="3" style="padding: 15px 10px; text-align: right; font-weight: bold; border-top: 2px solid #dee2e6;">Total Amount:</td>
                                    <td style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 18px; color: #667eea; border-top: 2px solid #dee2e6;">$${orderData.totals.tot.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="download-section">
                            <h3 style="margin: 0 0 15px 0; color: #1976d2;">📥 Access Your Downloads</h3>
                            <p style="margin: 0 0 20px 0;">Your purchased items are now available in your account. Click below to access them:</p>
                            <a href="https://buypvaaccount.com/profile.html" class="download-button">Go to Downloads</a>
                        </div>

                        <div class="order-history">
                            <h4 style="margin: 0 0 10px 0; color: #667eea;">📋 Order History Summary</h4>
                            <p style="margin: 0; font-size: 14px; color: #666;">
                                <strong>Order Placed:</strong> ${new Date(orderData.createdAt).toLocaleDateString()}<br>
                                <strong>Order Confirmed:</strong> ${new Date().toLocaleDateString()}<br>
                                <strong>Items Delivered:</strong> ${orderData.items.length} product(s)<br>
                                <strong>Total Value:</strong> $${orderData.totals.tot.toFixed(2)}
                            </p>
                        </div>

                        <h3>Shipping Address:</h3>
                        <div class="order-info">
                            <p style="margin: 0;">
                                <strong>${orderData.customer.fullName}</strong><br>
                                ${orderData.customer.phone ? orderData.customer.phone + '<br>' : ''}
                                ${orderData.customer.email}<br>
                                ${orderData.customer.country || 'N/A'}
                                ${orderData.customer.extra ? '<br>' + orderData.customer.extra : ''}
                            </p>
                        </div>

                        <p style="margin-top: 30px; text-align: center; font-size: 16px;">
                            Thank you for choosing BuyPvaAccount! We hope you enjoy your purchase.
                        </p>
                        
                        <p style="text-align: center;">Best regards,<br><strong>BuyPvaAccount Team</strong></p>
                    </div>
                    <div class="footer">
                        <p>This is an automated message, please do not reply to this email.</p>
                        <p>&copy; 2025 BuyPvaAccount. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `
Order Successfully Delivered #${orderData.orderId}

Your order has been delivered successfully!

Please check your profile's Download section to access your purchased items.

Order Details:
- Order Number: ${orderData.orderId}
- Order Date: ${new Date(orderData.createdAt).toLocaleDateString()}
- Delivery Date: ${new Date().toLocaleDateString()}
- Payment Method: ${orderData.paymentMethod === 'crypto' ? 'Cryptocurrency' : 'Cash on Delivery'}
- Status: Delivered
- Total Amount: $${orderData.totals.tot.toFixed(2)}

Shipping Address:
${orderData.customer.fullName}
${orderData.customer.phone}
${orderData.customer.email}
${orderData.customer.country}

Thank you for choosing BuyPvaAccount!

Best regards,
BuyPvaAccount Team
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Order delivery confirmation sent to: ${email} (Order: ${orderData.orderId})`);
        
        res.json({ 
            success: true, 
            message: 'Order delivery confirmation sent successfully' 
        });
    } catch (error) {
        console.error('❌ Error sending delivery email:', error);
        
        res.json({ 
            success: false, 
            message: 'Failed to send order delivery confirmation email'
        });
    }
});

// Helper to send delivery email for an order (used by endpoint and status update)
async function sendDeliveryEmail(orderData) {
    if (!transporter || !emailConfig) {
        throw new Error('Email service not configured');
    }

    // Build order items HTML
    let itemsHTML = '';
    (orderData.items || []).forEach(item => {
        const unitPrice = item.unitPrice || item.price || 0;
        const itemTotal = item.total || (unitPrice * item.quantity);
        itemsHTML += `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${Number(unitPrice).toFixed(2)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${Number(itemTotal).toFixed(2)}</td>
            </tr>
        `;
    });

    const mailOptions = {
        from: { name: 'BuyPvaAccount', address: emailConfig.email },
        to: orderData.customer?.email || orderData.email,
        subject: `🎉 Order Delivered Successfully #${orderData.orderId} - BuyPvaAccount`,
        html: `<!doctype html><html><body><h2>Order Delivered</h2><p>Order #: <strong>${orderData.orderId}</strong></p><table style="width:100%; border-collapse:collapse;">${itemsHTML}</table><p>Total: <strong>$${(orderData.totals && orderData.totals.tot) ? Number(orderData.totals.tot).toFixed(2) : '0.00'}</strong></p><p>Thank you for your purchase.</p></body></html>`,
        text: `Your order #${orderData.orderId} has been delivered. Total: $${(orderData.totals && orderData.totals.tot) ? Number(orderData.totals.tot).toFixed(2) : '0.00'}`
    };

    return transporter.sendMail(mailOptions);
}

// Endpoint to update order status and persist to orders.json
app.put('/api/orders/:orderId/status', async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!orderId || !status) {
        return res.status(400).json({ success: false, message: 'orderId and status are required' });
    }

    try {
        const orders = readAllOrders();
        const idx = orders.findIndex(o => String(o.orderId) === String(orderId));
        if (idx === -1) return res.status(404).json({ success: false, message: 'Order not found' });

        const oldStatus = orders[idx].status;
        orders[idx].status = status;
        // Add/update status change timestamp
        orders[idx].statusUpdatedAt = new Date().toISOString();

        const writeOk = writeAllOrders(orders);
        if (!writeOk) return res.status(500).json({ success: false, message: 'Failed to persist order status' });

        // If status moved to completed, attempt to send delivery email (non-blocking)
        if (status === 'completed') {
            (async () => {
                try {
                    await sendDeliveryEmail(orders[idx]);
                    console.log(`✅ Delivery email sent for order ${orderId}`);
                } catch (e) {
                    console.error(`❌ Failed to send delivery email for order ${orderId}:`, e.message || e);
                }
            })();
        }

        return res.json({ success: true, message: 'Order status updated', order: orders[idx], orders });
    } catch (err) {
        console.error('Error updating order status:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Endpoint to delete an order (persist deletion to orders.json)
app.delete('/api/orders/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!orderId) return res.status(400).json({ success: false, message: 'orderId required' });

        const orders = readAllOrders();
        const idx = orders.findIndex(o => String(o.orderId) === String(orderId));
        if (idx === -1) return res.status(404).json({ success: false, message: 'Order not found' });

        const removed = orders.splice(idx, 1)[0];
        const ok = writeAllOrders(orders);
        if (!ok) return res.status(500).json({ success: false, message: 'Failed to persist deletion' });

        console.log(`🗑️ Order deleted: ${orderId}`);
        return res.json({ success: true, message: 'Order deleted', order: removed, orders });
    } catch (err) {
        console.error('Error deleting order:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Endpoint to reset a user's password (updates registered_users.json)
app.post('/api/reset-password', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const users = readAllUsers();
        const idx = users.findIndex(u => (u.email || '').toLowerCase() === String(email).toLowerCase());
        if (idx === -1) {
            return res.status(404).json({ success: false, message: 'No account found for this email' });
        }

        // Store password as base64 to match existing format used by the frontend
        try {
            users[idx].password = Buffer.from(String(password)).toString('base64');
        } catch (e) {
            users[idx].password = btoa ? btoa(String(password)) : Buffer.from(String(password)).toString('base64');
        }

        const ok = writeAllUsers(users);
        if (!ok) return res.status(500).json({ success: false, message: 'Failed to persist new password' });

        console.log(`🔐 Password reset for ${email}`);
        return res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('Error in /api/reset-password:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Public login endpoint for clients
app.post('/api/login', (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const users = readAllUsers();
        const lowerEmail = String(email).toLowerCase();
        const user = users.find(u => (u.email || '').toLowerCase() === lowerEmail && (u.authType === 'email' || !u.authType));
        if (!user) {
            return res.status(404).json({ success: false, message: 'No account found with this email' });
        }

        // Compare password: stored passwords are base64 encoded in this project
        const encoded = Buffer.from(String(password)).toString('base64');
        const stored = String(user.password || '');
        if (stored !== encoded) {
            return res.status(401).json({ success: false, message: 'Incorrect password' });
        }

        // Return minimal user profile
        const safeUser = {
            email: user.email,
            fullName: user.fullName,
            phone: user.phone,
            country: user.country,
            authType: user.authType || 'email'
        };

        return res.json({ success: true, user: safeUser });
    } catch (err) {
        console.error('/api/login error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Password reset server running on http://localhost:${PORT}`);
    if (emailConfig) {
        console.log(`📧 Ready to send emails from: ${emailConfig.email}`);
    } else {
        console.log(`⚠️  Email not configured. Open http://localhost:${PORT}/config to set up`);
    }
});

// Serve email configuration page
app.get('/config', (req, res) => {
    res.sendFile(path.join(__dirname, 'email-config.html'));
});

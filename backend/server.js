const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

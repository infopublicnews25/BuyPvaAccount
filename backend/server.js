const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { verifyAdmin, createUser, getAllUsers, updateUser, deleteUser, verifyToken, storeUserToken, updateAdminCredentials } = require('./admin-auth');

// Media files path
const MEDIA_FILE = path.join(__dirname, '../media-files.json');
const FOLDERS_FILE = path.join(__dirname, '../media-folders.json');
const USERS_FILE = path.join(__dirname, '../registered_users.json');
const CATEGORIES_FILE = path.join(__dirname, '../categories.json');
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.floor(Math.random() * 1000000000) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|avi|mov|mkv|pdf|doc|docx|txt|xls|xlsx|ppt|pptx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// Helper to read all media files
function readAllMedia() {
    try {
        if (fs.existsSync(MEDIA_FILE)) {
            const data = fs.readFileSync(MEDIA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading media-files.json:', e);
    }
    return [];
}

// Helper to write all media files
function writeAllMedia(media) {
    try {
        fs.writeFileSync(MEDIA_FILE, JSON.stringify(media, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing media-files.json:', e);
        return false;
    }
}

// Helper to read all folders
function readAllFolders() {
    try {
        if (fs.existsSync(FOLDERS_FILE)) {
            const data = fs.readFileSync(FOLDERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading media-folders.json:', e);
    }
    return [];
}

// Helper to write all folders
function writeAllFolders(folders) {
    try {
        fs.writeFileSync(FOLDERS_FILE, JSON.stringify(folders, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing media-folders.json:', e);
        return false;
    }
}

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

// Logging function
function logAdminAction(action, details, adminUser = 'unknown') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ADMIN: ${adminUser} - ${action} - ${JSON.stringify(details)}\n`;
    try {
        fs.appendFileSync(path.join(__dirname, 'admin.log'), logEntry);
    } catch (e) {
        console.error('Error writing to admin log:', e);
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration - Smart origin handling for development and production
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5502',
        'http://127.0.0.1:5502',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        'https://buypvaaccount.com',
        'https://www.buypvaaccount.com'
    ];
    
    // In production, only allow specific origins
    // In development, allow all origins
    if (process.env.NODE_ENV === 'production') {
        if (allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        }
    } else {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

app.use(express.json());

// Trust proxy - needed for rate limiting with Nginx reverse proxy
app.set('trust proxy', 1);

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth attempts per windowMs
    message: 'Too many authentication attempts, please try again later.'
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 admin requests per windowMs
    message: 'Too many admin requests, please try again later.'
});

// Apply rate limiting to routes
app.use('/api/admin-login', authLimiter);
app.use('/api/login', authLimiter);
app.use('/api/save-user', authLimiter);
app.use('/api/check-user', authLimiter);
app.use('/api/send-reset-code', authLimiter);
app.use('/api/reset-password', authLimiter);
app.use('/api/admin/', adminLimiter);
app.use(generalLimiter);

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// HTTPS Enforcement - Disabled for Nginx reverse proxy (Nginx handles HTTP)
// app.use((req, res, next) => {
//     if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
//         res.redirect(`https://${req.header('host')}${req.url}`);
//     } else {
//         next();
//     }
// });

// Authentication middleware
const authenticateAdmin = async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        console.warn('❌ Auth failed: No token provided');
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const result = await verifyToken(token);
        if (result.success) {
            req.user = result.user;
            console.log(`✅ Auth successful for admin: ${req.user}`);
            next();
        } else {
            console.warn(`❌ Auth failed: Invalid token - ${result.message}`);
            res.status(401).json({ success: false, message: 'Invalid token' });
        }
    } catch (error) {
        console.error(`❌ Auth exception: ${error.message}`);
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

// Protected route for media-library.html
app.get('/media-library.html', authenticateAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'media-library.html'));
});

// Protected route for categories.html
app.get('/categories.html', authenticateAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'categories.html'));
});

// Serve static files from the parent directory (where admin.html is located)
// IMPORTANT: This must be configured to serve from root
app.use(express.static(path.join(__dirname, '..')));

// Redirect root to marketplace
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'marketplace.html'));
});

// Admin login endpoint
app.post('/api/admin-login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    try {
        const result = await verifyAdmin(username, password);
        if (result.success) {
            // Generate a secure random token (simple string instead of bcrypt hash for comparison)
            const token = require('crypto').randomBytes(32).toString('hex');

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

// ========== ADMIN ORDERS ENDPOINTS ==========

// Get all orders (admin only)
app.get('/api/admin/orders', authenticateAdmin, (req, res) => {
    try {
        const orders = readAllOrders();
        res.json({ success: true, orders });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});

// Update order status (admin only)
app.put('/api/admin/orders/:orderId/status', authenticateAdmin, async (req, res) => {
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
        orders[idx].statusUpdatedAt = new Date().toISOString();

        const writeOk = writeAllOrders(orders);
        if (!writeOk) return res.status(500).json({ success: false, message: 'Failed to persist order status' });

        // Log admin action
        logAdminAction('update_order_status', { orderId, oldStatus, status }, req.adminUser || 'admin');

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

        return res.json({ success: true, message: 'Order status updated', order: orders[idx] });
    } catch (err) {
        console.error('Error updating order status:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete order (admin only)
app.delete('/api/admin/orders/:orderId', authenticateAdmin, (req, res) => {
    const { orderId } = req.params;

    try {
        const orders = readAllOrders();
        const idx = orders.findIndex(o => String(o.orderId) === String(orderId));
        if (idx === -1) return res.status(404).json({ success: false, message: 'Order not found' });

        const removed = orders.splice(idx, 1)[0];
        const ok = writeAllOrders(orders);
        if (!ok) return res.status(500).json({ success: false, message: 'Failed to persist deletion' });

        // Log admin action
        logAdminAction('delete_order', { orderId, customerEmail: removed.customer?.email }, req.adminUser || 'admin');

        console.log(`🗑️ Order deleted: ${orderId}`);
        return res.json({ success: true, message: 'Order deleted', order: removed });
    } catch (err) {
        console.error('Error deleting order:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get analytics data (admin only)
app.get('/api/admin/analytics', authenticateAdmin, (req, res) => {
    try {
        const orders = readAllOrders();
        const users = readAllUsers();

        // Calculate total revenue
        const totalRevenue = orders.reduce((sum, order) => {
            if (order.status === 'completed' && order.totals && order.totals.tot) {
                return sum + parseFloat(order.totals.tot);
            }
            return sum;
        }, 0);

        // Calculate total orders
        const totalOrders = orders.length;

        // Calculate total customers (unique emails)
        const uniqueCustomers = new Set();
        orders.forEach(order => {
            if (order.customer?.email) {
                uniqueCustomers.add(order.customer.email.toLowerCase());
            } else if (order.email) {
                uniqueCustomers.add(order.email.toLowerCase());
            }
        });
        const totalCustomers = uniqueCustomers.size;

        // Calculate average order value
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        // Revenue trend for last 30 days
        const revenueTrend = [];
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const dayRevenue = orders.reduce((sum, order) => {
                if (order.status === 'completed' && order.createdAt) {
                    const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
                    if (orderDate === dateStr && order.totals && order.totals.tot) {
                        return sum + parseFloat(order.totals.tot);
                    }
                }
                return sum;
            }, 0);

            revenueTrend.push({
                date: dateStr,
                amount: dayRevenue
            });
        }

        // Order status distribution
        const orderStatusDistribution = {
            pending: orders.filter(o => o.status === 'pending').length,
            processing: orders.filter(o => o.status === 'processing').length,
            completed: orders.filter(o => o.status === 'completed').length,
            cancelled: orders.filter(o => o.status === 'cancelled').length
        };

        // Recent orders (last 10)
        const recentOrders = orders
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, 10)
            .map(order => ({
                id: order.orderId,
                customerEmail: order.customer?.email || order.email || 'N/A',
                productName: order.items && order.items.length > 0 ? order.items[0].name : 'N/A',
                amount: order.totals && order.totals.tot ? parseFloat(order.totals.tot) : 0,
                status: order.status || 'pending',
                date: order.createdAt || new Date().toISOString()
            }));

        // Top products
        const productStats = {};
        orders.forEach(order => {
            if (order.status === 'completed' && order.items) {
                order.items.forEach(item => {
                    const key = item.name || 'Unknown Product';
                    if (!productStats[key]) {
                        productStats[key] = {
                            name: key,
                            sales: 0,
                            revenue: 0,
                            category: item.category || 'General'
                        };
                    }
                    productStats[key].sales += item.quantity || 1;
                    productStats[key].revenue += item.total || (item.price * (item.quantity || 1)) || 0;
                });
            }
        });

        const topProducts = Object.values(productStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        res.json({
            success: true,
            totalRevenue,
            totalOrders,
            totalCustomers,
            avgOrderValue,
            revenueTrend,
            orderStatusDistribution,
            recentOrders,
            topProducts
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch analytics data' });
    }
});

// Admin verification endpoint
app.get('/api/admin/verify', authenticateAdmin, (req, res) => {
    try {
        res.json({
            success: true,
            user: req.user,
            message: 'Admin access verified'
        });
    } catch (error) {
        console.error('Error verifying admin:', error);
        res.status(500).json({ success: false, message: 'Failed to verify admin access' });
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

// API to check if user exists
app.post('/api/check-user', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const users = readAllUsers();
    const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
    res.json({ exists });
});

// API to save a new user
app.post('/api/save-user', async (req, res) => {
    const user = req.body;
    if (!user || !user.email || !user.password) {
        return res.status(400).json({ success: false, message: 'User data missing or invalid' });
    }
    const users = readAllUsers();
    if (users.some(u => u.email === user.email)) {
        return res.status(409).json({ success: false, message: 'User already exists' });
    }
    try {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        const newUser = {
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            country: user.country,
            passwordHash: hashedPassword,
            authType: user.authType || 'email',
            createdAt: user.createdAt || new Date().toISOString()
        };
        users.push(newUser);
        if (writeAllUsers(users)) {
            res.json({ success: true, message: 'User saved successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save user' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error hashing password' });
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


// Helper function to send order confirmation emails
async function sendOrderConfirmationEmails(order) {
    try {
        // Wait for email transporter to be ready
        let attempts = 0;
        while ((!transporter || !emailConfig) && attempts < 15) {
            console.log(`⏳ Email transporter initializing... (attempt ${attempts + 1}/15)`);
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;
        }

        if (!transporter || !emailConfig) {
            console.warn(`⚠️ Email transporter not ready after ${attempts} attempts. Emails not sent.`);
            return false;
        }

        // Build items HTML table
        let itemsHTML = '';
        (order.items || []).forEach(item => {
            const unitPrice = item.unitPrice || item.price || 0;
            const itemTotal = item.total || (unitPrice * (item.quantity || 1));
            itemsHTML += `<tr><td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td><td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity || 1}</td><td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${Number(unitPrice).toFixed(2)}</td><td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${Number(itemTotal).toFixed(2)}</td></tr>`;
        });

        const customerEmail = order.customer?.email || order.email;
        const customerName = order.customer?.fullName || customerEmail;

        // 1. Send admin notification
        try {
            const adminMailOptions = {
                from: `"BuyPvaAccount" <${emailConfig.email}>`,
                to: ADMIN_EMAIL,
                subject: `🔔 New Order Received: #${order.orderId}`,
                html: `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;color:#333;}h2{color:#2563eb;}table{width:100%;border-collapse:collapse;}td{padding:10px;border-bottom:1px solid #eee;}</style></head><body><h2>📦 New Order Received</h2><p><strong>Order #:</strong> ${order.orderId}</p><p><strong>Customer:</strong> ${customerName}</p><p><strong>Email:</strong> ${customerEmail}</p><p><strong>Phone:</strong> ${order.customer?.phone || 'N/A'}</p><p><strong>Country:</strong> ${order.customer?.country || 'N/A'}</p><h3>Order Items:</h3><table><tr><th style="text-align:left;padding:10px;">Product</th><th style="text-align:center;padding:10px;">Qty</th><th style="text-align:right;padding:10px;">Price</th><th style="text-align:right;padding:10px;">Total</th></tr>${itemsHTML}</table><p style="font-size:18px;"><strong>Grand Total: $${(order.totals && order.totals.tot) ? Number(order.totals.tot).toFixed(2) : '0.00'}</strong></p><p><strong>Payment Method:</strong> ${order.paymentMethod || 'COD'}</p><p>Visit your <a href="${process.env.SITE_URL || 'http://localhost:3000'}/ordermanagement.html">Admin Dashboard</a> to manage this order.</p></body></html>`,
                text: `New order #${order.orderId} from ${customerName} (${customerEmail})`
            };
            
            await transporter.sendMail(adminMailOptions);
            console.log(`✅ Admin email sent for order ${order.orderId} to ${ADMIN_EMAIL}`);
        } catch (adminErr) {
            console.error(`❌ Failed to send admin email for order ${order.orderId}:`, adminErr.message);
        }

        // 2. Send customer confirmation email
        if (customerEmail) {
            try {
                const customerMailOptions = {
                    from: `"BuyPvaAccount" <${emailConfig.email}>`,
                    to: customerEmail,
                    subject: `✅ Order Confirmation: #${order.orderId}`,
                    html: `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;color:#333;}.container{max-width:600px;margin:0 auto;}h2{color:#16a34a;}.order-info{background:#f5f5f5;padding:15px;border-radius:5px;margin:15px 0;}table{width:100%;border-collapse:collapse;}td{padding:10px;border-bottom:1px solid #eee;}.footer{color:#666;font-size:12px;margin-top:20px;}</style></head><body><div class="container"><h2>Thank You for Your Order! ✅</h2><p>Hello <strong>${order.customer?.first || customerName},</strong></p><p>We have successfully received your order. Here are your order details:</p><div class="order-info"><p><strong>Order Number:</strong> ${order.orderId}</p><p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p><p><strong>Payment Method:</strong> ${order.paymentMethod || 'Cash on Delivery'}</p></div><h3>Order Items:</h3><table><tr><th style="text-align:left;padding:10px;">Product</th><th style="text-align:center;padding:10px;">Qty</th><th style="text-align:right;padding:10px;">Price</th><th style="text-align:right;padding:10px;">Total</th></tr>${itemsHTML}</table><p style="text-align:right;font-size:18px;margin-top:15px;"><strong>Total Amount: $${(order.totals && order.totals.tot) ? Number(order.totals.tot).toFixed(2) : '0.00'}</strong></p><h3>Next Steps:</h3><p>We will process your order shortly and send you an update once it's completed. You can track your order status on our <a href="${process.env.SITE_URL || 'http://localhost:3000'}/profile.html">Customer Portal</a>.</p><p>If you have any questions, please contact us at <strong>info.buypva@gmail.com</strong></p><div class="footer"><p>Best regards,<br/><strong>BuyPvaAccount Team</strong></p><p>This is an automated email. Please do not reply directly to this email.</p></div></div></body></html>`,
                    text: `Thank you for your order #${order.orderId}. We have received your order and will process it shortly. Total: $${(order.totals && order.totals.tot) ? Number(order.totals.tot).toFixed(2) : '0.00'}`
                };
                
                await transporter.sendMail(customerMailOptions);
                console.log(`✅ Customer confirmation email sent to ${customerEmail} for order ${order.orderId}`);
            } catch (custErr) {
                console.error(`❌ Failed to send customer email to ${customerEmail}:`, custErr.message);
            }
        } else {
            console.warn(`⚠️ No customer email for order ${order.orderId}`);
        }
        
        return true;
    } catch (err) {
        console.error('Error sending confirmation emails:', err);
        return false;
    }
}

// API to save a new order
app.post('/api/save-order', (req, res) => {
    const order = req.body;
    if (!order || !order.orderId) {
        return res.status(400).json({ success: false, message: 'Order data missing or invalid' });
    }
    console.log(`📦 New order received: ${order.orderId} from ${order.customer?.email || order.email || 'unknown'}`);
    const orders = readAllOrders();
    orders.push(order);
    if (writeAllOrders(orders)) {
        console.log(`📦 Order saved to database: ${order.orderId}`);
        
        // Send confirmation emails asynchronously (don't block response)
        sendOrderConfirmationEmails(order).catch(err => {
            console.error('Error in order confirmation email task:', err);
        });

        res.json({ success: true, message: 'Order saved successfully' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to save order' });
    }
});


// Email configuration file path
const EMAIL_CONFIG_FILE = path.join(__dirname, 'email-config.json');

// Load email configuration from environment variables
let emailConfig = null;
let transporter = null;

function loadEmailConfig() {
    try {
        // Load from environment variables instead of file
        const emailUser = process.env.EMAIL_USER;
        const emailPassword = process.env.EMAIL_PASSWORD;
        const emailProvider = process.env.EMAIL_PROVIDER || 'gmail';

        if (emailUser && emailPassword) {
            emailConfig = {
                provider: emailProvider,
                email: emailUser,
                password: emailPassword
            };
            createTransporter();
            return true;
        } else {
            console.warn('⚠️ Email configuration not found in environment variables');
            // Fallback to file for backward compatibility (remove after migration)
            if (fs.existsSync(EMAIL_CONFIG_FILE)) {
                const data = fs.readFileSync(EMAIL_CONFIG_FILE, 'utf8');
                emailConfig = JSON.parse(data);
                createTransporter();
                console.log('📧 Using legacy email config from file (MIGRATE TO .env ASAP)');
                return true;
            }
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

// Helper function to send signup confirmation email
async function sendSignupConfirmationEmail(email, fullName) {
    try {
        // Initialize transporter if not already done
        if (!transporter) {
            console.log('📧 Initializing email transporter...');
            const emailUser = process.env.EMAIL_USER || process.env.GMAIL_USER;
            const emailPass = process.env.EMAIL_PASSWORD || process.env.GMAIL_PASSWORD;
            
            if (!emailUser || !emailPass) {
                console.warn('⚠️ Email credentials not configured in .env file');
                console.log(`📧 Would send email to: ${email}`);
                return;
            }
            
            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: emailUser,
                    pass: emailPass
                }
            });
        }

        const mailOptions = {
            from: process.env.EMAIL_USER || process.env.GMAIL_USER,
            to: email,
            subject: '✅ Welcome to BuyPvaAccount - Account Created Successfully',
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                    <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #667eea; margin: 0; font-size: 28px;">🎉 Account Created!</h1>
                            <p style="color: #666; margin: 10px 0 0 0; font-size: 14px;">Welcome to BuyPvaAccount</p>
                        </div>

                        <!-- Main Content -->
                        <div style="color: #333; line-height: 1.6;">
                            <p style="margin-top: 0;">Hi <strong>${fullName}</strong>,</p>
                            
                            <p>Welcome to BuyPvaAccount! Your account has been successfully created.</p>

                            <div style="background: #f0f4ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
                                <p style="margin: 0; color: #667eea;"><strong>📧 Account Details</strong></p>
                                <p style="margin: 10px 0 0 0; color: #666;">Email: <strong>${email}</strong></p>
                            </div>

                            <h3 style="color: #333; margin: 25px 0 10px 0;">What's Next?</h3>
                            <ol style="color: #666; padding-left: 20px;">
                                <li>Log in to your account</li>
                                <li>Complete your profile</li>
                                <li>Start shopping for premium PVA accounts</li>
                            </ol>

                            <div style="text-align: center; margin: 30px 0;">
                                <a href="http://localhost:3000/login.html?email=${encodeURIComponent(email)}" 
                                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                                    Login to Your Account
                                </a>
                            </div>

                            <h3 style="color: #333; margin: 25px 0 10px 0;">🔒 Security Tips</h3>
                            <ul style="color: #666; padding-left: 20px;">
                                <li>Never share your password with anyone</li>
                                <li>We will never ask for your password via email</li>
                                <li>Keep your account information secure</li>
                            </ul>

                            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #999; font-size: 12px; text-align: center;">
                                If you have any questions, please contact our support team.
                            </p>
                        </div>

                        <!-- Footer -->
                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f0f0f0; color: #999; font-size: 12px;">
                            <p style="margin: 0;">© 2025 BuyPvaAccount. All rights reserved.</p>
                            <p style="margin: 10px 0 0 0;">This email was sent because an account was created with this email address.</p>
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 ✅ Signup confirmation email sent to: ${email}`);
    } catch (err) {
        console.error(`❌ Error sending email to ${email}:`, err.message);
        // Don't throw - allow signup to continue even if email fails
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Password reset server is running' });
});

// CSRF Token endpoint
app.get('/api/csrf-token', (req, res) => {
    // Generate a simple session-based CSRF token
    const sessionId = Buffer.from(Date.now().toString() + Math.random().toString()).toString('base64');
    const csrfToken = Buffer.from(Math.random().toString() + Date.now().toString()).toString('base64');
    
    res.json({
        success: true,
        sessionId: sessionId,
        csrfToken: csrfToken,
        message: 'CSRF token generated successfully'
    });
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

// Configure email endpoint (DEPRECATED - use .env file instead)
app.post('/api/configure-email', async (req, res) => {
    const { provider, email, password } = req.body;

    if (!provider || !email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Provider, email, and password are required'
        });
    }

    try {
        // DEPRECATED: No longer saves to file - use .env instead
        console.warn('⚠️ /api/configure-email is deprecated. Use .env file for email configuration.');

        // For backward compatibility, still create transporter but don't save
        emailConfig = { provider, email, password };
        createTransporter();

        res.json({
            success: true,
            message: 'Email configuration applied (temporarily - use .env for permanent config)',
            warning: 'This configuration will be lost on server restart. Use .env file instead.'
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
    try {
        const { email, code } = req.body;
        console.log('📨 Received password reset request for:', email);

        // Validation
        if (!email || !code) {
            return res.status(400).json({
                success: false,
                message: 'Email and verification code are required'
            });
        }

        // Check if email is configured - with better diagnostics
        if (!transporter || !emailConfig) {
            console.error('❌ Email not configured. Transporter:', !!transporter, 'Config:', !!emailConfig);
            // Reload config if failed
            loadEmailConfig();
            
            if (!transporter || !emailConfig) {
                console.error('❌ Still no email config after reload. User:', process.env.EMAIL_USER, 'Provider:', process.env.EMAIL_PROVIDER);
                return res.status(503).json({
                    success: false,
                    message: 'Email service not configured. Please configure email first.'
                });
            }
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

        console.log('📧 Attempting to send email...');
        await transporter.sendMail(mailOptions);
        console.log(`✅ Reset code sent to: ${email} (from: ${emailConfig.email})`);

        res.json({
            success: true,
            message: 'Verification code sent successfully'
        });
    } catch (error) {
        console.error('❌ Error in send-reset-code:', error.message);
        console.error('Full error stack:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to send verification code. Please try again or contact support.'
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

// Endpoint to send ticket confirmation email
app.post('/api/send-ticket-confirmation', async (req, res) => {
    try {
        const { email, ticketData } = req.body;

        // Validation
        if (!email || !ticketData) {
            return res.status(400).json({
                success: false,
                message: 'Email and ticket data are required'
            });
        }

        // Check if email is configured
        if (!transporter || !emailConfig) {
            return res.status(503).json({
                success: false,
                message: 'Email service not configured.'
            });
        }

        const mailOptions = {
            from: { name: 'BuyPvaAccount Support', address: emailConfig.email },
            to: email,
            subject: `Support Ticket Created - #${ticketData.trackingId}`,
            html: `<!doctype html><html><body>
                <h2>Support Ticket Confirmation</h2>
                <p>Ticket #: <strong>${ticketData.trackingId}</strong></p>
                <p>Hello ${ticketData.name || email},</p>
                <p>Thank you for contacting BuyPvaAccount support. We have received your support request and created a ticket for you.</p>

                <h3>Ticket Details</h3>
                <table style="width:100%; border-collapse:collapse; margin: 20px 0;">
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Tracking ID:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.trackingId}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Category:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.category}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Priority:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.priority}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Subject:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.subject}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Status:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">Open</td>
                    </tr>
                </table>

                <h3>Account/Order Information</h3>
                <table style="width:100%; border-collapse:collapse; margin: 20px 0;">
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Account Platform:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.accountType || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Order/Account URL:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.accountLink ? `<a href="${ticketData.accountLink}">${ticketData.accountLink}</a>` : 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Purchase Date:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.paymentDate || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Payment Method:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.paymentMethod || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Transaction Details:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.paymentDetails || 'N/A'}</td>
                    </tr>
                    ${ticketData.attachments && ticketData.attachments.length > 0 ?
                        `<tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Attachments:</strong></td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.attachments.length} file(s) attached</td>
                        </tr>` : ''}
                </table>

                <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1976d2;">View Your Ticket</h3>
                    <p>You can track your ticket status and view all updates by clicking the link below:</p>
                    <p style="margin: 15px 0;">
                        <a href="${ticketData.ticketLink}" style="background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                            👁️ View Your Support Ticket
                        </a>
                    </p>
                    <p><strong>Important:</strong> Please save this link for future reference. You will receive email updates about your ticket status.</p>
                </div>

                <h3>Your Message</h3>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 6px; border-left: 4px solid #1976d2;">
                    ${ticketData.message.replace(/\n/g, '<br>')}
                </div>

                <p style="margin-top: 30px;">
                    <strong>Response Time:</strong> Our support team typically responds within 2-4 hours during business hours.
                </p>

                <p>If you have any additional information or attachments to add to this ticket, please use the link above to access your ticket and add a reply.</p>

                <p>Best regards,<br/>
                BuyPvaAccount Support Team<br/>
                <a href="https://buypvaaccount.com/support">Visit our support page</a></p>
            </body></html>`,
            text: `Support Ticket Confirmation - #${ticketData.trackingId}

Hello ${ticketData.name || email},

Thank you for contacting BuyPvaAccount support. We have received your support request.

Ticket Details:
- Tracking ID: ${ticketData.trackingId}
- Category: ${ticketData.category}
- Priority: ${ticketData.priority}
- Subject: ${ticketData.subject}
- Status: Open

Account/Order Information:
- Account Platform: ${ticketData.accountType || 'N/A'}
- Order/Account URL: ${ticketData.accountLink || 'N/A'}
- Purchase Date: ${ticketData.paymentDate || 'N/A'}
- Payment Method: ${ticketData.paymentMethod || 'N/A'}
- Transaction Details: ${ticketData.paymentDetails || 'N/A'}
${ticketData.attachments && ticketData.attachments.length > 0 ? `- Attachments: ${ticketData.attachments.length} file(s)` : ''}

View your ticket: ${ticketData.ticketLink}

Your Message:
${ticketData.message}

Response Time: Our support team typically responds within 2-4 hours.

Best regards,
BuyPvaAccount Support Team`
        };

        await transporter.sendMail(mailOptions);

        console.log(`✅ Ticket confirmation email sent to ${email} for ticket ${ticketData.trackingId}`);
        return res.json({
            success: true,
            message: 'Ticket confirmation email sent successfully'
        });

    } catch (error) {
        console.error('Error sending ticket confirmation email:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send ticket confirmation email',
            error: error.message
        });
    }
});

// Endpoint to save support ticket
app.post('/api/ticket', async (req, res) => {
    try {
        const ticket = req.body;
        if (!ticket.trackingId || !ticket.email) {
            return res.status(400).json({ success: false, message: 'trackingId and email required' });
        }

        // Create tickets.json file if it doesn't exist
        const ticketsFile = path.join(__dirname, '..', 'tickets.json');
        let tickets = [];
        if (fs.existsSync(ticketsFile)) {
            tickets = JSON.parse(fs.readFileSync(ticketsFile, 'utf8'));
        }

        // Add ticket
        tickets.push(ticket);
        fs.writeFileSync(ticketsFile, JSON.stringify(tickets, null, 2));

        console.log(`✅ Ticket saved: ${ticket.trackingId}`);
        return res.json({ success: true, message: 'Ticket saved successfully' });
    } catch (error) {
        console.error('Error saving ticket:', error);
        return res.status(500).json({ success: false, message: 'Failed to save ticket' });
    }
});

// Endpoint to retrieve support ticket by token
app.get('/api/ticket/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Extract tracking ID from token - try multiple formats
        // Format could be: tk_timestamp_randomstring or other variations
        // We'll need to search by tracking ID
        
        // For now, assume token contains or is the tracking ID
        // In a real app, you'd have a token-to-trackingID mapping
        
        const ticketsFile = path.join(__dirname, '..', 'tickets.json');
        if (!fs.existsSync(ticketsFile)) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        const tickets = JSON.parse(fs.readFileSync(ticketsFile, 'utf8'));
        
        // Try to find ticket - could be by token or by tracking ID if token is the tracking ID
        let ticket = tickets.find(t => t.trackingId === token);
        
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        return res.json({ success: true, ticket: ticket });
    } catch (error) {
        console.error('Error retrieving ticket:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve ticket' });
    }
});

// Endpoint to send ticket completion email
app.post('/api/send-ticket-completion', async (req, res) => {
    try {
        const { email, ticketData } = req.body;

        if (!email || !ticketData) {
            return res.status(400).json({
                success: false,
                message: 'Email and ticket data are required'
            });
        }

        if (!transporter || !emailConfig) {
            return res.status(503).json({
                success: false,
                message: 'Email service not configured.'
            });
        }

        const mailOptions = {
            from: { name: 'BuyPvaAccount Support', address: emailConfig.email },
            to: email,
            subject: `✅ Your Support Ticket #${ticketData.trackingId} Has Been Resolved!`,
            html: `<!doctype html><html><body>
                <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                    <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h2 style="margin: 0;">✅ Ticket Resolved!</h2>
                    </div>
                    
                    <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
                        <p>Hello ${ticketData.name || email},</p>
                        
                        <p>Great news! Your support ticket has been <strong>successfully resolved</strong>.</p>

                        <div style="background: white; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0;">
                            <h3 style="color: #059669; margin-top: 0;">Ticket Details</h3>
                            <table style="width:100%; border-collapse:collapse;">
                                <tr>
                                    <td style="padding: 10px; background: #f3f4f6; font-weight: bold;">Tracking ID:</td>
                                    <td style="padding: 10px;">${ticketData.trackingId}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; background: #f3f4f6; font-weight: bold;">Category:</td>
                                    <td style="padding: 10px;">${ticketData.category}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; background: #f3f4f6; font-weight: bold;">Priority:</td>
                                    <td style="padding: 10px;">${ticketData.priority}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; background: #f3f4f6; font-weight: bold;">Subject:</td>
                                    <td style="padding: 10px;">${ticketData.subject}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; background: #f3f4f6; font-weight: bold;">Status:</td>
                                    <td style="padding: 10px; color: #10b981; font-weight: bold;">✅ RESOLVED</td>
                                </tr>
                            </table>
                        </div>

                        <p><strong>What's Next?</strong></p>
                        <ul>
                            <li>Your issue has been resolved by our support team</li>
                            <li>If you need further assistance, you can reply to your ticket or submit a new request</li>
                            <li>We appreciate your patience and business!</li>
                        </ul>

                        <p style="text-align: center; margin-top: 30px;">
                            <a href="https://buypvaaccount.com/support" style="background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                Visit Support Center
                            </a>
                        </p>

                        <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
                            Thank you for choosing BuyPvaAccount!<br/>
                            Best regards,<br/>
                            <strong>BuyPvaAccount Support Team</strong>
                        </p>
                    </div>
                </div>
            </body></html>`,
            text: `Your Support Ticket #${ticketData.trackingId} Has Been Resolved!

Hello ${ticketData.name || email},

Great news! Your support ticket has been successfully resolved.

Ticket Details:
- Tracking ID: ${ticketData.trackingId}
- Category: ${ticketData.category}
- Priority: ${ticketData.priority}
- Subject: ${ticketData.subject}
- Status: ✅ RESOLVED

If you need further assistance, you can reply to your ticket or submit a new request at https://buypvaaccount.com/support

Thank you for choosing BuyPvaAccount!
Best regards,
BuyPvaAccount Support Team`
        };

        await transporter.sendMail(mailOptions);

        console.log(`✅ Ticket completion email sent to ${email} for ticket ${ticketData.trackingId}`);
        return res.json({
            success: true,
            message: 'Ticket completion email sent successfully'
        });

    } catch (error) {
        console.error('Error sending ticket completion email:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send ticket completion email',
            error: error.message
        });
    }
});

// Endpoint to reset a user's password (updates registered_users.json)
app.post('/api/reset-password', async (req, res) => {
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

        // Hash password securely with bcrypt
        const hashedPassword = await bcrypt.hash(password, 12);

        // Update user with hashed password
        users[idx].passwordHash = hashedPassword;
        delete users[idx].password; // Remove old base64 password if exists

        // Add reset metadata
        users[idx].passwordResetAt = new Date().toISOString();

        const ok = writeAllUsers(users);
        if (!ok) return res.status(500).json({ success: false, message: 'Failed to persist new password' });

        console.log(`🔐 Password reset for ${email} (secure hash)`);
        return res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('Error in /api/reset-password:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Public signup endpoint for clients
app.post('/api/signup', async (req, res) => {
    try {
        const { fullName, email, phone, country, password, authType } = req.body || {};
        
        // Validate required fields
        if (!fullName || !email || !phone || !country || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }
        
        const users = readAllUsers();
        const lowerEmail = String(email).toLowerCase();
        
        // Check if user already exists
        const existingUser = users.find(u => (u.email || '').toLowerCase() === lowerEmail);
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists' });
        }
        
        // Hash password with bcrypt
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Create new user
        const newUser = {
            fullName: fullName.trim(),
            email: lowerEmail,
            phone: phone.trim(),
            country: country.trim(),
            authType: authType || 'email',
            passwordHash: passwordHash,
            passwordMigrated: true,
            passwordMigratedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        
        // Add user to database
        users.push(newUser);
        
        if (!writeAllUsers(users)) {
            return res.status(500).json({ success: false, message: 'Failed to save user' });
        }
        
        // Return success with user data (without password)
        const safeUser = {
            email: newUser.email,
            fullName: newUser.fullName,
            phone: newUser.phone,
            country: newUser.country,
            authType: newUser.authType
        };
        
        // Send signup confirmation email (non-blocking)
        sendSignupConfirmationEmail(newUser.email, newUser.fullName).catch(err => {
            console.warn('⚠️ Failed to send signup confirmation email:', err.message);
        });
        
        return res.json({ success: true, message: 'Account created successfully', user: safeUser });
    } catch (err) {
        console.error('/api/signup error:', err);
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// Auto-register endpoint for users created during checkout
// This creates a user with a temporary password that can be reset via forgot-password
app.post('/api/auto-register', async (req, res) => {
    try {
        const { fullName, email, phone, country } = req.body || {};
        
        // Validate required fields
        if (!fullName || !email) {
            return res.status(400).json({ success: false, message: 'Full name and email are required' });
        }
        
        const users = readAllUsers();
        const lowerEmail = String(email).toLowerCase();
        
        // Check if user already exists
        const existingUser = users.find(u => (u.email || '').toLowerCase() === lowerEmail);
        if (existingUser) {
            // User exists, just return success
            return res.json({ success: true, message: 'User already exists', isNew: false });
        }
        
        // Generate temporary password (user will reset it via forgot-password)
        const tempPassword = 'Temp' + Math.random().toString(36).substr(2, 12);
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(tempPassword, saltRounds);
        
        // Create new auto-registered user
        const newUser = {
            fullName: fullName.trim(),
            email: lowerEmail,
            phone: (phone || '').trim(),
            country: (country || '').trim(),
            authType: 'email',
            autoCreated: true,
            passwordHash: passwordHash,
            passwordMigrated: true,
            passwordMigratedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        
        // Add user to database
        users.push(newUser);
        
        if (!writeAllUsers(users)) {
            return res.status(500).json({ success: false, message: 'Failed to save user' });
        }
        
        return res.json({ 
            success: true, 
            message: 'User auto-registered successfully', 
            isNew: true,
            user: {
                email: newUser.email,
                fullName: newUser.fullName,
                authType: newUser.authType
            }
        });
    } catch (err) {
        console.error('/api/auto-register error:', err);
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// Public login endpoint for clients
app.post('/api/login', async (req, res) => {
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

        // Compare password with bcrypt or fallback to base64 for old users
        let isValid = false;
        try {
            if (user.passwordHash) {
                isValid = await bcrypt.compare(password, user.passwordHash);
            } else {
                throw new Error('no hash');
            }
        } catch (e) {
            // Fallback to base64 for old users
            if (user.password) {
                const encoded = Buffer.from(String(password)).toString('base64');
                isValid = encoded === user.password;
            }
        }
        if (!isValid) {
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

// Blog posts file path
const POSTS_FILE = path.join(__dirname, '../posts.json');

// Helper to read all posts
function readAllPosts() {
    try {
        if (fs.existsSync(POSTS_FILE)) {
            const data = fs.readFileSync(POSTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading posts.json:', e);
    }
    return [];
}

// Helper to write all posts
function writeAllPosts(posts) {
    try {
        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing posts.json:', e);
        return false;
    }
}

// Get all posts
app.get('/api/posts', (req, res) => {
    try {
        const posts = readAllPosts();
        res.json({ success: true, posts });
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch posts' });
    }
});

// Get single post by ID
app.get('/api/posts/:id', (req, res) => {
    try {
        const posts = readAllPosts();
        const post = posts.find(p => p.id === req.params.id);

        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        res.json({ success: true, post });
    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch post' });
    }
});

// Create new post
app.post('/api/posts', (req, res) => {
    try {
        const newPost = req.body;

        if (!newPost.title || !newPost.slug || !newPost.content) {
            return res.status(400).json({
                success: false,
                message: 'Title, slug, and content are required'
            });
        }

        const posts = readAllPosts();

        // Check for duplicate slug
        if (posts.some(p => p.slug === newPost.slug)) {
            return res.status(409).json({
                success: false,
                message: 'A post with this slug already exists'
            });
        }

        posts.push(newPost);

        if (writeAllPosts(posts)) {
            res.json({ success: true, message: 'Post created successfully', post: newPost });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save post' });
        }
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ success: false, message: 'Failed to create post' });
    }
});

// Update existing post
app.put('/api/posts/:id', (req, res) => {
    try {
        const postId = req.params.id;
        const updatedPost = req.body;
        const posts = readAllPosts();
        const index = posts.findIndex(p => p.id === postId);

        if (index === -1) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        // Check for duplicate slug (excluding current post)
        if (posts.some(p => p.slug === updatedPost.slug && p.id !== postId)) {
            return res.status(409).json({
                success: false,
                message: 'A post with this slug already exists'
            });
        }

        posts[index] = { ...posts[index], ...updatedPost, updatedAt: new Date().toISOString() };

        if (writeAllPosts(posts)) {
            res.json({ success: true, message: 'Post updated successfully', post: posts[index] });
        } else {
            res.status(500).json({ success: false, message: 'Failed to update post' });
        }
    } catch (error) {
        console.error('Error updating post:', error);
        res.status(500).json({ success: false, message: 'Failed to update post' });
    }
});

// Delete post
app.delete('/api/posts/:id', (req, res) => {
    try {
        const postId = req.params.id;
        const posts = readAllPosts();
        const filteredPosts = posts.filter(p => p.id !== postId);

        if (posts.length === filteredPosts.length) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        if (writeAllPosts(filteredPosts)) {
            res.json({ success: true, message: 'Post deleted successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to delete post' });
        }
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ success: false, message: 'Failed to delete post' });
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

// Products file path
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

// Helper to read all products
function readAllProducts() {
    try {
        if (fs.existsSync(PRODUCTS_FILE)) {
            const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading products.json:', e);
    }
    return [];
}

// Helper to write all products
function writeAllProducts(products) {
    try {
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing products.json:', e);
        return false;
    }
}

// Helper to read all categories
function readAllCategories() {
    try {
        if (!fs.existsSync(CATEGORIES_FILE)) {
            return [];
        }
        const data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading categories.json:', e);
        return [];
    }
}

// Helper to write all categories
function writeAllCategories(categories) {
    try {
        fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing categories.json:', e);
        return false;
    }
}

// Get all products (public endpoint)
app.get('/api/products', (req, res) => {
    try {
        const products = readAllProducts();
        res.json({ success: true, products });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
});

// Add new product (public for demo)
app.post('/api/products', (req, res) => {
    const product = req.body;

    if (!product || !product.title) {
        return res.status(400).json({ success: false, message: 'Product data invalid' });
    }

    try {
        const products = readAllProducts();

        // Generate ID if not provided
        if (!product.id) {
            product.id = Date.now().toString();
        }

        products.push(product);

        if (writeAllProducts(products)) {
            res.json({ success: true, product });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save product' });
        }
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ success: false, message: 'Failed to add product' });
    }
});

// Update product (public for demo)
app.put('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const updatedProduct = req.body;

    try {
        const products = readAllProducts();
        const index = products.findIndex(p => p.id === id);

        if (index === -1) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        products[index] = { ...products[index], ...updatedProduct, id };

        if (writeAllProducts(products)) {
            res.json({ success: true, product: products[index] });
        } else {
            res.status(500).json({ success: false, message: 'Failed to update product' });
        }
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ success: false, message: 'Failed to update product' });
    }
});

// Delete product (public for demo)
app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;

    try {
        const products = readAllProducts();
        const filtered = products.filter(p => p.id !== id);

        if (filtered.length === products.length) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        if (writeAllProducts(filtered)) {
            res.json({ success: true, message: 'Product deleted successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to delete product' });
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
});

// Bulk update products (public for demo) - for saving all products at once
app.put('/api/products', (req, res) => {
    const products = req.body;

    if (!Array.isArray(products)) {
        return res.status(400).json({ success: false, message: 'Products must be an array' });
    }

    try {
        if (writeAllProducts(products)) {
            res.json({ success: true, products });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save products' });
        }
    } catch (error) {
        console.error('Error saving products:', error);
        res.status(500).json({ success: false, message: 'Failed to save products' });
    }
});

// Get all product categories (public endpoint)
app.get('/api/categories', (req, res) => {
    try {
        const categories = readAllCategories();
        const categoryNames = categories.map(cat => cat.name);
        res.json({ success: true, categories: categoryNames });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch categories' });
    }
});

// Add new category (admin only)
app.post('/api/categories', authenticateAdmin, (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        const categories = readAllCategories();

        // Check if category already exists
        if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
            return res.status(400).json({ success: false, message: 'Category already exists' });
        }

        const newCategory = {
            name: name.trim().toUpperCase(),
            description: description || `Category for ${name} products and services`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        categories.push(newCategory);

        if (writeAllCategories(categories)) {
            res.json({ success: true, message: 'Category added successfully', category: newCategory });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save category' });
        }
    } catch (error) {
        console.error('Error adding category:', error);
        res.status(500).json({ success: false, message: 'Failed to add category' });
    }
});

// Update category (admin only)
app.put('/api/categories/:name', authenticateAdmin, (req, res) => {
    try {
        const categoryName = decodeURIComponent(req.params.name);
        const { name: newName, description } = req.body;

        const categories = readAllCategories();
        const categoryIndex = categories.findIndex(cat => cat.name.toLowerCase() === categoryName.toLowerCase());

        if (categoryIndex === -1) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        if (newName && newName.trim()) {
            // Check if new name conflicts with existing category
            if (categories.some(cat => cat.name.toLowerCase() === newName.toLowerCase() && cat !== categories[categoryIndex])) {
                return res.status(400).json({ success: false, message: 'Category name already exists' });
            }
            categories[categoryIndex].name = newName.trim().toUpperCase();
        }

        if (description !== undefined) {
            categories[categoryIndex].description = description;
        }

        categories[categoryIndex].updatedAt = new Date().toISOString();

        if (writeAllCategories(categories)) {
            res.json({ success: true, message: 'Category updated successfully', category: categories[categoryIndex] });
        } else {
            res.status(500).json({ success: false, message: 'Failed to update category' });
        }
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ success: false, message: 'Failed to update category' });
    }
});

// Delete category (admin only)
app.delete('/api/categories/:name', authenticateAdmin, (req, res) => {
    try {
        const categoryName = decodeURIComponent(req.params.name);

        const categories = readAllCategories();
        const categoryIndex = categories.findIndex(cat => cat.name.toLowerCase() === categoryName.toLowerCase());

        if (categoryIndex === -1) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        const deletedCategory = categories.splice(categoryIndex, 1)[0];

        if (writeAllCategories(categories)) {
            res.json({ success: true, message: 'Category deleted successfully', category: deletedCategory });
        } else {
            res.status(500).json({ success: false, message: 'Failed to delete category' });
        }
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ success: false, message: 'Failed to delete category' });
    }
});

// ========== MEDIA MANAGEMENT ENDPOINTS ==========

// Get all media files (admin only)
app.get('/api/media', authenticateAdmin, (req, res) => {
    try {
        const media = readAllMedia();
        const folders = readAllFolders();
        res.json({ success: true, media, folders });
    } catch (error) {
        console.error('Error fetching media:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch media' });
    }
});

// Upload media file (admin only)
app.post('/api/media', authenticateAdmin, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const media = readAllMedia();
        const fileType = getFileType(req.file.originalname);

        const mediaFile = {
            id: 'media-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            name: req.file.originalname,
            filename: req.file.filename,
            type: fileType,
            size: req.file.size,
            url: '/uploads/' + req.file.filename,
            folder: req.body.folder || null,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user ? req.user.username : 'admin'
        };

        media.push(mediaFile);

        if (writeAllMedia(media)) {
            res.json({ success: true, mediaFile });
        } else {
            // Clean up uploaded file if saving metadata failed
            fs.unlinkSync(req.file.path);
            res.status(500).json({ success: false, message: 'Failed to save media metadata' });
        }
    } catch (error) {
        console.error('Error uploading media:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: 'Failed to upload media' });
    }
});

// Delete media file (admin only)
app.delete('/api/media/:id', authenticateAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const media = readAllMedia();
        const index = media.findIndex(m => m.id === id);

        if (index === -1) {
            return res.status(404).json({ success: false, message: 'Media file not found' });
        }

        const mediaFile = media[index];

        // Delete file from filesystem
        const filePath = path.join(UPLOADS_DIR, mediaFile.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove from metadata
        media.splice(index, 1);

        if (writeAllMedia(media)) {
            res.json({ success: true, message: 'Media file deleted successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to delete media metadata' });
        }
    } catch (error) {
        console.error('Error deleting media:', error);
        res.status(500).json({ success: false, message: 'Failed to delete media' });
    }
});

// Create folder (admin only)
app.post('/api/folders', authenticateAdmin, (req, res) => {
    try {
        const { name, parent } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Folder name is required' });
        }

        const folders = readAllFolders();

        // Check for duplicate names in the same parent
        if (folders.some(f => f.name === name && f.parent === parent)) {
            return res.status(409).json({ success: false, message: 'A folder with this name already exists' });
        }

        const folder = {
            id: 'folder-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            name: name,
            parent: parent || null,
            createdAt: new Date().toISOString(),
            createdBy: req.user ? req.user.username : 'admin'
        };

        folders.push(folder);

        if (writeAllFolders(folders)) {
            res.json({ success: true, folder });
        } else {
            res.status(500).json({ success: false, message: 'Failed to create folder' });
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({ success: false, message: 'Failed to create folder' });
    }
});

// Delete folder (admin only)
app.delete('/api/folders/:id', authenticateAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const folders = readAllFolders();
        const media = readAllMedia();

        const folderIndex = folders.findIndex(f => f.id === id);
        if (folderIndex === -1) {
            return res.status(404).json({ success: false, message: 'Folder not found' });
        }

        const folder = folders[folderIndex];

        // Check if folder has contents
        const filesInFolder = media.filter(m => m.folder === id).length;
        const subfolders = folders.filter(f => f.parent === id).length;

        if (filesInFolder > 0 || subfolders > 0) {
            return res.status(409).json({
                success: false,
                message: `Cannot delete folder: contains ${filesInFolder} files and ${subfolders} subfolders`
            });
        }

        // Remove folder
        folders.splice(folderIndex, 1);

        if (writeAllFolders(folders)) {
            res.json({ success: true, message: 'Folder deleted successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to delete folder' });
        }
    } catch (error) {
        console.error('Error deleting folder:', error);
        res.status(500).json({ success: false, message: 'Failed to delete folder' });
    }
});

// Move file to folder (admin only)
app.put('/api/media/:id/move', authenticateAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { folderId } = req.body;

        const media = readAllMedia();
        const index = media.findIndex(m => m.id === id);

        if (index === -1) {
            return res.status(404).json({ success: false, message: 'Media file not found' });
        }

        media[index].folder = folderId;

        if (writeAllMedia(media)) {
            res.json({ success: true, message: 'File moved successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to move file' });
        }
    } catch (error) {
        console.error('Error moving file:', error);
        res.status(500).json({ success: false, message: 'Failed to move file' });
    }
});

// Endpoint to send ticket reply notification email
app.post('/api/send-ticket-reply-notification', async (req, res) => {
    try {
        const { customerEmail, ticketData, replyData } = req.body;

        // Validation
        if (!customerEmail || !ticketData || !replyData) {
            return res.status(400).json({
                success: false,
                message: 'Customer email, ticket data, and reply data are required'
            });
        }

        // Check if email is configured
        if (!transporter || !emailConfig) {
            return res.status(503).json({
                success: false,
                message: 'Email service not configured.'
            });
        }

        const mailOptions = {
            from: { name: 'BuyPvaAccount Support', address: emailConfig.email },
            to: customerEmail,
            subject: `New Reply to Your Support Ticket - #${ticketData.trackingId}`,
            html: `<!doctype html><html><body>
                <h2>New Reply to Your Support Ticket</h2>
                <p>Hello ${ticketData.name || customerEmail},</p>
                <p>Our support team has replied to your ticket. You can view the reply and continue the conversation by clicking the link below.</p>

                <h3>Ticket Details</h3>
                <table style="width:100%; border-collapse:collapse; margin: 20px 0;">
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Tracking ID:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.trackingId}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Subject:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.subject}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee; background: #f9f9f9;"><strong>Status:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ticketData.status || 'Open'}</td>
                    </tr>
                </table>

                <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1976d2;">Latest Reply from Support Team</h3>
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 6px; border-left: 4px solid #1976d2;">
                        <p style="margin: 0 0 10px 0;"><strong>From:</strong> ${replyData.name || 'Support Team'}</p>
                        <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${new Date(replyData.date).toLocaleString()}</p>
                        <div style="margin-top: 10px;">${replyData.message.replace(/\n/g, '<br>')}</div>
                    </div>
                </div>

                <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                    <h3 style="margin-top: 0; color: #856404;">View Full Conversation</h3>
                    <p>Click the link below to view your complete ticket conversation and reply if needed:</p>
                    <p style="margin: 15px 0;">
                        <a href="${ticketData.ticketLink}" style="background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                            💬 View Ticket & Reply
                        </a>
                    </p>
                </div>

                <p style="margin-top: 30px;">
                    <strong>Response Time:</strong> Our support team typically responds within 2-4 hours during business hours.
                </p>

                <p>If you have any additional information or questions, please use the link above to continue the conversation.</p>

                <p>Best regards,<br/>
                BuyPvaAccount Support Team<br/>
                <a href="https://buypvaaccount.com/support">Visit our support page</a></p>
            </body></html>`,
            text: `New Reply to Your Support Ticket - #${ticketData.trackingId}

Hello ${ticketData.name || customerEmail},

Our support team has replied to your ticket.

Ticket Details:
- Tracking ID: ${ticketData.trackingId}
- Subject: ${ticketData.subject}
- Status: ${ticketData.status || 'Open'}

Latest Reply from Support Team:
From: ${replyData.name || 'Support Team'}
Date: ${new Date(replyData.date).toLocaleString()}
Message: ${replyData.message}

View your ticket: ${ticketData.ticketLink}

Best regards,
BuyPvaAccount Support Team`
        };

        await transporter.sendMail(mailOptions);

        console.log(`✅ Reply notification email sent to ${customerEmail} for ticket ${ticketData.trackingId}`);
        return res.json({
            success: true,
            message: 'Reply notification email sent successfully'
        });

    } catch (error) {
        console.error('Error sending reply notification email:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send reply notification email',
            error: error.message
        });
    }
});

// Dashboard API Routes
// Get file tree structure
app.get('/api/dashboard/files/tree', authenticateAdmin, (req, res) => {
    try {
        const rootPath = path.join(__dirname, '..');
        const tree = {};

        // Define priority folders
        const priorityFolders = ['backend', 'logs', 'node_modules', 'uploads'];

        function buildTree(dirPath, relativePath = '') {
            const items = fs.readdirSync(dirPath);

            items.forEach(item => {
                const fullPath = path.join(dirPath, item);
                const relPath = relativePath ? path.join(relativePath, item) : item;
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                    tree[item] = true;
                }
            });
        }

        buildTree(rootPath);
        res.json({ success: true, tree });
    } catch (error) {
        console.error('Error building file tree:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// List files in directory
app.get('/api/dashboard/files/list', authenticateAdmin, (req, res) => {
    try {
        const requestedPath = req.query.path || '/';
        let fullPath;

        if (requestedPath === '/') {
            fullPath = path.join(__dirname, '..');
        } else {
            // Remove leading slash and join with root
            const cleanPath = requestedPath.startsWith('/') ? requestedPath.slice(1) : requestedPath;
            fullPath = path.join(__dirname, '..', cleanPath);
        }

        // Security check - ensure path is within project directory
        const rootPath = path.join(__dirname, '..');
        if (!fullPath.startsWith(rootPath)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ success: false, message: 'Directory not found' });
        }

        const items = fs.readdirSync(fullPath);
        const files = [];

        items.forEach(item => {
            try {
                const itemPath = path.join(fullPath, item);
                const stat = fs.statSync(itemPath);

                files.push({
                    name: item,
                    type: stat.isDirectory() ? 'directory' : 'file',
                    size: stat.size,
                    modified: stat.mtime,
                    permissions: stat.mode
                });
            } catch (error) {
                console.error(`Error reading ${item}:`, error);
            }
        });

        // Sort: directories first, then files, alphabetically
        files.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        res.json({ success: true, files, path: requestedPath });
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Read file content
app.get('/api/dashboard/files/read', authenticateAdmin, (req, res) => {
    try {
        const requestedPath = req.query.path || '/';
        const filename = req.query.file;

        if (!filename) {
            return res.status(400).json({ success: false, message: 'Filename required' });
        }

        let dirPath;
        if (requestedPath === '/') {
            dirPath = path.join(__dirname, '..');
        } else {
            const cleanPath = requestedPath.startsWith('/') ? requestedPath.slice(1) : requestedPath;
            dirPath = path.join(__dirname, '..', cleanPath);
        }

        const filePath = path.join(dirPath, filename);

        // Security check
        const rootPath = path.join(__dirname, '..');
        if (!filePath.startsWith(rootPath)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
            return res.status(400).json({ success: false, message: 'Not a file' });
        }

        // Check if file is text-based
        const ext = path.extname(filename).toLowerCase();
        const textExtensions = ['.txt', '.js', '.json', '.html', '.css', '.md', '.xml', '.yml', '.yaml', '.ini', '.conf', '.log'];

        if (!textExtensions.includes(ext)) {
            return res.status(400).json({ success: false, message: 'File type not supported for editing' });
        }

        const content = fs.readFileSync(filePath, 'utf8');
        res.json({ success: true, content, size: stat.size });
    } catch (error) {
        console.error('Error reading file:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Save file content
app.post('/api/dashboard/files/save', authenticateAdmin, (req, res) => {
    try {
        const { path: requestedPath, filename, content } = req.body;

        if (!filename || content === undefined) {
            return res.status(400).json({ success: false, message: 'Filename and content required' });
        }

        let dirPath;
        if (requestedPath === '/') {
            dirPath = path.join(__dirname, '..');
        } else {
            const cleanPath = requestedPath.startsWith('/') ? requestedPath.slice(1) : requestedPath;
            dirPath = path.join(__dirname, '..', cleanPath);
        }

        const filePath = path.join(dirPath, filename);

        // Security check
        const rootPath = path.join(__dirname, '..');
        if (!filePath.startsWith(rootPath)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        fs.writeFileSync(filePath, content, 'utf8');
        res.json({ success: true, message: 'File saved successfully' });
    } catch (error) {
        console.error('Error saving file:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create new file or folder
app.post('/api/dashboard/files/create', authenticateAdmin, (req, res) => {
    try {
        const { path: requestedPath, name, type } = req.body;

        if (!name || !type) {
            return res.status(400).json({ success: false, message: 'Name and type required' });
        }

        let dirPath;
        if (requestedPath === '/') {
            dirPath = path.join(__dirname, '..');
        } else {
            const cleanPath = requestedPath.startsWith('/') ? requestedPath.slice(1) : requestedPath;
            dirPath = path.join(__dirname, '..', cleanPath);
        }

        const itemPath = path.join(dirPath, name);

        // Security check
        const rootPath = path.join(__dirname, '..');
        if (!itemPath.startsWith(rootPath)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (fs.existsSync(itemPath)) {
            return res.status(400).json({ success: false, message: 'Item already exists' });
        }

        if (type === 'directory') {
            fs.mkdirSync(itemPath, { recursive: true });
        } else if (type === 'file') {
            fs.writeFileSync(itemPath, '', 'utf8');
        } else {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        res.json({ success: true, message: `${type === 'directory' ? 'Folder' : 'File'} created successfully` });
    } catch (error) {
        console.error('Error creating item:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete file or folder
app.delete('/api/dashboard/files/delete', authenticateAdmin, (req, res) => {
    try {
        const { path: requestedPath, name, type } = req.body;

        if (!name || !type) {
            return res.status(400).json({ success: false, message: 'Name and type required' });
        }

        let dirPath;
        if (requestedPath === '/') {
            dirPath = path.join(__dirname, '..');
        } else {
            const cleanPath = requestedPath.startsWith('/') ? requestedPath.slice(1) : requestedPath;
            dirPath = path.join(__dirname, '..', cleanPath);
        }

        const itemPath = path.join(dirPath, name);

        // Security check
        const rootPath = path.join(__dirname, '..');
        if (!itemPath.startsWith(rootPath)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (!fs.existsSync(itemPath)) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        if (type === 'directory') {
            // Check if directory is empty
            const items = fs.readdirSync(itemPath);
            if (items.length > 0) {
                return res.status(400).json({ success: false, message: 'Directory is not empty' });
            }
            fs.rmdirSync(itemPath);
        } else if (type === 'file') {
            fs.unlinkSync(itemPath);
        } else {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }

        res.json({ success: true, message: `${type === 'directory' ? 'Folder' : 'File'} deleted successfully` });
    } catch (error) {
        console.error('Error deleting item:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Serve dashboard page
app.get('/dashboard', authenticateAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../dashboard.html'));
});

// Helper function to get file type
function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv'];
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (docExts.includes(ext)) return 'document';
    return 'other';
}

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

// Serve static files from the parent directory (where admin.html is located)
app.use(express.static(path.join(__dirname, '..')));

const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const archiver = require('archiver');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { verifyAdmin, createUser, getAllUsers, updateUser, deleteUser, verifyToken, storeUserToken, updateAdminCredentials } = require('./admin-auth');

// Media files path
const MEDIA_FILE = path.join(__dirname, '../media-files.json');
const FOLDERS_FILE = path.join(__dirname, '../media-folders.json');
const USERS_FILE = path.join(__dirname, '../registered_users.json');
const CATEGORIES_FILE = path.join(__dirname, '../categories.json');
const NOTIFICATIONS_FILE = path.join(__dirname, '../notifications.json');
const PAYMENT_SETTINGS_FILE = path.join(__dirname, '../payment_settings.json');
const PROMO_CODES_FILE = path.join(__dirname, '../promo_codes.json');
const ADMIN_ALERTS_FILE = path.join(__dirname, '../admin_alerts.json');
const ACCOUNT_REQUESTS_FILE = path.join(__dirname, '../account_requests.json');
const TICKETS_FILE = path.join(__dirname, '../tickets.json');
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Backup settings
const ADMIN_BACKUP_EMAIL = process.env.ADMIN_BACKUP_EMAIL || process.env.BACKUP_EMAIL || 'info.buypva@gmail.com';
const BACKUP_MAX_BYTES = Number(process.env.BACKUP_MAX_BYTES || (25 * 1024 * 1024)); // 25MB default
const BACKUP_EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.venv', 'logs']);
const BACKUP_EXCLUDE_FILES = new Set(['backend/.env', 'backend/.env.production', 'backend/.env.example', 'backend/email-config.json']);
// Gmail blocks archives that contain executable/script files (e.g. .js inside a .zip).
// Default to a "safe" backup that excludes risky extensions; set BACKUP_MODE=full to include everything (may be blocked by Gmail).
const BACKUP_MODE = String(process.env.BACKUP_MODE || 'safe').toLowerCase();
const BACKUP_EXCLUDE_EXTENSIONS_SAFE = new Set([
    '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
    '.sh', '.bat', '.cmd', '.ps1',
    '.exe', '.dll', '.so', '.dylib',
    '.jar', '.com', '.scr',
    '.php', '.py', '.rb', '.pl'
]);

function shouldExcludeRelPath(relPath) {
    const normalized = relPath.replace(/\\/g, '/');
    if (!normalized) return false;
    if (BACKUP_EXCLUDE_FILES.has(normalized)) return true;
    if (BACKUP_MODE !== 'full') {
        const ext = path.extname(normalized).toLowerCase();
        if (ext && BACKUP_EXCLUDE_EXTENSIONS_SAFE.has(ext)) return true;
    }
    const parts = normalized.split('/').filter(Boolean);
    return parts.some(p => BACKUP_EXCLUDE_DIRS.has(p));
}

async function ensureEmailReady() {
    let attempts = 0;
    while ((!transporter || !emailConfig) && attempts < 15) {
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
    }
    return Boolean(transporter && emailConfig);
}

async function createSiteBackupZip() {
    const siteRoot = path.join(__dirname, '..');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buypva-backup-'));
    const modeSuffix = BACKUP_MODE === 'full' ? 'full' : 'safe';
    const zipPath = path.join(tmpDir, `site-backup-${modeSuffix}-${stamp}.zip`);

    let totalBytes = 0;

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const done = new Promise((resolve, reject) => {
        output.on('close', () => resolve({ zipPath, bytes: archive.pointer(), tmpDir }));
        output.on('error', reject);
        archive.on('warning', (err) => {
            // non-fatal warnings
            console.warn('Backup zip warning:', err.message || err);
        });
        archive.on('error', reject);
    });

    archive.pipe(output);

    function walk(currentAbs, currentRel) {
        const entries = fs.readdirSync(currentAbs, { withFileTypes: true });
        for (const entry of entries) {
            const abs = path.join(currentAbs, entry.name);
            const rel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
            if (shouldExcludeRelPath(rel)) continue;

            if (entry.isDirectory()) {
                walk(abs, rel);
            } else if (entry.isFile()) {
                try {
                    const st = fs.statSync(abs);
                    totalBytes += st.size;
                    if (BACKUP_MAX_BYTES > 0 && totalBytes > BACKUP_MAX_BYTES) {
                        throw new Error(`Backup exceeded size limit (${BACKUP_MAX_BYTES} bytes)`);
                    }
                    archive.file(abs, { name: rel });
                } catch (e) {
                    throw e;
                }
            }
        }
    }

    walk(siteRoot, '');
    await archive.finalize();
    return await done;
}

async function createPasswordProtectedZipFromFiles({
    cwd,
    outputZipPath,
    password,
    relativeFiles
}) {
    return await new Promise((resolve, reject) => {
        const args = ['-q', '-@', '-P', String(password || ''), outputZipPath];
        const child = spawn('zip', args, { cwd, stdio: ['pipe', 'ignore', 'pipe'] });

        let stderr = '';
        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });

        child.on('error', (err) => {
            reject(new Error(`zip command failed to start: ${err.message}`));
        });

        child.on('close', (code) => {
            if (code === 0) return resolve(true);
            reject(new Error(`zip command failed (code ${code})${stderr ? `: ${stderr.trim()}` : ''}`));
        });

        // Feed file list to zip via stdin
        for (const file of relativeFiles || []) {
            child.stdin.write(`${file}\n`);
        }
        child.stdin.end();
    });
}

async function createSiteBackupProtectedZip(password) {
    const siteRoot = path.join(__dirname, '..');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buypva-backup-'));
    const modeSuffix = BACKUP_MODE === 'full' ? 'full' : 'safe';
    const zipPath = path.join(tmpDir, `site-backup-${modeSuffix}-${stamp}.zip`);

    let totalBytes = 0;
    const relativeFiles = [];

    function walk(currentAbs, currentRel) {
        const entries = fs.readdirSync(currentAbs, { withFileTypes: true });
        for (const entry of entries) {
            const abs = path.join(currentAbs, entry.name);
            const rel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
            if (shouldExcludeRelPath(rel)) continue;

            if (entry.isDirectory()) {
                walk(abs, rel);
            } else if (entry.isFile()) {
                const st = fs.statSync(abs);
                totalBytes += st.size;
                if (BACKUP_MAX_BYTES > 0 && totalBytes > BACKUP_MAX_BYTES) {
                    throw new Error(`Backup exceeded size limit (${BACKUP_MAX_BYTES} bytes)`);
                }
                relativeFiles.push(rel);
            }
        }
    }

    walk(siteRoot, '');

    if (!password || String(password).trim().length < 1) {
        throw new Error('Backup password is required');
    }

    await createPasswordProtectedZipFromFiles({
        cwd: siteRoot,
        outputZipPath: zipPath,
        password: String(password),
        relativeFiles
    });

    const stat = fs.statSync(zipPath);
    return { zipPath, tmpDir, bytes: stat.size };
}

function readJsonArrayFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function writeJsonArrayFile(filePath, items) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(Array.isArray(items) ? items : [], null, 2));
        return true;
    } catch (e) {
        return false;
    }
}

function readAdminAlerts() {
    try {
        if (!fs.existsSync(ADMIN_ALERTS_FILE)) return [];
        const data = fs.readFileSync(ADMIN_ALERTS_FILE, 'utf8');
        const parsed = JSON.parse(data);
        const arr = Array.isArray(parsed) ? parsed : [];

        // Auto-cleanup: remove dataless/invalid alerts to avoid showing blank items in UI.
        // This also helps when legacy code created placeholder notifications.
        const sanitized = arr
            .filter(a => a && typeof a === 'object')
            .filter(a => {
                const id = String(a.id || '').trim();
                if (!id) return false;

                const title = String(a.title || '').trim();
                const message = String(a.message || '').trim();
                const meta = a.meta && typeof a.meta === 'object' ? a.meta : null;
                const metaHasKeys = meta ? Object.keys(meta).length > 0 : false;

                // Keep if it has any meaningful content.
                return Boolean(title || message || metaHasKeys);
            })
            .map(a => ({
                ...a,
                // Normalize read flag
                read: a.read === true
            }));

        // Persist cleanup if needed
        if (sanitized.length !== arr.length) {
            try {
                writeAdminAlerts(sanitized);
            } catch {}
        }

        return sanitized;
    } catch (e) {
        console.error('Error reading admin_alerts.json:', e);
        return [];
    }
}

function writeAdminAlerts(alerts) {
    try {
        fs.writeFileSync(ADMIN_ALERTS_FILE, JSON.stringify(Array.isArray(alerts) ? alerts : [], null, 2));
        return true;
    } catch (e) {
        console.error('Error writing admin_alerts.json:', e);
        return false;
    }
}

function addAdminAlert({ type, title, message, meta }) {
    try {
        const alerts = readAdminAlerts();
        const alert = {
            id: 'ALERT-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
            type: String(type || 'info'),
            title: String(title || 'Notification'),
            message: String(message || ''),
            meta: meta && typeof meta === 'object' ? meta : null,
            createdAt: new Date().toISOString(),
            read: false
        };
        alerts.push(alert);
        const ok = writeAdminAlerts(alerts);
        return ok ? alert : null;
    } catch (e) {
        console.error('Error adding admin alert:', e);
        return null;
    }
}

function readAccountRequests() {
    try {
        if (!fs.existsSync(ACCOUNT_REQUESTS_FILE)) return [];
        const data = fs.readFileSync(ACCOUNT_REQUESTS_FILE, 'utf8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('Error reading account_requests.json:', e);
        return [];
    }
}

function writeAccountRequests(requests) {
    try {
        fs.writeFileSync(ACCOUNT_REQUESTS_FILE, JSON.stringify(Array.isArray(requests) ? requests : [], null, 2));
        return true;
    } catch (e) {
        console.error('Error writing account_requests.json:', e);
        return false;
    }
}

function readPaymentSettings() {
    try {
        if (fs.existsSync(PAYMENT_SETTINGS_FILE)) {
            const data = fs.readFileSync(PAYMENT_SETTINGS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            const methods = parsed && parsed.methods ? parsed.methods : {};
            return {
                methods: {
                    cod: methods.cod !== false,
                    crypto: methods.crypto !== false
                },
                updatedAt: parsed.updatedAt || new Date().toISOString()
            };
        }
    } catch (e) {
        console.error('Error reading payment_settings.json:', e);
    }
    return {
        methods: { cod: true, crypto: true },
        updatedAt: new Date().toISOString()
    };
}

function writePaymentSettings(settings) {
    try {
        const methods = settings && settings.methods ? settings.methods : {};
        const normalized = {
            methods: {
                cod: methods.cod !== false,
                crypto: methods.crypto !== false
            },
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(PAYMENT_SETTINGS_FILE, JSON.stringify(normalized, null, 2));
        return normalized;
    } catch (e) {
        console.error('Error writing payment_settings.json:', e);
        return null;
    }
}

function normalizePromoCodeEntry(entry) {
    const code = String(entry?.code || '').trim().toUpperCase();
    const discountPercentRaw = Number(entry?.discountPercent);
    const discountPercent = Number.isFinite(discountPercentRaw) ? Math.max(0, Math.min(100, discountPercentRaw)) : 0;
    const memberOnly = entry?.memberOnly === true;
    const active = entry?.active !== false;

    if (!code) return null;
    return {
        code,
        discountPercent,
        memberOnly,
        active,
        createdAt: entry?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function readPromoCodes() {
    try {
        if (fs.existsSync(PROMO_CODES_FILE)) {
            const data = fs.readFileSync(PROMO_CODES_FILE, 'utf8');
            const parsed = JSON.parse(data);
            const codes = Array.isArray(parsed?.codes) ? parsed.codes : (Array.isArray(parsed) ? parsed : []);
            return {
                codes: codes.map(normalizePromoCodeEntry).filter(Boolean),
                updatedAt: parsed?.updatedAt || new Date().toISOString()
            };
        }
    } catch (e) {
        console.error('Error reading promo_codes.json:', e);
    }
    return { codes: [], updatedAt: new Date().toISOString() };
}

function writePromoCodes(payload) {
    try {
        const incomingCodes = Array.isArray(payload?.codes) ? payload.codes : (Array.isArray(payload) ? payload : []);
        const normalized = incomingCodes.map(normalizePromoCodeEntry).filter(Boolean);

        // De-duplicate by code, keep latest
        const map = new Map();
        normalized.forEach(c => map.set(c.code, c));

        const out = {
            codes: Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code)),
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(PROMO_CODES_FILE, JSON.stringify(out, null, 2));
        return out;
    } catch (e) {
        console.error('Error writing promo_codes.json:', e);
        return null;
    }
}

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

const MEDIA_UPLOAD_MAX_BYTES = Number(process.env.MEDIA_UPLOAD_MAX_BYTES || (25 * 1024 * 1024)); // 25MB default

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MEDIA_UPLOAD_MAX_BYTES
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

function uploadSingleMediaFile(req, res, next) {
    const handler = upload.single('file');
    handler(req, res, (err) => {
        if (!err) return next();

        // Multer errors (size limits, etc)
        if (err && err.name === 'MulterError') {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    success: false,
                    message: `File too large. Max size is ${Math.round(MEDIA_UPLOAD_MAX_BYTES / (1024 * 1024))}MB.`
                });
            }
            return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
        }

        // Our custom filter error
        const msg = String(err?.message || 'Upload failed');
        if (msg.toLowerCase().includes('invalid file type')) {
            return res.status(415).json({ success: false, message: 'Invalid file type. PNG/JPG/WebP/GIF, MP4/WebM, PDF/DOC/TXT are allowed.' });
        }

        return res.status(400).json({ success: false, message: msg });
    });
}

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

// Handle malformed JSON bodies cleanly (avoid 500s from body-parser)
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'Invalid JSON body' });
    }
    return next(err);
});

// Trust proxy - needed for rate limiting with Nginx reverse proxy
app.set('trust proxy', 1);

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    // Dashboard pages can legitimately make many API calls (staff/me, files, products, etc.)
    // Keep a rate limit, but set it high enough to avoid locking out admins.
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Too many requests from this IP, please try again later.'
        });
    }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth attempts per windowMs
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Too many authentication attempts, please try again later.'
        });
    }
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
// Apply the general limiter only to API routes (avoid blocking static pages/assets)
app.use('/api', generalLimiter);

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
function parseCookieHeader(cookieHeader) {
    const out = {};
    const raw = String(cookieHeader || '');
    if (!raw) return out;
    raw.split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx === -1) return;
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (!key) return;
        try {
            out[key] = decodeURIComponent(val);
        } catch (e) {
            out[key] = val;
        }
    });
    return out;
}

function getAuthTokenFromRequest(req) {
    const headerToken = req.headers.authorization?.replace('Bearer ', '');
    if (headerToken) return headerToken;
    const cookies = parseCookieHeader(req.headers.cookie);
    return cookies.admin_auth_token || '';
}

const authenticateStaff = async (req, res, next) => {
    const token = getAuthTokenFromRequest(req);
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

const authenticateAdmin = async (req, res, next) => {
    return authenticateStaff(req, res, () => {
        const role = String(req.user?.role || '').toLowerCase();
        if (role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        return next();
    });
};

// Page guard variant: redirects instead of JSON
const authenticateAdminPage = async (req, res, next) => {
    const token = getAuthTokenFromRequest(req);
    if (!token) return res.redirect('/admin');
    try {
        const result = await verifyToken(token);
        if (!result.success) return res.redirect('/admin');
        req.user = result.user;
        const role = String(req.user?.role || '').toLowerCase();
        if (role !== 'admin') return res.status(403).send('Access Denied');
        return next();
    } catch (e) {
        return res.redirect('/admin');
    }
};

function hasStaffPermission(user, permission) {
    const role = String(user?.role || '').toLowerCase();
    if (role === 'admin') return true;
    const perms = Array.isArray(user?.permissions) ? user.permissions : [];
    return perms.includes(String(permission || '').trim());
}

function requireStaffPermission(permission) {
    return (req, res, next) => {
        if (hasStaffPermission(req.user, permission)) return next();
        return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    };
}

// Staff identity (admin/editor)
app.get('/api/staff/me', authenticateStaff, (req, res) => {
    const u = req.user || {};
    return res.json({
        success: true,
        user: {
            username: u.username,
            email: u.email,
            role: u.role,
            status: u.status,
            permissions: Array.isArray(u.permissions) ? u.permissions : []
        }
    });
});

// ========== ADMIN 2FA (TOTP) ==========

const ADMIN_2FA_FILE = path.join(__dirname, 'admin-2fa.json');

function readAdmin2FAStore() {
    try {
        if (!fs.existsSync(ADMIN_2FA_FILE)) return {};
        const raw = fs.readFileSync(ADMIN_2FA_FILE, 'utf8');
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        console.error('Error reading admin-2fa.json:', e);
        return {};
    }
}

function writeAdmin2FAStore(store) {
    try {
        const safe = store && typeof store === 'object' ? store : {};
        fs.writeFileSync(ADMIN_2FA_FILE, JSON.stringify(safe, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing admin-2fa.json:', e);
        return false;
    }
}

function getAdmin2FA(username) {
    const u = String(username || '').trim().toLowerCase();
    if (!u) return { enabled: false };
    const store = readAdmin2FAStore();
    const entry = store[u];
    if (!entry || typeof entry !== 'object') return { enabled: false };
    return {
        enabled: entry.enabled === true,
        secret: typeof entry.secret === 'string' ? entry.secret : ''
    };
}

function setAdmin2FA(username, secret) {
    const u = String(username || '').trim().toLowerCase();
    const s = String(secret || '').trim().toUpperCase();
    if (!u || !s) return false;
    const store = readAdmin2FAStore();
    store[u] = { enabled: true, secret: s, updatedAt: new Date().toISOString() };
    return writeAdmin2FAStore(store);
}

function disableAdmin2FA(username) {
    const u = String(username || '').trim().toLowerCase();
    if (!u) return false;
    const store = readAdmin2FAStore();
    store[u] = { enabled: false, secret: '', updatedAt: new Date().toISOString() };
    return writeAdmin2FAStore(store);
}

function base32ToBuffer(secretBase32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = String(secretBase32 || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const ch of clean) {
        const idx = alphabet.indexOf(ch);
        if (idx === -1) continue;
        bits += idx.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}

function generateTOTPServer(secretBase32, timestampMs = Date.now(), timeStepSeconds = 30) {
    const key = base32ToBuffer(secretBase32);
    if (!key || key.length === 0) return '';

    const counter = Math.floor(timestampMs / 1000 / timeStepSeconds);
    const buf = Buffer.alloc(8);
    // Write big-endian counter
    buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buf.writeUInt32BE(counter >>> 0, 4);

    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binCode = hmac.readUInt32BE(offset) & 0x7fffffff;
    const code = (binCode % 1000000).toString().padStart(6, '0');
    return code;
}

function verifyTOTPServer(secretBase32, code, windowSteps = 1) {
    const c = String(code || '').trim();
    if (!/^\d{6}$/.test(c)) return false;
    const now = Date.now();
    for (let w = -windowSteps; w <= windowSteps; w++) {
        const ts = now + (w * 30 * 1000);
        if (generateTOTPServer(secretBase32, ts) === c) return true;
    }
    return false;
}

// Admin page (includes its own login UI; must be reachable without a token)
// Keep a clean canonical URL and let the page handle login.
app.get('/admin.html', (req, res) => {
    return res.redirect(301, '/admin');
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// Legacy alias
app.get('/dashboard', (req, res) => {
    return res.redirect(302, '/admin');
});

// Protected route for media-library.html (redirects to /admin when not logged in)
// Allow editors with 'media' permission to access media-library
app.get('/media-library.html', authenticateStaff, requireStaffPermission('media'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'media-library.html'));
});

app.get('/media-library', authenticateStaff, requireStaffPermission('media'), (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'media-library.html'));
});

// Protected route for categories.html (redirects to /admin when not logged in)
app.get('/categories.html', authenticateAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'categories.html'));
});

// Clean URL for categories (protected)
app.get('/categories', authenticateAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'categories.html'));
});

// Protected route for ordermanagement.html (admin-only)
app.get('/ordermanagement.html', authenticateAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'ordermanagement.html'));
});

// Clean URL for order management (protected)
app.get('/ordermanagement', authenticateAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'ordermanagement.html'));
});

// Redirect any direct *.html page requests to clean URLs (keeps URLs pretty)
// (Skip /api/* so API endpoints with .html in path are not affected.)
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    if (!req.path.endsWith('.html')) return next();

    const withoutExtension = req.path.slice(0, -'.html'.length);
    if (!withoutExtension) return next();
    return res.redirect(301, withoutExtension);
});

// Serve static files from the parent directory (where admin.html is located)
// IMPORTANT: This must be configured to serve from root
app.use(express.static(path.join(__dirname, '..')));

// Redirect root to marketplace
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'marketplace.html'));
});

// Extensionless public pages: /contact -> contact.html (if it exists)
// Protected pages are handled explicitly above.
app.get('*', (req, res, next) => {
    if (req.path === '/' || req.path.startsWith('/api/')) return next();

    // If URL already has an extension (e.g., .js, .css, .png), ignore.
    const lastSegment = String(req.path || '').split('/').filter(Boolean).pop() || '';
    if (!lastSegment || lastSegment.includes('.')) return next();

    const protectedBasenames = new Set(['admin', 'dashboard', 'media-library', 'categories', 'ordermanagement']);
    if (protectedBasenames.has(lastSegment)) return next();

    const relativePath = req.path.startsWith('/') ? req.path.slice(1) : req.path;
    const candidateHtmlFile = path.join(__dirname, '..', `${relativePath}.html`);

    try {
        if (!fs.existsSync(candidateHtmlFile)) return next();
        return res.sendFile(candidateHtmlFile);
    } catch (e) {
        return next();
    }
});

// Admin login endpoint
app.post('/api/admin-login', async (req, res) => {
    const { username, password, twofaCode } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    try {
        const result = await verifyAdmin(username, password);
        if (result.success) {
            const loginUsername = String(result.user?.username || username || '').trim();
            const twofa = getAdmin2FA(loginUsername);
            if (twofa.enabled) {
                const code = String(twofaCode || '').trim();
                if (!code) {
                    return res.status(401).json({ success: false, message: '2FA code required', twoFactorRequired: true });
                }
                if (!verifyTOTPServer(twofa.secret, code, 1)) {
                    return res.status(401).json({ success: false, message: 'Invalid 2FA code', twoFactorRequired: true });
                }
            }

            // Generate a secure random token (simple string instead of bcrypt hash for comparison)
            const token = crypto.randomBytes(32).toString('hex');

            // Store token for the user
            await storeUserToken(loginUsername, token);

            // Also set HttpOnly cookie so server-side page protection can work (Nginx can proxy HTML routes)
            res.cookie('admin_auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Lax',
                path: '/',
                maxAge: 1000 * 60 * 60 * 24 * 7
            });

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

// Admin 2FA management
app.get('/api/admin/2fa/status', authenticateAdmin, (req, res) => {
    const username = String(req.user?.username || '').trim();
    if (!username) return res.status(401).json({ success: false, message: 'Invalid admin session' });
    const twofa = getAdmin2FA(username);
    return res.json({ success: true, enabled: twofa.enabled });
});

app.post('/api/admin/2fa/enable', authenticateAdmin, (req, res) => {
    const username = String(req.user?.username || '').trim();
    if (!username) return res.status(401).json({ success: false, message: 'Invalid admin session' });

    const secret = String(req.body?.secret || '').trim().toUpperCase();
    const code = String(req.body?.code || '').trim();

    if (!secret) return res.status(400).json({ success: false, message: '2FA secret is required' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'Valid 6-digit 2FA code required' });

    if (!verifyTOTPServer(secret, code, 1)) {
        return res.status(400).json({ success: false, message: 'Invalid 2FA code for the provided secret' });
    }

    const ok = setAdmin2FA(username, secret);
    if (!ok) return res.status(500).json({ success: false, message: 'Failed to enable 2FA' });
    return res.json({ success: true, enabled: true });
});

app.post('/api/admin/2fa/disable', authenticateAdmin, (req, res) => {
    const username = String(req.user?.username || '').trim();
    if (!username) return res.status(401).json({ success: false, message: 'Invalid admin session' });
    const ok = disableAdmin2FA(username);
    if (!ok) return res.status(500).json({ success: false, message: 'Failed to disable 2FA' });
    return res.json({ success: true, enabled: false });
});

// Payment settings (public read)
app.get('/api/payment-settings', (req, res) => {
    try {
        const settings = readPaymentSettings();
        return res.json({ success: true, settings });
    } catch (err) {
        console.error('Error fetching payment settings:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch payment settings' });
    }
});

// Payment settings (admin manage)
app.get('/api/admin/payment-settings', authenticateAdmin, (req, res) => {
    try {
        const settings = readPaymentSettings();
        return res.json({ success: true, settings });
    } catch (err) {
        console.error('Error fetching admin payment settings:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch payment settings' });
    }
});

app.put('/api/admin/payment-settings', authenticateAdmin, (req, res) => {
    try {
        const incoming = req.body || {};
        const methods = incoming.methods || {};

        // Ensure at least one payment method is enabled
        const cod = methods.cod !== false;
        const crypto = methods.crypto !== false;
        const safeMethods = (cod || crypto) ? { cod, crypto } : { cod: true, crypto: false };

        const saved = writePaymentSettings({ methods: safeMethods });
        if (!saved) return res.status(500).json({ success: false, message: 'Failed to persist payment settings' });

        logAdminAction('update_payment_settings', { methods: saved.methods }, req.adminUser || 'admin');
        return res.json({ success: true, settings: saved });
    } catch (err) {
        console.error('Error saving payment settings:', err);
        return res.status(500).json({ success: false, message: 'Failed to save payment settings' });
    }
});

// ========== ADMIN ALERTS (BELL BADGE) ==========

app.get('/api/admin/alerts', authenticateAdmin, (req, res) => {
    try {
        const alerts = readAdminAlerts().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const unreadCount = alerts.filter(a => a && a.read !== true).length;
        return res.json({ success: true, alerts, unreadCount });
    } catch (err) {
        console.error('Error fetching admin alerts:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
    }
});

app.post('/api/admin/alerts/:id/mark-read', authenticateAdmin, (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Alert id required' });

        const alerts = readAdminAlerts();
        const idx = alerts.findIndex(a => a && String(a.id || '').trim() === id);
        if (idx === -1) {
            const unreadCount = alerts.filter(a => a && a.read !== true).length;
            return res.json({ success: true, unreadCount });
        }

        if (alerts[idx].read !== true) {
            alerts[idx] = { ...alerts[idx], read: true, readAt: new Date().toISOString() };
            const ok = writeAdminAlerts(alerts);
            if (!ok) return res.status(500).json({ success: false, message: 'Failed to update alert' });
        }

        const unreadCount = alerts.filter(a => a && a.read !== true).length;
        return res.json({ success: true, unreadCount });
    } catch (err) {
        console.error('Error marking alert read:', err);
        return res.status(500).json({ success: false, message: 'Failed to mark read' });
    }
});

app.get('/api/admin/alerts/unread-count', authenticateAdmin, (req, res) => {
    try {
        const alerts = readAdminAlerts();
        const unreadCount = alerts.filter(a => a && a.read !== true).length;
        return res.json({ success: true, unreadCount });
    } catch (err) {
        console.error('Error fetching unread count:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch unread count' });
    }
});

app.post('/api/admin/alerts/mark-all-read', authenticateAdmin, (req, res) => {
    try {
        const alerts = readAdminAlerts();
        const updated = alerts.map(a => (a && a.read !== true) ? { ...a, read: true, readAt: new Date().toISOString() } : a);
        const ok = writeAdminAlerts(updated);
        if (!ok) return res.status(500).json({ success: false, message: 'Failed to update alerts' });
        return res.json({ success: true, unreadCount: 0 });
    } catch (err) {
        console.error('Error marking alerts read:', err);
        return res.status(500).json({ success: false, message: 'Failed to mark read' });
    }
});

// ========== SITE BACKUP (ADMIN) ==========

app.get('/api/admin/backup/recipient', authenticateAdmin, (req, res) => {
    const to = String(ADMIN_BACKUP_EMAIL || '').trim();
    return res.json({ success: true, to, mode: BACKUP_MODE === 'full' ? 'full' : 'safe' });
});

app.post('/api/admin/backup/email', authenticateAdmin, async (req, res) => {
    let tmpDir = null;
    let zipPath = null;
    try {
        const ok = await ensureEmailReady();
        if (!ok) {
            return res.status(500).json({ success: false, message: 'Email is not configured on the server' });
        }

        const backup = await createSiteBackupZip();
        tmpDir = backup.tmpDir;
        zipPath = backup.zipPath;

        const stat = fs.statSync(zipPath);
        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

        const to = String(ADMIN_BACKUP_EMAIL || '').trim();
        if (!to) {
            return res.status(500).json({ success: false, message: 'Backup recipient email not configured' });
        }

        const modeLabel = BACKUP_MODE === 'full' ? 'FULL' : 'SAFE';
        const note = BACKUP_MODE === 'full'
            ? 'Full backup requested. Note: Gmail may block ZIP archives containing script/executable files.'
            : 'Safe backup excludes script/executable files to avoid Gmail blocking the attachment.';

        const mailOptions = {
            from: `"BuyPvaAccount" <${emailConfig.email}>`,
            to,
            subject: `🗄️ Site Backup (${modeLabel}) - ${new Date().toLocaleString()}`,
            text: `Attached is the latest site backup (${modeLabel}). Size: ${sizeMb} MB.\n\n${note}`,
            html: `<p>Attached is the latest site backup (<strong>${modeLabel}</strong>).</p><p><strong>Size:</strong> ${sizeMb} MB</p><p>${note}</p>`,
            attachments: [
                {
                    filename: path.basename(zipPath),
                    path: zipPath,
                    contentType: 'application/zip'
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        return res.json({ success: true, message: `Backup emailed to ${to} (${modeLabel})`, bytes: stat.size, filename: path.basename(zipPath), to, mode: modeLabel });
    } catch (err) {
        const msg = err?.message || 'Failed to create/email backup';
        console.error('Backup email error:', err);
        return res.status(500).json({ success: false, message: msg });
    } finally {
        try {
            if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        } catch {}
        try {
            if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
    }
});

// Download a password-protected ZIP backup (admin)
app.post('/api/admin/backup/download', authenticateAdmin, async (req, res) => {
    let tmpDir = null;
    let zipPath = null;
    try {
        const password = String(req.body?.password || '').trim();
        const twofaCode = String(req.body?.twofaCode || '').trim();
        if (!password) {
            return res.status(400).json({ success: false, message: 'Password is required' });
        }

        // Verify the provided password matches the current admin credentials
        const username = String(req.user?.username || '').trim();
        if (!username) {
            return res.status(401).json({ success: false, message: 'Invalid admin session' });
        }
        const valid = await verifyAdmin(username, password);
        if (!valid?.success) {
            return res.status(401).json({ success: false, message: 'Incorrect admin password' });
        }

        // If 2FA is enabled for this admin, require and verify a 6-digit code.
        const twofa = getAdmin2FA(username);
        if (twofa.enabled) {
            if (!twofaCode) {
                return res.status(401).json({ success: false, message: '2FA code required', twoFactorRequired: true });
            }
            if (!verifyTOTPServer(twofa.secret, twofaCode, 1)) {
                return res.status(401).json({ success: false, message: 'Invalid 2FA code', twoFactorRequired: true });
            }
        }

        const backup = await createSiteBackupProtectedZip(password);
        tmpDir = backup.tmpDir;
        zipPath = backup.zipPath;

        // Stream as a download
        res.setHeader('Content-Type', 'application/zip');
        return res.download(zipPath, path.basename(zipPath), (err) => {
            if (err) {
                console.error('Backup download error:', err);
            }
            try {
                if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            } catch {}
            try {
                if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
        });
    } catch (err) {
        const msg = err?.message || 'Failed to create backup';
        console.error('Backup download error:', err);
        try {
            if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        } catch {}
        try {
            if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
        return res.status(500).json({ success: false, message: msg });
    }
});

// ========== ACCOUNT PURCHASE REQUESTS ==========

// Public: submit an account purchase request (creates an admin alert)
app.post('/api/account-requests', (req, res) => {
    try {
        const { accountType, quantity, email } = req.body || {};
        const type = String(accountType || '').trim();
        const qty = String(quantity || '').trim();
        const mail = String(email || '').trim().toLowerCase();

        if (!type || !qty || !mail) {
            return res.status(400).json({ success: false, message: 'accountType, quantity, and email are required' });
        }

        const requests = readAccountRequests();
        const newReq = {
            id: 'REQ-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
            accountType: type,
            quantity: qty,
            email: mail,
            status: 'new',
            createdAt: new Date().toISOString()
        };
        requests.unshift(newReq);

        if (!writeAccountRequests(requests)) {
            return res.status(500).json({ success: false, message: 'Failed to save request' });
        }

        addAdminAlert({
            type: 'account_request',
            title: 'New Account Purchase Request',
            message: `${type} • Qty: ${qty} • ${mail}`,
            meta: { requestId: newReq.id, accountType: type, quantity: qty, email: mail }
        });

        return res.json({ success: true, request: newReq });
    } catch (err) {
        console.error('Error saving account request:', err);
        return res.status(500).json({ success: false, message: 'Failed to save request' });
    }
});

// ========== PROMO CODES ==========

// Validate a promo code (public). If promo is memberOnly, it requires a valid client Bearer token.
app.get('/api/promo-codes/validate', (req, res) => {
    try {
        const code = String(req.query.code || '').trim().toUpperCase();
        if (!code) {
            return res.status(400).json({ success: false, message: 'Missing code' });
        }

        const { codes } = readPromoCodes();
        const found = codes.find(c => c && c.active !== false && String(c.code).toUpperCase() === code);
        if (!found) {
            return res.json({ success: true, valid: false, message: 'Invalid promo code' });
        }

        if (found.memberOnly) {
            const token = getBearerToken(req);
            if (!token) {
                return res.json({ success: true, valid: false, message: 'Promo code is for members only' });
            }

            const users = readAllUsers();
            const user = users.find(u => u && u.userToken === token);
            if (!user) {
                return res.json({ success: true, valid: false, message: 'Promo code is for members only' });
            }

            const role = String(user.role || '').toLowerCase();
            const isMember = role === 'member' || role === 'admin';
            if (!isMember) {
                return res.json({ success: true, valid: false, message: 'Promo code is for members only' });
            }
        }

        const discountPercent = Number(found.discountPercent) || 0;
        const discountPct = Math.max(0, Math.min(1, discountPercent / 100));
        return res.json({
            success: true,
            valid: discountPct > 0,
            code,
            discountPercent,
            discountPct,
            memberOnly: found.memberOnly === true
        });
    } catch (err) {
        console.error('Error validating promo code:', err);
        return res.status(500).json({ success: false, message: 'Failed to validate promo code' });
    }
});

// Admin: list promo codes
app.get('/api/admin/promo-codes', authenticateAdmin, (req, res) => {
    try {
        const data = readPromoCodes();
        return res.json({ success: true, ...data });
    } catch (err) {
        console.error('Error fetching promo codes:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch promo codes' });
    }
});

// Admin: upsert a promo code
app.post('/api/admin/promo-codes', authenticateAdmin, (req, res) => {
    try {
        const incoming = normalizePromoCodeEntry(req.body || {});
        if (!incoming) {
            return res.status(400).json({ success: false, message: 'Promo code is required' });
        }

        const current = readPromoCodes();
        const existing = current.codes.find(c => c.code === incoming.code);
        const merged = existing
            ? { ...existing, ...incoming, code: existing.code, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }
            : incoming;

        const next = current.codes.filter(c => c.code !== incoming.code).concat([merged]);
        const saved = writePromoCodes({ codes: next });
        if (!saved) return res.status(500).json({ success: false, message: 'Failed to persist promo codes' });

        logAdminAction('upsert_promo_code', { code: merged.code, discountPercent: merged.discountPercent, memberOnly: merged.memberOnly, active: merged.active }, req.adminUser || 'admin');
        return res.json({ success: true, promo: merged, codes: saved.codes, updatedAt: saved.updatedAt });
    } catch (err) {
        console.error('Error saving promo code:', err);
        return res.status(500).json({ success: false, message: 'Failed to save promo code' });
    }
});

// Admin: replace all promo codes (bulk)
app.put('/api/admin/promo-codes', authenticateAdmin, (req, res) => {
    try {
        const saved = writePromoCodes(req.body);
        if (!saved) return res.status(500).json({ success: false, message: 'Failed to persist promo codes' });
        logAdminAction('bulk_update_promo_codes', { count: saved.codes.length }, req.adminUser || 'admin');
        return res.json({ success: true, ...saved });
    } catch (err) {
        console.error('Error bulk saving promo codes:', err);
        return res.status(500).json({ success: false, message: 'Failed to save promo codes' });
    }
});

// Admin: delete a promo code
app.delete('/api/admin/promo-codes/:code', authenticateAdmin, (req, res) => {
    try {
        const code = String(decodeURIComponent(req.params.code || '')).trim().toUpperCase();
        if (!code) return res.status(400).json({ success: false, message: 'Promo code is required' });

        const current = readPromoCodes();
        const removed = current.codes.find(c => c.code === code) || null;
        const next = current.codes.filter(c => c.code !== code);
        if (next.length === current.codes.length) {
            return res.status(404).json({ success: false, message: 'Promo code not found' });
        }

        const saved = writePromoCodes({ codes: next });
        if (!saved) return res.status(500).json({ success: false, message: 'Failed to persist promo codes' });

        logAdminAction('delete_promo_code', { code }, req.adminUser || 'admin');
        return res.json({ success: true, promo: removed, codes: saved.codes, updatedAt: saved.updatedAt });
    } catch (err) {
        console.error('Error deleting promo code:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete promo code' });
    }
});

function getBearerToken(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string') return null;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

function authenticateClient(req, res, next) {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return res.status(401).json({ success: false, message: 'Missing authorization token' });
        }

        const users = readAllUsers();
        const user = users.find(u => u && u.userToken === token);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid authorization token' });
        }

        req.clientUser = user;
        req.clientToken = token;
        return next();
    } catch (err) {
        console.error('authenticateClient error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
}

function ensureUserTokenForEmail(email) {
    const users = readAllUsers();
    const lowerEmail = String(email || '').toLowerCase();
    const idx = users.findIndex(u => (u.email || '').toLowerCase() === lowerEmail);
    if (idx === -1) return null;

    if (!users[idx].userToken) {
        users[idx].userToken = crypto.randomBytes(24).toString('hex');
        users[idx].userTokenCreatedAt = new Date().toISOString();
        const ok = writeAllUsers(users);
        if (!ok) return null;
    }
    return users[idx];
}

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

// ========== REGISTERED USERS (CUSTOMERS) MANAGEMENT (ADMIN ONLY) ==========

app.get('/api/admin/registered-users', authenticateAdmin, (req, res) => {
    try {
        const users = readAllUsers();
        return res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching registered users:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch registered users' });
    }
});

app.put('/api/admin/registered-users/:identifier', authenticateAdmin, (req, res) => {
    const identifierRaw = req.params.identifier;
    const identifier = String(identifierRaw || '');

    try {
        const users = readAllUsers();
        const needleLower = identifier.toLowerCase();
        const idx = users.findIndex(u => {
            if (!u) return false;
            const email = String(u.email || '').toLowerCase();
            const token = String(u.userToken || '');
            const id = String(u.id || '');
            return (email && email === needleLower) || (token && token === identifier) || (id && id === identifier);
        });

        if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });

        const incoming = req.body || {};
        const current = users[idx];

        // Allow updating these fields only (preserve auth/token/password hashes)
        const nextUser = {
            ...current,
            fullName: incoming.fullName !== undefined ? String(incoming.fullName) : current.fullName,
            name: incoming.name !== undefined ? String(incoming.name) : current.name,
            phone: incoming.phone !== undefined ? String(incoming.phone) : current.phone,
            email: incoming.email !== undefined ? String(incoming.email) : current.email,
            country: incoming.country !== undefined ? String(incoming.country) : current.country,
            extra: incoming.extra !== undefined ? String(incoming.extra) : current.extra,
            role: incoming.role !== undefined ? String(incoming.role) : current.role
        };

        users[idx] = nextUser;
        const ok = writeAllUsers(users);
        if (!ok) return res.status(500).json({ success: false, message: 'Failed to persist user update' });

        logAdminAction('update_registered_user', { identifier, email: nextUser.email }, req.adminUser || 'admin');
        return res.json({ success: true, user: nextUser, users });
    } catch (error) {
        console.error('Error updating registered user:', error);
        return res.status(500).json({ success: false, message: 'Failed to update registered user' });
    }
});

app.delete('/api/admin/registered-users/:identifier', authenticateAdmin, (req, res) => {
    const identifierRaw = req.params.identifier;
    const identifier = String(identifierRaw || '');

    try {
        const users = readAllUsers();
        const needleLower = identifier.toLowerCase();
        const idx = users.findIndex(u => {
            if (!u) return false;
            const email = String(u.email || '').toLowerCase();
            const token = String(u.userToken || '');
            const id = String(u.id || '');
            return (email && email === needleLower) || (token && token === identifier) || (id && id === identifier);
        });

        if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });

        const removed = users.splice(idx, 1)[0];
        const ok = writeAllUsers(users);
        if (!ok) return res.status(500).json({ success: false, message: 'Failed to persist deletion' });

        logAdminAction('delete_registered_user', { identifier, email: removed?.email }, req.adminUser || 'admin');
        return res.json({ success: true, message: 'User deleted', user: removed, users });
    } catch (error) {
        console.error('Error deleting registered user:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete registered user' });
    }
});

// ========== ADMIN ORDERS ENDPOINTS ==========

// Get all orders (admin only)
app.get('/api/admin/orders', authenticateAdmin, (req, res) => {
    try {
        const orders = readAllOrders();

        // One-time migration: ensure every order has an orderId so admin actions
        // (delete/status/delivery) work reliably on legacy records.
        let changed = false;
        for (const order of orders) {
            if (!order || order.orderId) continue;

            const existing = order.id || order.order_number || order.orderNumber || order.orderNo;
            if (existing) {
                order.orderId = String(existing);
                changed = true;
                continue;
            }

            order.orderId = 'ORD-LEGACY-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
            changed = true;
        }

        if (changed) {
            const ok = writeAllOrders(orders);
            if (!ok) {
                return res.status(500).json({ success: false, message: 'Failed to persist order migration' });
            }
        }

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

        if (String(oldStatus) !== String(status)) {
            if (!Array.isArray(orders[idx].statusHistory)) orders[idx].statusHistory = [];
            orders[idx].statusHistory.push({
                from: oldStatus,
                to: status,
                timestamp: new Date().toISOString(),
                by: (req.user && req.user.username) ? req.user.username : 'admin'
            });
        }

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

        return res.json({ success: true, message: 'Order status updated', order: orders[idx], orders });
    } catch (err) {
        console.error('Error updating order status:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update order delivery info (admin only)
app.put('/api/admin/orders/:orderId/delivery', authenticateAdmin, async (req, res) => {
    const { orderId } = req.params;
    const { deliveryFile, attachedFiles, deliveryFiles, deliveryHidden } = req.body || {};

    if (!orderId) {
        return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    try {
        const orders = readAllOrders();
        const idx = orders.findIndex(o => String(o.orderId) === String(orderId));
        if (idx === -1) return res.status(404).json({ success: false, message: 'Order not found' });

        const order = orders[idx];

        if (typeof deliveryHidden === 'boolean') {
            order.deliveryHidden = deliveryHidden;
        }

        const hasDeliveryContent =
            (typeof deliveryFile === 'string' && deliveryFile.trim().length > 0) ||
            (Array.isArray(attachedFiles) && attachedFiles.length > 0) ||
            (Array.isArray(deliveryFiles) && deliveryFiles.length > 0);

        if (typeof deliveryFile === 'string') {
            order.deliveryFile = deliveryFile;
        }

        if (Array.isArray(attachedFiles)) {
            order.attachedFiles = attachedFiles;
        }

        if (Array.isArray(deliveryFiles)) {
            order.deliveryFiles = deliveryFiles;
        }

        if (hasDeliveryContent) {
            order.deliveryDate = new Date().toISOString();
            order.deliveryStatus = 'sent';

            // Mark completed when delivery is sent
            const oldStatus = order.status;
            if (String(oldStatus || '').toLowerCase() !== 'completed') {
                order.status = 'completed';
                order.statusUpdatedAt = new Date().toISOString();
                if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
                order.statusHistory.push({
                    from: oldStatus,
                    to: 'completed',
                    timestamp: new Date().toISOString(),
                    by: (req.user && req.user.username) ? req.user.username : 'admin'
                });
            }
        }

        const writeOk = writeAllOrders(orders);
        if (!writeOk) return res.status(500).json({ success: false, message: 'Failed to persist delivery info' });

        logAdminAction('update_order_delivery', { orderId }, req.adminUser || 'admin');

        return res.json({ success: true, message: 'Order delivery updated', order: orders[idx], orders });
    } catch (err) {
        console.error('Error updating order delivery:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

function readAllNotifications() {
    try {
        if (fs.existsSync(NOTIFICATIONS_FILE)) {
            const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading notifications.json:', e);
    }
    return [];
}

function writeAllNotifications(notifications) {
    try {
        fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
        return true;
    } catch (e) {
        console.error('Error writing notifications.json:', e);
        return false;
    }
}

// Admin notifications (persisted)
app.get('/api/admin/notifications', authenticateAdmin, (req, res) => {
    try {
        const notifications = readAllNotifications();
        return res.json({ success: true, notifications });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
});

app.post('/api/admin/notifications', authenticateAdmin, (req, res) => {
    try {
        const { email, icon, title, message, orderId } = req.body || {};
        if (!email || !title || !message) {
            return res.status(400).json({ success: false, message: 'email, title, and message are required' });
        }

        const notifications = readAllNotifications();
        const newNotification = {
            id: 'NOTIF-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
            email: String(email).toLowerCase(),
            icon: icon || '📢',
            title: String(title),
            message: String(message),
            orderId: orderId || null,
            sentDate: new Date().toISOString(),
            read: false
        };
        notifications.push(newNotification);

        if (!writeAllNotifications(notifications)) {
            return res.status(500).json({ success: false, message: 'Failed to persist notification' });
        }

        return res.json({ success: true, notification: newNotification, notifications });
    } catch (err) {
        console.error('Error creating notification:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete order (admin only)
app.delete('/api/admin/orders/:orderId', authenticateAdmin, (req, res) => {
    const { orderId } = req.params;

    try {
        const orders = readAllOrders();
        const needle = String(orderId);
        const idx = orders.findIndex(o => {
            if (!o) return false;
            const candidates = [o.orderId, o.id, o.order_number, o.orderNumber, o.orderNo]
                .filter(v => v !== undefined && v !== null)
                .map(v => String(v));
            return candidates.includes(needle);
        });
        if (idx === -1) return res.status(404).json({ success: false, message: 'Order not found' });

        const removed = orders.splice(idx, 1)[0];
        const ok = writeAllOrders(orders);
        if (!ok) return res.status(500).json({ success: false, message: 'Failed to persist deletion' });

        // Log admin action
        logAdminAction('delete_order', { orderId, customerEmail: removed.customer?.email || removed.email }, req.adminUser || 'admin');

        console.log(`🗑️ Order deleted: ${orderId}`);
        return res.json({ success: true, message: 'Order deleted', order: removed, orders });
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

        try {
            const customerEmail = String(order.customer?.email || order.email || '').trim().toLowerCase();
            const total = (order.totals && order.totals.tot) ? Number(order.totals.tot).toFixed(2) : null;
            addAdminAlert({
                type: 'order',
                title: `New Order #${order.orderId}`,
                message: `${customerEmail || 'unknown'}${total ? ` • $${total}` : ''} • ${order.paymentMethod || 'COD'}`,
                meta: { orderId: order.orderId, email: customerEmail || null, total: total ? Number(total) : null, paymentMethod: order.paymentMethod || null }
            });
        } catch (e) {
            // non-blocking
        }
        
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

// Backwards-compatible status endpoint (some deploy scripts/UI checks use this)
app.get('/api/status', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running' });
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
        const ticket = req.body || {};
        if (!ticket.trackingId || !ticket.email) {
            return res.status(400).json({ success: false, message: 'trackingId and email required' });
        }

        // Load existing tickets
        const tickets = readJsonArrayFile(TICKETS_FILE);

        const normalized = {
            ...ticket,
            trackingId: String(ticket.trackingId),
            email: String(ticket.email).toLowerCase(),
            token: ticket.token ? String(ticket.token) : undefined,
            timestamp: ticket.timestamp || new Date().toISOString(),
            replies: Array.isArray(ticket.replies) ? ticket.replies : []
        };

        tickets.push(normalized);
        if (!writeJsonArrayFile(TICKETS_FILE, tickets)) {
            return res.status(500).json({ success: false, message: 'Failed to save ticket' });
        }

        try {
            const mail = String(ticket.email || '').trim().toLowerCase();
            addAdminAlert({
                type: 'support_ticket',
                title: `New Support Ticket #${ticket.trackingId}`,
                message: `${mail || 'unknown'} • ${String(ticket.subject || '').slice(0, 80)}`,
                meta: { trackingId: ticket.trackingId, email: mail || null, subject: ticket.subject || null }
            });
        } catch (e) {
            // non-blocking
        }

        console.log(`✅ Ticket saved: ${normalized.trackingId}`);
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
        
        const tickets = readJsonArrayFile(TICKETS_FILE);

        // Find by stored token (preferred) or by trackingId (legacy)
        const ticket = tickets.find(t => (t && t.token && String(t.token) === token) || (t && String(t.trackingId) === token));
        
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        return res.json({ success: true, ticket: ticket });
    } catch (error) {
        console.error('Error retrieving ticket:', error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve ticket' });
    }
});

// Customer: add a new message to an existing ticket (creates an admin alert)
app.post('/api/ticket/:token/message', (req, res) => {
    try {
        const { token } = req.params;
        const { message, name, email } = req.body || {};

        const text = String(message || '').trim();
        if (!text) {
            return res.status(400).json({ success: false, message: 'message is required' });
        }

        const tickets = readJsonArrayFile(TICKETS_FILE);
        const idx = tickets.findIndex(t => (t && t.token && String(t.token) === token) || (t && String(t.trackingId) === token));
        if (idx === -1) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        const ticket = tickets[idx];
        if (!Array.isArray(ticket.replies)) ticket.replies = [];

        const reply = {
            id: 'MSG-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
            date: new Date().toISOString(),
            name: String(name || ticket.name || 'Customer'),
            email: String(email || ticket.email || '').toLowerCase(),
            message: text,
            attachments: [],
            from: 'customer'
        };

        ticket.replies.push(reply);
        ticket.updatedAt = new Date().toISOString();
        tickets[idx] = ticket;

        if (!writeJsonArrayFile(TICKETS_FILE, tickets)) {
            return res.status(500).json({ success: false, message: 'Failed to save message' });
        }

        try {
            const mail = String(ticket.email || '').trim().toLowerCase();
            addAdminAlert({
                type: 'support_message',
                title: `New Message on Ticket #${ticket.trackingId}`,
                message: `${mail || 'unknown'} • ${text.slice(0, 80)}`,
                meta: { trackingId: ticket.trackingId, token: ticket.token || null, email: mail || null }
            });
        } catch (e) {
            // non-blocking
        }

        return res.json({ success: true, ticket });
    } catch (error) {
        console.error('Error saving ticket message:', error);
        return res.status(500).json({ success: false, message: 'Failed to save message' });
    }
});

// Admin: add a support-team reply to an existing ticket
app.post('/api/admin/ticket/:token/reply', authenticateAdmin, (req, res) => {
    try {
        const { token } = req.params;
        const { message } = req.body || {};

        const text = String(message || '').trim();
        if (!text) {
            return res.status(400).json({ success: false, message: 'message is required' });
        }

        const tickets = readJsonArrayFile(TICKETS_FILE);
        const idx = tickets.findIndex(t => (t && t.token && String(t.token) === token) || (t && String(t.trackingId) === token));
        if (idx === -1) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        const ticket = tickets[idx];
        if (!Array.isArray(ticket.replies)) ticket.replies = [];

        const reply = {
            id: 'REPLY-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
            date: new Date().toISOString(),
            name: 'Support Team',
            email: '',
            message: text,
            attachments: [],
            from: 'support'
        };

        ticket.replies.push(reply);
        ticket.updatedAt = new Date().toISOString();
        tickets[idx] = ticket;

        if (!writeJsonArrayFile(TICKETS_FILE, tickets)) {
            return res.status(500).json({ success: false, message: 'Failed to save reply' });
        }

        return res.json({ success: true, ticket });
    } catch (error) {
        console.error('Error saving admin reply:', error);
        return res.status(500).json({ success: false, message: 'Failed to save reply' });
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
            userToken: crypto.randomBytes(24).toString('hex'),
            userTokenCreatedAt: new Date().toISOString(),
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
            authType: newUser.authType,
            token: newUser.userToken
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
            const updated = ensureUserTokenForEmail(lowerEmail);
            if (!updated) {
                return res.status(500).json({ success: false, message: 'Failed to prepare user session token' });
            }
            return res.json({
                success: true,
                message: 'User already exists',
                isNew: false,
                user: {
                    email: updated.email,
                    fullName: updated.fullName,
                    phone: updated.phone,
                    country: updated.country,
                    authType: updated.authType || 'email',
                    token: updated.userToken
                }
            });
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
            userToken: crypto.randomBytes(24).toString('hex'),
            userTokenCreatedAt: new Date().toISOString(),
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
                phone: newUser.phone,
                country: newUser.country,
                authType: newUser.authType,
                token: newUser.userToken
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

        const updatedUser = ensureUserTokenForEmail(lowerEmail);
        if (!updatedUser) {
            return res.status(500).json({ success: false, message: 'Failed to prepare user session token' });
        }

        // Return minimal user profile
        const safeUser = {
            email: updatedUser.email,
            fullName: updatedUser.fullName,
            phone: updatedUser.phone,
            country: updatedUser.country,
            authType: updatedUser.authType || 'email',
            token: updatedUser.userToken
        };

        return res.json({ success: true, user: safeUser });
    } catch (err) {
        console.error('/api/login error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Client "me" endpoints (token-based)
app.get('/api/me', authenticateClient, (req, res) => {
    const u = req.clientUser;
    return res.json({
        success: true,
        user: {
            email: u.email,
            fullName: u.fullName,
            phone: u.phone,
            country: u.country,
            authType: u.authType || 'email',
            createdAt: u.createdAt
        }
    });
});

app.put('/api/me', authenticateClient, (req, res) => {
    const { fullName, phone, country } = req.body || {};
    const users = readAllUsers();
    const idx = users.findIndex(u => u && u.userToken === req.clientToken);
    if (idx === -1) {
        return res.status(401).json({ success: false, message: 'Invalid authorization token' });
    }

    if (typeof fullName === 'string') users[idx].fullName = fullName.trim();
    if (typeof phone === 'string') users[idx].phone = phone.trim();
    if (typeof country === 'string') users[idx].country = country.trim();
    users[idx].updatedAt = new Date().toISOString();

    if (!writeAllUsers(users)) {
        return res.status(500).json({ success: false, message: 'Failed to update profile' });
    }

    return res.json({
        success: true,
        user: {
            email: users[idx].email,
            fullName: users[idx].fullName,
            phone: users[idx].phone,
            country: users[idx].country,
            authType: users[idx].authType || 'email',
            createdAt: users[idx].createdAt
        }
    });
});

app.post('/api/me/password', authenticateClient, async (req, res) => {
    try {
        const { password } = req.body || {};
        if (!password || typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const users = readAllUsers();
        const idx = users.findIndex(u => u && u.userToken === req.clientToken);
        if (idx === -1) {
            return res.status(401).json({ success: false, message: 'Invalid authorization token' });
        }

        users[idx].passwordHash = await bcrypt.hash(password, 12);
        delete users[idx].password;
        users[idx].passwordMigrated = true;
        users[idx].passwordMigratedAt = new Date().toISOString();
        users[idx].passwordResetAt = new Date().toISOString();

        if (!writeAllUsers(users)) {
            return res.status(500).json({ success: false, message: 'Failed to update password' });
        }

        return res.json({ success: true, message: 'Password updated' });
    } catch (err) {
        console.error('/api/me/password error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/me/orders', authenticateClient, (req, res) => {
    const email = String(req.clientUser.email || '').toLowerCase();
    const orders = readAllOrders();
    const myOrders = orders.filter(o => (o?.customer?.email || o?.email || '').toLowerCase() === email);
    return res.json({ success: true, orders: myOrders });
});

app.get('/api/me/notifications', authenticateClient, (req, res) => {
    const email = String(req.clientUser.email || '').toLowerCase();
    const notifications = readAllNotifications();
    const myNotifications = notifications.filter(n => (n?.email || '').toLowerCase() === email);
    return res.json({ success: true, notifications: myNotifications });
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

// Create new post (admin/editor with permission)
app.post('/api/posts', authenticateStaff, requireStaffPermission('blog'), (req, res) => {
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

// Update existing post (admin/editor with permission)
app.put('/api/posts/:id', authenticateStaff, requireStaffPermission('blog'), (req, res) => {
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

// Delete post (admin/editor with permission)
app.delete('/api/posts/:id', authenticateStaff, requireStaffPermission('blog'), (req, res) => {
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

// Add new product (admin/editor with permission)
app.post('/api/products', authenticateStaff, requireStaffPermission('products'), (req, res) => {
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
            logAdminAction('create_product', { productId: product.id, title: product.title }, req.adminUser || 'admin');
            res.json({ success: true, product, products });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save product' });
        }
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ success: false, message: 'Failed to add product' });
    }
});

// Reorder products (admin/editor with permission)
// Body: { order: ["id1", "id2", ...] } OR { products: [...] }
// Notes: IMPORTANT - this must be registered before /api/products/:id.
// Preserves existing product objects and appends any missing products at the end.
app.put('/api/products/reorder', authenticateStaff, requireStaffPermission('products'), (req, res) => {
    try {
        const orderRaw = (req.body && (req.body.order || req.body.products || req.body.ids)) || [];
        if (!Array.isArray(orderRaw)) {
            return res.status(400).json({ success: false, message: 'order must be an array' });
        }

        const requestedOrder = orderRaw
            .map(v => String(v === null || v === undefined ? '' : v).trim())
            .filter(Boolean);

        const products = readAllProducts();
        const byId = new Map();
        (products || []).forEach(p => {
            const key = String(p?.id ?? '').trim();
            if (key) byId.set(key, p);
        });

        const reordered = [];
        for (const id of requestedOrder) {
            const existing = byId.get(id);
            if (existing) {
                reordered.push(existing);
                byId.delete(id);
            }
        }

        // Append any products not included in request (keeps their existing relative order)
        (products || []).forEach(p => {
            const key = String(p?.id ?? '').trim();
            if (key && byId.has(key)) {
                reordered.push(p);
                byId.delete(key);
            }
        });

        if (writeAllProducts(reordered)) {
            logAdminAction('reorder_products', { count: reordered.length }, req.adminUser || 'admin');
            res.json({ success: true, message: 'Product order updated', products: reordered });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save product order' });
        }
    } catch (error) {
        console.error('Error reordering products:', error);
        res.status(500).json({ success: false, message: 'Failed to reorder products' });
    }
});

// Update product (admin/editor with permission)
app.put('/api/products/:id', authenticateStaff, requireStaffPermission('products'), (req, res) => {
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
            logAdminAction('update_product', { productId: id, title: products[index]?.title }, req.adminUser || 'admin');
            res.json({ success: true, product: products[index], products });
        } else {
            res.status(500).json({ success: false, message: 'Failed to update product' });
        }
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ success: false, message: 'Failed to update product' });
    }
});

// Delete product (no authentication required)
app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;

    try {
        const products = readAllProducts();
        const removed = products.find(p => String(p?.id) === String(id)) || null;
        const filtered = products.filter(p => p.id !== id);

        if (filtered.length === products.length) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        if (writeAllProducts(filtered)) {
            res.json({ success: true, message: 'Product deleted successfully', product: removed, products: filtered });
        } else {
            res.status(500).json({ success: false, message: 'Failed to delete product' });
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
});

// Bulk upload products from CSV or JSON (admin/editor with permission)
app.post('/api/products/bulk-upload', authenticateStaff, requireStaffPermission('products'), (req, res) => {
    try {
        const { format, data } = req.body;

        if (!data || typeof data !== 'string') {
            return res.status(400).json({ success: false, message: 'No data provided' });
        }

        let products = [];

        if (format === 'json') {
            try {
                const parsed = JSON.parse(data);
                products = Array.isArray(parsed) ? parsed : (parsed.products || []);
            } catch (e) {
                return res.status(400).json({ success: false, message: 'Invalid JSON format' });
            }
        } else if (format === 'csv') {
            const lines = data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) {
                return res.status(400).json({ success: false, message: 'CSV must contain at least header and one data row' });
            }

            const headers = parseCSVLine(lines[0]);
            const requiredFields = ['title', 'category', 'price', 'quantity'];

            // Check required fields
            const missingFields = requiredFields.filter(field => !headers.includes(field));
            if (missingFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Required fields missing: ${missingFields.join(', ')}`
                });
            }

            // Parse products
            for (let i = 1; i < lines.length; i++) {
                try {
                    const values = parseCSVLine(lines[i]);
                    if (values.length === 0) continue;

                    const product = {};
                    headers.forEach((header, index) => {
                        let value = values[index] || '';

                        // Convert to appropriate types
                        if (header === 'price' || header === 'offerPrice') {
                            value = value && !isNaN(value) ? parseFloat(value) : null;
                        } else if (header === 'quantity') {
                            value = value && !isNaN(value) ? parseInt(value) : 0;
                        }

                        product[header] = value;
                    });

                    products.push(product);
                } catch (error) {
                    return res.status(400).json({
                        success: false,
                        message: `Error parsing row ${i + 1}: ${error.message}`
                    });
                }
            }
        } else {
            return res.status(400).json({ success: false, message: 'Invalid format. Use "json" or "csv"' });
        }

        if (products.length === 0) {
            return res.status(400).json({ success: false, message: 'No products found in data' });
        }

        // Validate products
        const errors = [];
        const validProducts = [];

        products.forEach((product, index) => {
            const productErrors = [];

            if (!product.title || typeof product.title !== 'string' || product.title.trim() === '') {
                productErrors.push('title is required');
            }

            if (!product.category || typeof product.category !== 'string' || product.category.trim() === '') {
                productErrors.push('category is required');
            }

            if (!product.price || isNaN(product.price) || product.price <= 0) {
                productErrors.push('price must be a positive number');
            }

            if (!product.quantity || isNaN(product.quantity) || product.quantity < 0) {
                productErrors.push('quantity must be a non-negative number');
            }

            if (!product.image || typeof product.image !== 'string' || product.image.trim() === '') {
                productErrors.push('image URL is required');
            }

            if (productErrors.length === 0) {
                // Clean up the product data
                const cleanProduct = {
                    title: product.title.trim(),
                    category: product.category.trim(),
                    price: parseFloat(product.price),
                    quantity: parseInt(product.quantity),
                    image: product.image.trim(),
                    id: product.id || Date.now().toString() + Math.random().toString(36).substr(2, 9)
                };

                // Add optional fields
                if (product.offerPrice && !isNaN(product.offerPrice)) {
                    cleanProduct.offerPrice = parseFloat(product.offerPrice);
                }

                if (product.note) cleanProduct.note = product.note;
                if (product.title_en) cleanProduct.title_en = product.title_en;
                if (product.note_en) cleanProduct.note_en = product.note_en;
                if (product.title_ru) cleanProduct.title_ru = product.title_ru;
                if (product.note_ru) cleanProduct.note_ru = product.note_ru;
                if (product.title_zh) cleanProduct.title_zh = product.title_zh;
                if (product.note_zh) cleanProduct.note_zh = product.note_zh;
                if (product.title_ar) cleanProduct.title_ar = product.title_ar;
                if (product.note_ar) cleanProduct.note_ar = product.note_ar;

                validProducts.push(cleanProduct);
            } else {
                errors.push(`Row ${index + 1}: ${productErrors.join(', ')}`);
            }
        });

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.slice(0, 10), // Limit errors shown
                totalErrors: errors.length
            });
        }

        // Read existing products and merge
        const existingProducts = readAllProducts();
        const mergedProducts = [...existingProducts, ...validProducts];

        // Save all products
        if (writeAllProducts(mergedProducts)) {
            logAdminAction('bulk_upload_products', {
                count: validProducts.length,
                format: format,
                source: 'dashboard'
            }, req.adminUser || 'admin');

            res.json({
                success: true,
                message: `Successfully uploaded ${validProducts.length} products`,
                products: validProducts
            });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save products' });
        }

    } catch (error) {
        console.error('Bulk upload error:', error);
        res.status(500).json({ success: false, message: 'Server error during bulk upload' });
    }
});

// Helper function to parse CSV line (handles quoted values with commas)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // Field separator
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    // Add last field
    result.push(current.trim());

    return result;
}

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

// Add new category (admin/editor with permission)
app.post('/api/categories', authenticateStaff, requireStaffPermission('categories'), (req, res) => {
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

// Reorder categories (admin/editor with permission)
// Body: { categories: ["GMAIL", "FACEBOOK", ...] }
// Notes: Preserves existing category objects and appends any missing categories at the end.
app.put('/api/categories/reorder', authenticateStaff, requireStaffPermission('categories'), (req, res) => {
    try {
        const orderRaw = (req.body && (req.body.categories || req.body.order)) || [];
        if (!Array.isArray(orderRaw)) {
            return res.status(400).json({ success: false, message: 'categories must be an array' });
        }

        const requestedOrder = orderRaw
            .map(v => String(v || '').trim())
            .filter(Boolean);

        const categories = readAllCategories();
        const byName = new Map();
        (categories || []).forEach(cat => {
            const key = String(cat?.name || '').trim().toLowerCase();
            if (key) byName.set(key, cat);
        });

        const reordered = [];
        for (const name of requestedOrder) {
            const key = name.toLowerCase();
            const existing = byName.get(key);
            if (existing) {
                reordered.push(existing);
                byName.delete(key);
            }
        }

        // Append any categories not included in request (keeps their existing relative order)
        (categories || []).forEach(cat => {
            const key = String(cat?.name || '').trim().toLowerCase();
            if (key && byName.has(key)) {
                reordered.push(cat);
                byName.delete(key);
            }
        });

        const nowIso = new Date().toISOString();
        reordered.forEach(cat => {
            if (cat) cat.updatedAt = nowIso;
        });

        if (writeAllCategories(reordered)) {
            res.json({ success: true, message: 'Category order updated', categories: reordered.map(c => c.name) });
        } else {
            res.status(500).json({ success: false, message: 'Failed to save category order' });
        }
    } catch (error) {
        console.error('Error reordering categories:', error);
        res.status(500).json({ success: false, message: 'Failed to reorder categories' });
    }
});

// Update category (admin/editor with permission)
app.put('/api/categories/:name', authenticateStaff, requireStaffPermission('categories'), (req, res) => {
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

// Delete category (admin/editor with permission)
app.delete('/api/categories/:name', authenticateStaff, requireStaffPermission('categories'), (req, res) => {
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

// Get all media files (admin/editor with permission)
app.get('/api/media', authenticateStaff, requireStaffPermission('media'), (req, res) => {
    try {
        const media = readAllMedia();
        const folders = readAllFolders();
        res.json({ success: true, media, folders });
    } catch (error) {
        console.error('Error fetching media:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch media' });
    }
});

// Upload media file (admin/editor with permission)
app.post('/api/media', authenticateStaff, requireStaffPermission('media'), uploadSingleMediaFile, (req, res) => {
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

// Delete media file (admin/editor with permission)
app.delete('/api/media/:id', authenticateStaff, requireStaffPermission('media'), (req, res) => {
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

// Create folder (admin/editor with permission)
app.post('/api/folders', authenticateStaff, requireStaffPermission('media'), (req, res) => {
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

// Delete folder (admin/editor with permission)
app.delete('/api/folders/:id', authenticateStaff, requireStaffPermission('media'), (req, res) => {
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

// Move file to folder (admin/editor with permission)
app.put('/api/media/:id/move', authenticateStaff, requireStaffPermission('media'), (req, res) => {
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
app.get('/api/dashboard/files/tree', authenticateStaff, requireStaffPermission('files'), (req, res) => {
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
app.get('/api/dashboard/files/list', authenticateStaff, requireStaffPermission('files'), (req, res) => {
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
app.get('/api/dashboard/files/read', authenticateStaff, requireStaffPermission('files'), (req, res) => {
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
app.post('/api/dashboard/files/save', authenticateStaff, requireStaffPermission('files'), (req, res) => {
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
app.post('/api/dashboard/files/create', authenticateStaff, requireStaffPermission('files'), (req, res) => {
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
app.delete('/api/dashboard/files/delete', authenticateStaff, requireStaffPermission('files'), (req, res) => {
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

// Update marketplace help section
app.post('/api/update-help-section', authenticateStaff, (req, res) => {
    try {
        const { title, label, linkText, linkUrl } = req.body;
        
        if (!title || !label || !linkText || !linkUrl) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        
        // Read marketplace.html
        const marketplacePath = path.join(__dirname, '..', 'marketplace.html');
        let html = fs.readFileSync(marketplacePath, 'utf8');
        
        // Create the new help section HTML
        const newHelpSection = `          <!-- Help Section -->
          <div class="side">
            <h3>${title}</h3>
            <div class="muted">${label} <a href="${linkUrl}" style="color: #007bff;">${linkText}</a></div>
          </div>`;
        
        // Replace the old help section
        const oldHelpSectionRegex = /<!-- Help Section -->\s*<div class="side">\s*<h3>Need help\?<\/h3>\s*<div class="muted">CONTACTS: <a href="support\.html" style="color: #007bff;">support\.html<\/a><\/div>\s*<\/div>/;
        html = html.replace(oldHelpSectionRegex, newHelpSection);
        
        // Write back to file
        fs.writeFileSync(marketplacePath, html);
        
        logAdminAction('update_help_section', { title, label, linkText, linkUrl }, req.adminUser || 'admin');
        
        res.json({ success: true, message: 'Help section updated successfully' });
    } catch (error) {
        console.error('Error updating help section:', error);
        res.status(500).json({ success: false, message: 'Failed to update help section' });
    }
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

// Serve static files from the parent directory (where admin.html is located)
app.use(express.static(path.join(__dirname, '..')));

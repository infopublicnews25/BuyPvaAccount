const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_FILE = path.join(__dirname, 'admin-credentials.json');
const USERS_FILE = path.join(__dirname, '../admin_users.json');

const { statements } = require('./db');

function normalizePermissionKey(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return '';

    const key = raw.replace(/[^a-z0-9]/g, '');
    if (!key) return '';

    // Canonical permission keys used across frontend + backend
    // Keep this mapping tolerant to legacy/stored labels.
    if (key === 'media' || key === 'medialibrary' || key === 'mediafiles') return 'media';
    if (key === 'blog' || key === 'blogadmin' || key === 'createpost' || key === 'posts') return 'blog';

    if (
        key === 'products' ||
        key === 'product' ||
        key === 'addproduct' ||
        key === 'productspage' ||
        key === 'productsmanager' ||
        key === 'productshtml' ||
        key === 'producthtml'
    ) return 'products';

    if (
        key === 'categories' ||
        key === 'category' ||
        key === 'productcategories'
    ) return 'categories';

    if (key === 'inventory' || key === 'stock' || key === 'productstock') return 'inventory';
    if (key === 'analytics' || key === 'productanalytics') return 'analytics';
    if (key === 'reviews' || key === 'productreviews') return 'reviews';

    if (
        key === 'files' ||
        key === 'filemanager' ||
        key === 'pages' ||
        key === 'websitepages'
    ) return 'files';

    // Send Notification/Delivery tool
    if (
        key === 'send' ||
        key === 'sendnotification' ||
        key === 'senddelivery' ||
        key === 'delivery' ||
        key === 'notification'
    ) return 'send';

    // Extra module keys (used in admin UI)
    if (key === 'orders' || key === 'order' || key === 'ordermanagement') return 'orders';
    if (key === 'notifications' || key === 'accountrequests') return 'notifications';
    if (key === 'payments' || key === 'paymentsettings' || key === 'promocodes' || key === 'promo') return 'payments';
    if (key === 'users' || key === 'usermanagement') return 'users';
    if (key === 'backup' || key === 'sitebackup') return 'backup';

    // Legacy / optional tools
    if (key === 'note' || key === 'notes' || key === 'createnote') return 'note';
    if (key === 'comment' || key === 'comments' || key === 'createcomment') return 'comment';

    return key;
}

function normalizePermissions(perms) {
    if (!Array.isArray(perms)) return [];
    const out = [];
    const seen = new Set();
    for (const p of perms) {
        const k = normalizePermissionKey(p);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(k);
        if (out.length >= 50) break;
    }
    return out;
}

async function verifyAdmin(username, password) {
    try {
        // First check admin credentials
        const credentials = statements.getAdminCredentials.get();
        if (credentials && username === credentials.username) {
            const isValid = await bcrypt.compare(password, credentials.passwordHash);
            if (isValid) {
                // Update last login for admin
                statements.updateAdminLastLogin.run(new Date().toISOString());
                return { success: true, user: { username, role: 'admin', status: 'active', lastLogin: credentials.lastLogin } };
            }
        }

        // Then check regular admin users
        const user = statements.getAdminUserByUsername.get(username) || statements.getAdminUserByEmail.get(username);
        if (user) {
            const isValid = await bcrypt.compare(password, user.passwordHash);
            if (isValid) {
                // Update last login
                user.lastLogin = new Date().toISOString();
                statements.updateAdminUser.run(user.username, user.email, user.role, user.passwordHash, user.lastLogin, user.id);
                return {
                    success: true,
                    user: {
                        username: user.username,
                        role: user.role,
                        email: user.email,
                        status: user.status || 'active',
                        permissions: normalizePermissions(user.permissions)
                    }
                };
            }
        }

        return { success: false };
    } catch (error) {
        console.error('Error verifying credentials:', error);
        return { success: false };
    }
}

async function verifyToken(token) {
    try {
        if (!token) {
            return { success: false, message: 'Token is required' };
        }

        // Allow a brief grace period for the previous token to avoid
        // immediate logouts from double-login or multiple tabs.
        const PREV_TOKEN_GRACE_MS = 5 * 60 * 1000; // 5 minutes

        // Check admin token first
        const adminTokenFile = path.join(__dirname, 'admin-token.json');
        if (fs.existsSync(adminTokenFile)) {
            const adminTokenData = JSON.parse(fs.readFileSync(adminTokenFile, 'utf8'));
            if (fs.existsSync(CREDENTIALS_FILE)) {
                const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
                if (adminTokenData.token === token && adminTokenData.username === credentials.username) {
                    // Check if token is not too old (24 hours)
                    if (Date.now() - adminTokenData.timestamp < 24 * 60 * 60 * 1000) {
                        return { success: true, user: { username: credentials.username, role: 'admin' } };
                    } else {
                        return { success: false, message: 'Token expired' };
                    }
                }

                // Grace period for previous admin token
                if (
                    adminTokenData.prevToken === token &&
                    adminTokenData.username === credentials.username &&
                    typeof adminTokenData.prevTokenTimestamp === 'number' &&
                    (Date.now() - adminTokenData.prevTokenTimestamp) < PREV_TOKEN_GRACE_MS
                ) {
                    return { success: true, user: { username: credentials.username, role: 'admin' } };
                }
            }
        }

        // Check regular users for token
        if (fs.existsSync(USERS_FILE)) {
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            const user = users.find(u => {
                if (!u) return false;
                if (u.token === token) return true;
                if (
                    u.prevToken === token &&
                    typeof u.prevTokenTimestamp === 'number' &&
                    (Date.now() - u.prevTokenTimestamp) < PREV_TOKEN_GRACE_MS
                ) {
                    return true;
                }
                return false;
            });
            if (user) {
                return { success: true, user: { ...user, permissions: normalizePermissions(user.permissions) } };
            }
        }
        return { success: false, message: 'Token not found in system' };
    } catch (error) {
        console.error('Error verifying token:', error);
        return { success: false, message: error.message };
    }
}

async function storeUserToken(username, token) {
    try {
        // Handle admin user specially
        if (fs.existsSync(CREDENTIALS_FILE)) {
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            if (username === credentials.username) {
                // For admin, we'll store in a separate file or use a different approach
                const adminTokenFile = path.join(__dirname, 'admin-token.json');
                let prevToken = null;
                let prevTokenTimestamp = null;
                try {
                    if (fs.existsSync(adminTokenFile)) {
                        const existing = JSON.parse(fs.readFileSync(adminTokenFile, 'utf8'));
                        prevToken = existing && existing.token ? existing.token : null;
                        prevTokenTimestamp = Date.now();
                    }
                } catch (e) {
                    // ignore
                }

                fs.writeFileSync(
                    adminTokenFile,
                    JSON.stringify(
                        {
                            username,
                            token,
                            timestamp: Date.now(),
                            prevToken,
                            prevTokenTimestamp
                        },
                        null,
                        2
                    )
                );
                return { success: true };
            }
        }

        // For regular users
        if (fs.existsSync(USERS_FILE)) {
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            const needle = String(username || '').toLowerCase();
            const user = users.find(u => String(u.username || '').toLowerCase() === needle || String(u.email || '').toLowerCase() === needle);
            if (user) {
                // Preserve previous token briefly to prevent immediate logout
                if (user.token && user.token !== token) {
                    user.prevToken = user.token;
                    user.prevTokenTimestamp = Date.now();
                }
                user.token = token;
                fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
                return { success: true };
            }
        }
        return { success: false };
    } catch (error) {
        console.error('Error storing token:', error);
        return { success: false };
    }
}

async function createUser(userData) {
    try {
        const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : [];

        // Check if user already exists
        if (users.some(u => u.username === userData.username || u.email === userData.email)) {
            return { success: false, message: 'User already exists' };
        }

        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const newUser = {
            username: userData.username,
            email: userData.email,
            role: userData.role,
            passwordHash: hashedPassword,
            status: 'active',
            permissions: normalizePermissions(userData.permissions),
            createdAt: new Date().toISOString(),
            lastLogin: null
        };

        users.push(newUser);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

        return { success: true, user: newUser };
    } catch (error) {
        console.error('Error creating user:', error);
        return { success: false, message: 'Failed to create user' };
    }
}

function getAllUsers() {
    try {
        let users = [];
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }

        // Do NOT include the built-in admin credentials user in the list.
        // That account is managed via admin-credentials.json and should not appear
        // in the admin user management table.
        if (fs.existsSync(CREDENTIALS_FILE)) {
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            const credUsername = String(credentials?.username || '').toLowerCase();
            users = users.filter(u => {
                const uName = String(u?.username || '').toLowerCase();
                const uEmail = String(u?.email || '').toLowerCase();
                const looksLikeCredShadow =
                    uName && credUsername && uName === credUsername &&
                    (uEmail === 'admin@buypvaaccount.com' || !uEmail) &&
                    !u?.passwordHash;
                return !looksLikeCredShadow;
            });
        }

        return users;
    } catch (error) {
        console.error('Error reading users:', error);
        return [];
    }
}

async function updateUser(username, userData) {
    try {
        // Never update the built-in credentials account via this endpoint.
        if (fs.existsSync(CREDENTIALS_FILE)) {
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            if (credentials && String(credentials.username) === String(username)) {
                return { success: false, message: 'Default admin account must be updated via admin credentials' };
            }
        }

        const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : [];
        const userIndex = users.findIndex(u => u && u.username === username);

        if (userIndex === -1) {
            return { success: false, message: 'User not found' };
        }

        // Only update provided fields (don't overwrite with undefined)
        // and preserve important fields like passwordHash, createdAt, etc
        if (userData.email && userData.email !== users[userIndex].email) {
            users[userIndex].email = userData.email;
        }
        if (userData.role && userData.role !== users[userIndex].role) {
            users[userIndex].role = userData.role;
        }

        if (userData.permissions !== undefined) {
            users[userIndex].permissions = normalizePermissions(userData.permissions);
        }
        if (userData.status !== undefined && userData.status !== users[userIndex].status) {
            users[userIndex].status = userData.status;
        }

        // Hash password if provided
        if (userData.password) {
            users[userIndex].passwordHash = await bcrypt.hash(userData.password, 10);
        }

        // Save back to file - ensure we're not creating duplicates
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        
        console.log(`Updated user ${username} - index: ${userIndex}`);
        return { success: true, user: users[userIndex] };
    } catch (error) {
        console.error('Error updating user:', error);
        return { success: false, message: 'Failed to update user' };
    }
}

function deleteUser(username) {
    try {
        // Never delete the built-in credentials account via this endpoint.
        if (fs.existsSync(CREDENTIALS_FILE)) {
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            if (credentials && String(credentials.username) === String(username)) {
                return { success: false, message: 'Default admin account cannot be deleted' };
            }
        }

        const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : [];
        const filteredUsers = users.filter(u => u && u.username !== username);

        if (filteredUsers.length === users.length) {
            return { success: false, message: 'User not found' };
        }

        fs.writeFileSync(USERS_FILE, JSON.stringify(filteredUsers, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error deleting user:', error);
        return { success: false, message: 'Failed to delete user' };
    }
}

async function updateAdminCredentials(newUsername, newPassword) {
    try {
        const hash = await bcrypt.hash(newPassword, 10);
        const credentials = {
            username: newUsername,
            passwordHash: hash
        };
        fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error updating admin credentials:', error);
        return { success: false, message: 'Failed to update credentials' };
    }
}

module.exports = {
    verifyAdmin,
    createUser,
    getAllUsers,
    updateUser,
    deleteUser,
    verifyToken,
    storeUserToken,
    updateAdminCredentials
};
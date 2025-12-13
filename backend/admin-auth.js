const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_FILE = path.join(__dirname, 'admin-credentials.json');
const USERS_FILE = path.join(__dirname, '../admin_users.json');

const { statements } = require('./db');

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
        const user = statements.getAdminUserByUsername.get(username);
        if (user) {
            const isValid = await bcrypt.compare(password, user.passwordHash);
            if (isValid) {
                // Update last login
                user.lastLogin = new Date().toISOString();
                statements.updateAdminUser.run(user.username, user.email, user.role, user.passwordHash, user.lastLogin, user.id);
                return { success: true, user: { username: user.username, role: user.role, email: user.email, status: user.status || 'active' } };
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
                    }
                }
            }
        }

        // Check regular users for token
        if (fs.existsSync(USERS_FILE)) {
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            const user = users.find(u => u.token === token);
            if (user) {
                return { success: true, user };
            }
        }
        return { success: false };
    } catch (error) {
        console.error('Error verifying token:', error);
        return { success: false };
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
                fs.writeFileSync(adminTokenFile, JSON.stringify({ username, token, timestamp: Date.now() }));
                return { success: true };
            }
        }

        // For regular users
        if (fs.existsSync(USERS_FILE)) {
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            const user = users.find(u => u.username === username);
            if (user) {
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

        // Get regular users
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }

        // Add admin user
        if (fs.existsSync(CREDENTIALS_FILE)) {
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            users.unshift({
                username: credentials.username,
                email: 'admin@buypvaaccount.com', // Default admin email
                role: 'admin',
                status: 'active',
                lastLogin: credentials.lastLogin || null
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
        const users = getAllUsers();
        const userIndex = users.findIndex(u => u.username === username);

        if (userIndex === -1) {
            return { success: false, message: 'User not found' };
        }

        // Update user data
        users[userIndex] = { ...users[userIndex], ...userData };

        // Hash password if provided
        if (userData.password) {
            users[userIndex].passwordHash = await bcrypt.hash(userData.password, 10);
        }

        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return { success: true, user: users[userIndex] };
    } catch (error) {
        console.error('Error updating user:', error);
        return { success: false, message: 'Failed to update user' };
    }
}

function deleteUser(username) {
    try {
        const users = getAllUsers();
        const filteredUsers = users.filter(u => u.username !== username);

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
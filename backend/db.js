const fs = require('fs');
const path = require('path');

const CREDENTIALS_FILE = path.join(__dirname, 'admin-credentials.json');
const USERS_FILE = path.join(__dirname, '../admin_users.json');

// Mock database statements that work with JSON files
const statements = {
    getAdminCredentials: {
        get: () => {
            try {
                if (fs.existsSync(CREDENTIALS_FILE)) {
                    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
                }
                return null;
            } catch (error) {
                console.error('Error reading admin credentials:', error);
                return null;
            }
        }
    },

    updateAdminLastLogin: {
        run: (lastLogin) => {
            try {
                if (fs.existsSync(CREDENTIALS_FILE)) {
                    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
                    credentials.lastLogin = lastLogin;
                    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
                }
            } catch (error) {
                console.error('Error updating admin last login:', error);
            }
        }
    },

    getAdminUserByUsername: {
        get: (username) => {
            try {
                if (fs.existsSync(USERS_FILE)) {
                    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
                    return users.find(user => user.username === username);
                }
                return null;
            } catch (error) {
                console.error('Error reading admin users:', error);
                return null;
            }
        }
    },

    updateAdminUser: {
        run: (username, email, role, passwordHash, lastLogin, id) => {
            try {
                if (fs.existsSync(USERS_FILE)) {
                    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
                    const userIndex = users.findIndex(user => user.id === id);
                    if (userIndex !== -1) {
                        users[userIndex] = { id, username, email, role, passwordHash, lastLogin };
                        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
                    }
                }
            } catch (error) {
                console.error('Error updating admin user:', error);
            }
        }
    }
};

module.exports = { statements };
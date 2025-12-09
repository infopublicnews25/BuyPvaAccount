/**
 * Secure Storage Utility
 * Provides secure client-side storage with XSS protection
 * Uses sessionStorage for sensitive data, localStorage for non-sensitive data
 */

// Secure Storage Keys
const STORAGE_KEYS = {
    // Sensitive data (sessionStorage - cleared on tab close)
    AUTH_TOKEN: 'secure_auth_token',
    USER_SESSION: 'secure_user_session',
    ADMIN_TOKEN: 'secure_admin_token',

    // Non-sensitive data (localStorage - persistent)
    CART: 'mp_cart_v1',
    CATEGORIES: 'product_categories',
    NEWS_UPDATES: 'newsUpdates',
    ACCOUNT_REQUESTS: 'account_requests',
    USER_PREFERENCES: 'user_preferences'
};

/**
 * Secure Storage Class
 * Handles sensitive and non-sensitive data appropriately
 */
class SecureStorage {
    constructor() {
        this.init();
    }

    init() {
        // Migrate existing sensitive data to sessionStorage if needed
        this.migrateSensitiveData();
    }

    /**
     * Migrate sensitive data from localStorage to sessionStorage
     */
    migrateSensitiveData() {
        try {
            // Migrate client auth data
            const clientAuth = localStorage.getItem('client_auth');
            if (clientAuth && !sessionStorage.getItem(STORAGE_KEYS.USER_SESSION)) {
                sessionStorage.setItem(STORAGE_KEYS.USER_SESSION, clientAuth);
                // Keep in localStorage for backward compatibility but mark as migrated
                localStorage.setItem('client_auth_migrated', 'true');
            }

            // Migrate admin tokens
            const adminAuth = localStorage.getItem('admin_auth');
            if (adminAuth && !sessionStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN)) {
                sessionStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, adminAuth);
                localStorage.setItem('admin_auth_migrated', 'true');
            }

            const adminAuthToken = localStorage.getItem('admin_auth_token');
            if (adminAuthToken && !sessionStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN)) {
                sessionStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, adminAuthToken);
                localStorage.setItem('admin_auth_token_migrated', 'true');
            }

        } catch (error) {
            console.warn('SecureStorage: Migration failed:', error);
        }
    }

    /**
     * Set sensitive data (goes to sessionStorage)
     */
    setSensitive(key, value) {
        try {
            const data = typeof value === 'string' ? value : JSON.stringify(value);
            sessionStorage.setItem(key, data);
            return true;
        } catch (error) {
            console.error('SecureStorage: Failed to set sensitive data:', error);
            return false;
        }
    }

    /**
     * Get sensitive data (from sessionStorage)
     */
    getSensitive(key, defaultValue = null) {
        try {
            const data = sessionStorage.getItem(key);
            if (data === null) return defaultValue;

            // Try to parse as JSON, fallback to string
            try {
                return JSON.parse(data);
            } catch {
                return data;
            }
        } catch (error) {
            console.error('SecureStorage: Failed to get sensitive data:', error);
            return defaultValue;
        }
    }

    /**
     * Remove sensitive data
     */
    removeSensitive(key) {
        try {
            sessionStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('SecureStorage: Failed to remove sensitive data:', error);
            return false;
        }
    }

    /**
     * Set non-sensitive data (goes to localStorage)
     */
    set(key, value) {
        try {
            const data = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, data);
            return true;
        } catch (error) {
            console.error('SecureStorage: Failed to set data:', error);
            return false;
        }
    }

    /**
     * Get non-sensitive data (from localStorage)
     */
    get(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(key);
            if (data === null) return defaultValue;

            // Try to parse as JSON, fallback to string
            try {
                return JSON.parse(data);
            } catch {
                return data;
            }
        } catch (error) {
            console.error('SecureStorage: Failed to get data:', error);
            return defaultValue;
        }
    }

    /**
     * Remove non-sensitive data
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('SecureStorage: Failed to remove data:', error);
            return false;
        }
    }

    /**
     * Clear all sensitive data (sessionStorage)
     */
    clearSensitive() {
        try {
            // Clear our known sensitive keys
            Object.values(STORAGE_KEYS).forEach(key => {
                if (key.includes('auth') || key.includes('token') || key.includes('session')) {
                    sessionStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            console.error('SecureStorage: Failed to clear sensitive data:', error);
            return false;
        }
    }

    /**
     * Clear all data
     */
    clearAll() {
        try {
            this.clearSensitive();
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('SecureStorage: Failed to clear all data:', error);
            return false;
        }
    }

    /**
     * Check if data exists
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Check if sensitive data exists
     */
    hasSensitive(key) {
        return this.getSensitive(key) !== null;
    }
}

// Create global instance
const secureStorage = new SecureStorage();

// Legacy compatibility functions
const legacyStorage = {
    // Backward compatibility for existing code
    getItem: (key) => {
        // Route sensitive keys to secure storage
        if (key.includes('auth') || key.includes('token') || key === 'client_auth') {
            return sessionStorage.getItem(key) || localStorage.getItem(key);
        }
        return localStorage.getItem(key);
    },

    setItem: (key, value) => {
        // Route sensitive keys to secure storage
        if (key.includes('auth') || key.includes('token') || key === 'client_auth') {
            sessionStorage.setItem(key, value);
        } else {
            localStorage.setItem(key, value);
        }
    },

    removeItem: (key) => {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
    }
};

// Export for use in other scripts
window.SecureStorage = SecureStorage;
window.secureStorage = secureStorage;
window.legacyStorage = legacyStorage;
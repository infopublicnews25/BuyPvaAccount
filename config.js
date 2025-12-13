// Configuration for frontend API endpoints
// This file detects whether we're in development or production

const CONFIG = (() => {
    // Get the current location
    const protocol = window.location.protocol; // http: or https:
    const hostname = window.location.hostname;
    const port = window.location.port;

    // Determine if we're in development
    const isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';

    let apiBase;

    if (isDevelopment) {
        // Development: use localhost:3000
        apiBase = 'http://localhost:3000';
    } else {
        // Production: use the same domain
        if (port) {
            apiBase = `${protocol}//${hostname}:${port}`;
        } else {
            apiBase = `${protocol}//${hostname}`;
        }
    }

    return {
        API_BASE_URL: apiBase,
        API: `${apiBase}/api`,
        isDevelopment: isDevelopment
    };
})();

// Log configuration (only in development)
if (CONFIG.isDevelopment) {
    console.log('🔧 Development Mode - API:', CONFIG.API);
} else {
    console.log('🚀 Production Mode - API:', CONFIG.API);
}

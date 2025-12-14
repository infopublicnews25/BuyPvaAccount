// Configuration for frontend API endpoints
// This file detects whether we're in development or production

const CONFIG = (() => {
    // Get the current location
    const protocol = window.location.protocol; // http: or https:
    const hostname = window.location.hostname;
    const port = window.location.port;

    // Determine if we're in development
    // Check for localhost, 127.0.0.1, or local network IPs
    const isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168') || hostname.startsWith('10.');

    let apiBase;

    if (isDevelopment) {
        // Development: Always use localhost:3000 (backend server)
        // This ensures all development frontends (on different ports) talk to the same backend
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
        isDevelopment: isDevelopment,
        HOSTNAME: hostname,
        PORT: port
    };
})();

// Log configuration (only in development)
if (CONFIG.isDevelopment) {
    console.log('🔧 Development Mode');
    console.log('   Frontend: ' + window.location.protocol + '//' + CONFIG.HOSTNAME + (CONFIG.PORT ? ':' + CONFIG.PORT : ''));
    console.log('   API Backend: ' + CONFIG.API);
} else {
    console.log('🚀 Production Mode - API:', CONFIG.API);
}

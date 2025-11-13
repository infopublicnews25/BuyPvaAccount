const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for verification codes
const verificationCodes = new Map();

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Password reset server is running' });
});

// Send verification code endpoint (stores code, simulates email)
app.post('/api/send-reset-code', async (req, res) => {
    const { email, code } = req.body;

    // Validation
    if (!email || !code) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and verification code are required' 
        });
    }

    // Store the code with expiration (10 minutes)
    const expirationTime = Date.now() + (10 * 60 * 1000);
    verificationCodes.set(email, {
        code: code,
        expires: expirationTime
    });

    // Log for testing purposes
    console.log(`\n📧 ========== PASSWORD RESET REQUEST ==========`);
    console.log(`To: ${email}`);
    console.log(`Verification Code: ${code}`);
    console.log(`Expires: ${new Date(expirationTime).toLocaleString()}`);
    console.log(`==============================================\n`);

    // In a real setup, you would send email here
    // For now, just return success
    res.json({ 
        success: true, 
        message: 'Verification code generated (check server console)' 
    });
});

// Get verification code endpoint (for testing - remove in production)
app.get('/api/get-code/:email', (req, res) => {
    const email = req.params.email;
    const stored = verificationCodes.get(email);
    
    if (!stored) {
        return res.json({ success: false, message: 'No code found' });
    }
    
    if (Date.now() > stored.expires) {
        verificationCodes.delete(email);
        return res.json({ success: false, message: 'Code expired' });
    }
    
    res.json({ success: true, code: stored.code });
});

// Clean up expired codes every minute
setInterval(() => {
    const now = Date.now();
    for (const [email, data] of verificationCodes.entries()) {
        if (now > data.expires) {
            verificationCodes.delete(email);
            console.log(`🗑️  Cleaned up expired code for: ${email}`);
        }
    }
}, 60000);

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
    console.log(`\n🚀 ========================================`);
    console.log(`   Password Reset Server (Simple Mode)`);
    console.log(`========================================`);
    console.log(`✅ Server running on: http://localhost:${PORT}`);
    console.log(`📝 Mode: Development (codes shown in console)`);
    console.log(`⚠️  For production: Configure real email service`);
    console.log(`========================================\n`);
});

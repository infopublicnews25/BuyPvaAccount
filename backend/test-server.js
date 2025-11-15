const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { verifyAdmin } = require('./admin-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

console.log('Server starting...');

// Admin login endpoint
app.post('/api/admin-login', async (req, res) => {
    console.log('Login request received');
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    try {
        console.log('Verifying admin...');
        const result = await verifyAdmin(username, password);
        console.log('Verification result:', result);
        if (result.success) {
            // For demo: simple session token (in production use JWT or session store)
            const token = await bcrypt.hash(Date.now().toString(), 5);
            res.json({
                success: true,
                token,
                user: result.user
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (e) {
        console.error('Error in login:', e);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
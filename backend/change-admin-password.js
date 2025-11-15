const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

// Change these values to your desired username and password
const NEW_USERNAME = 'admin';  // Change this to your new username
const NEW_PASSWORD = 'admin123'; // Change this to your new password

async function updateAdminCredentials() {
    try {
        // Generate new password hash
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(NEW_PASSWORD, saltRounds);

        // Update credentials file
        const credentialsFile = path.join(__dirname, 'admin-credentials.json');
        const credentials = {
            username: NEW_USERNAME,
            passwordHash: passwordHash
        };

        fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2));

        console.log('✅ Admin credentials updated successfully!');
        console.log(`📝 New Username: ${NEW_USERNAME}`);
        console.log(`🔒 New Password: ${NEW_PASSWORD}`);
        console.log(`🔐 Password Hash: ${passwordHash}`);
        console.log('\n⚠️  Remember to restart the server after changing credentials!');

    } catch (error) {
        console.error('❌ Error updating admin credentials:', error);
    }
}

updateAdminCredentials();
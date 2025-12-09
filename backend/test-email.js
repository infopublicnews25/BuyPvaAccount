const nodemailer = require('nodemailer');
require('dotenv').config({ path: './.env' });

// Test email configuration
async function testEmail() {
    try {
        const emailUser = process.env.EMAIL_USER;
        const emailPassword = process.env.EMAIL_PASSWORD;
        const emailProvider = process.env.EMAIL_PROVIDER || 'gmail';

        console.log('Testing email configuration...');
        console.log('Provider:', emailProvider);
        console.log('Email:', emailUser);
        console.log('Password length:', emailPassword ? emailPassword.length : 0);

        if (!emailUser || !emailPassword) {
            console.error('❌ Email credentials not found in .env');
            return;
        }

        const config = {
            auth: {
                user: emailUser,
                pass: emailPassword
            }
        };

        if (emailProvider === 'gmail') {
            config.service = 'gmail';
        }

        const transporter = nodemailer.createTransport(config);

        // Verify connection
        await transporter.verify();
        console.log('✅ Email transporter is ready');

        // Send test email
        const mailOptions = {
            from: { name: 'BuyPvaAccount Test', address: emailUser },
            to: emailUser, // Send to self for testing
            subject: 'Test Email - Ticket System',
            html: '<h2>Test Email</h2><p>This is a test email to verify the ticket notification system is working.</p>',
            text: 'Test Email - This is a test email to verify the ticket notification system is working.'
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Test email sent successfully!');
        console.log('Message ID:', result.messageId);

    } catch (error) {
        console.error('❌ Email test failed:', error.message);
        console.error('Full error:', error);
    }
}

testEmail();
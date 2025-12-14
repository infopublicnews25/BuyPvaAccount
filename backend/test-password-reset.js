const nodemailer = require('nodemailer');
require('dotenv').config();

const emailUser = process.env.EMAIL_USER;
const emailPassword = process.env.EMAIL_PASSWORD;
const emailProvider = process.env.EMAIL_PROVIDER || 'gmail';

console.log('🧪 Testing Password Reset Email Service...');
console.log('📧 Email:', emailUser);
console.log('🔒 Provider:', emailProvider);

const config = {
    service: 'gmail',
    auth: {
        user: emailUser,
        pass: emailPassword
    }
};

const transporter = nodemailer.createTransport(config);

const mailOptions = {
    from: {
        name: 'BuyPvaAccount',
        address: emailUser
    },
    to: 'createsads@gmail.com',
    subject: '🔐 Password Reset Verification Code - BuyPvaAccount Test',
    html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .code-box { background: white; border: 2px dashed #667eea; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
                .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
                .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🧪 Password Reset Test Email</h1>
                </div>
                <div class="content">
                    <p>Hello,</p>
                    <p>This is a TEST email to verify the password reset email service is working correctly.</p>
                    
                    <div class="code-box">
                        <div class="code">654321</div>
                        <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">Test verification code</p>
                    </div>

                    <div class="warning">
                        <strong>✅ Success:</strong> If you received this email, the password reset service is working!
                    </div>

                    <p>This is an automated test message.</p>
                    
                    <p>Best regards,<br><strong>BuyPvaAccount Team</strong></p>
                </div>
                <div class="footer">
                    <p>This is a test message from the backend.</p>
                </div>
            </div>
        </body>
        </html>
    `,
    text: 'Test verification code: 654321'
};

console.log('\n📤 Attempting to send test email...');

transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.error('❌ Error sending email:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    } else {
        console.log('✅ Test email sent successfully!');
        console.log('📨 Response:', info.response);
        console.log('\n✨ The password reset email service is working correctly!');
        console.log('📧 Check createsads@gmail.com for the test email.');
        process.exit(0);
    }
});

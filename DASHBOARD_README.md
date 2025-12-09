# 📁 Website Dashboard - File Manager

A WordPress-like dashboard for managing your BuyPvaAccount website files, similar to WordPress admin panel.

## 🚀 Features

### **Pages Management** (New!)
- **Sidebar Pages List**: Quick access to all website pages in the left sidebar
- **Pages Overview Grid**: Visual grid of all pages in the main content area
- **One-Click Editing**: Click any page to edit it directly in the dashboard

#### **Available Pages**:
- 🛡️ **Admin Panel** - `admin.html`
- 📝 **Blog Admin** - `blog-admin.html`
- 📰 **Blog Page** - `blog.html`
- 🛒 **Shopping Cart** - `cartpage.html`
- 💳 **Checkout** - `checkout.html`
- ➕ **Create Post** - `create-post.html`
- 🔑 **Password Reset** - `forgot-password.html`
- 🔐 **Login Page** - `login.html`
- 🏪 **Marketplace** - `marketplace.html`
- 🖼️ **Media Library** - `media-library.html`
- 🔔 **Notifications** - `notifications.html`
- 📋 **Order Management** - `ordermanagement.html`
- 👤 **User Profile** - `profile.html`
- 👥 **Sign Up** - `signup.html`
- 🎧 **Support** - `support.html`
- ⚙️ **User Management** - `user-management.html`

### **File Management**
- **File Browser**: Navigate through your website files and folders
- **File Editor**: Edit text files directly in the browser
- **File Management**: Create, delete, and organize files and folders
- **Dual View Modes**: List view and grid view for file browsing
- **Search Functionality**: Find files quickly
- **Admin Integration**: Integrated with your existing admin panel

## 📂 Folder Structure

The dashboard prioritizes important folders in this order:
1. **Backend** - Server files, API, and configuration
2. **Logs** - Server logs and error files
3. **Node Modules** - Dependencies (usually hidden)
4. **Uploads** - User uploaded files
5. **Other folders** - Alphabetically sorted

## 🔐 Access

### **Primary Access Method (Recommended)**
1. Open `admin.html` in your browser
2. Login with your admin credentials
3. **You will be automatically redirected to the dashboard**

### Alternative Access
- Direct URL: `http://localhost:3000/dashboard` (requires admin authentication)

### Quick Access Buttons
From the dashboard header, you can quickly access:
- **🛡️ Admin Panel** - Product, user, and order management
- **🛒 Order Management** - Handle customer orders
- **🔔 Notifications** - Customer support tickets
- **🚪 Logout** - Secure logout

## 📖 Usage Guide

### **Editing Website Pages**
1. **From Sidebar**: Click on any page name in the "Website Pages" section
2. **From Main Grid**: Click on any page card in the "Website Pages" overview
3. **Direct Edit**: The page content opens immediately in the editor
4. **Save Changes**: Click "Save" to apply changes to your live website

### Navigating Files
- **Sidebar**: Click on folder names to navigate
- **Main Area**: Click on folders to enter them, click on files to select them
- **Breadcrumb**: Shows current path at the top

### Editing Files
1. Click on any text file (`.html`, `.css`, `.js`, `.json`, `.txt`, etc.)
2. The file content will open in the editor
3. Make your changes
4. Click **"Save"** to save changes
5. Click **"Close"** to exit editor

### Creating Files/Folders
- Click **"➕ New File"** to create a new file
- Click **"📁 New Folder"** to create a new folder
- Enter the name and click **"Create"**

### Deleting Items
- Click the **trash icon** next to any file or folder
- Confirm the deletion (cannot be undone)

### View Modes
- **List View**: Detailed list with file information
- **Grid View**: Visual grid layout

### Search
- Use the search box in the header to find files
- Search works across filenames in the current directory

## 🔒 Security Features

- **Admin Authentication**: Requires admin login to access
- **Path Restrictions**: Cannot access files outside the project directory
- **File Type Validation**: Only allows editing of safe text files
- **Input Sanitization**: All inputs are validated and sanitized

## ⚠️ Important Notes

- **Backup First**: Always backup important files before editing
- **Text Files Only**: Can only edit text-based files (HTML, CSS, JS, JSON, etc.)
- **No Binary Files**: Cannot edit images, PDFs, or other binary files
- **Live Changes**: Changes are applied immediately to your website
- **Version Control**: Consider using Git for version control of important changes

## 🛠️ Technical Details

### API Endpoints
- `GET /api/dashboard/files/tree` - Get folder structure
- `GET /api/dashboard/files/list` - List files in directory
- `GET /api/dashboard/files/read` - Read file content
- `POST /api/dashboard/files/save` - Save file content
- `POST /api/dashboard/files/create` - Create file/folder
- `DELETE /api/dashboard/files/delete` - Delete file/folder

### Supported File Types for Editing
- `.html`, `.htm`
- `.css`
- `.js`, `.mjs`
- `.json`
- `.txt`, `.md`
- `.xml`, `.yml`, `.yaml`
- `.ini`, `.conf`, `.log`

### File Size Limits
- Maximum file size for editing: 10MB
- Upload size limits follow server configuration

## 🆘 Troubleshooting

### Cannot Access Dashboard
- Ensure you're logged in as admin
- Check browser console for errors
- Verify server is running

### Cannot Edit File
- Check if file is a supported text type
- Verify file permissions
- Check file size (must be under 10MB)

### Changes Not Saved
- Check network connection
- Verify you have write permissions
- Check server logs for errors

### File Not Found
- Refresh the file list
- Check if file was moved or deleted
- Verify correct path

## 📞 Support

If you encounter issues:
1. Check browser developer console (F12)
2. Check server logs in the `logs/` directory
3. Verify file permissions
4. Test with a simple text file first

## 🔄 Updates

The dashboard is integrated with your existing admin system and will receive updates along with other admin features.
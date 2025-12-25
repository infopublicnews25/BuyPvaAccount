# Excel Template for Bulk Product Upload

This Excel template allows you to bulk upload products to your BuyPvaAccount marketplace using Microsoft Excel or Google Sheets.

## 📋 Template Overview

The template includes **10 sample products** across different categories:
- **Gmail accounts** (aged and premium)
- **Email services** (Outlook, Yahoo)
- **Social media** (LinkedIn, Instagram, Twitter)
- **Gaming** (Discord Nitro)
- **Music** (Spotify Premium)

## 📊 Excel Columns Structure

### Required Columns (Must Fill):
- **A: title** - Main product title (what customers see)
- **B: category** - Product category (GMAIL, EMAIL, SOCIAL, etc.)
- **C: price** - Product price (use dot for decimals: 1.50)
- **D: quantity** - Available stock quantity
- **F: image** - Product image URL

### Optional Columns:
- **E: offerPrice** - Discounted price (leave empty for no discount)

### Multi-language Support:
- **G: title_en** - English title
- **H: note_en** - English description
- **I: title_ru** - Russian title
- **J: note_ru** - Russian description
- **K: title_zh** - Chinese title
- **L: note_zh** - Chinese description
- **M: title_ar** - Arabic title
- **N: note_ar** - Arabic description
- **O: note** - Default description (fallback)
- **P: id** - Product ID (leave empty for auto-generation)

## 🚀 How to Use

### Step 1: Download and Open
1. Download `bulk_products_excel_template.csv`
2. Open in Microsoft Excel or Google Sheets
3. The file will automatically format as a spreadsheet

### Step 2: Fill Your Data
1. **Keep the first row** (headers) unchanged
2. **Fill columns A-F** (required fields) for each product
3. **Optionally fill** multi-language columns if needed
4. **Use proper formatting**:
   - Prices: `1.50` not `1,50`
   - URLs: Full URLs starting with `https://`
   - Text: Use quotes for text with commas

### Step 3: Export to CSV
**In Excel:**
1. File → Save As
2. Choose "CSV UTF-8 (Comma delimited) (*.csv)"
3. Save the file

**In Google Sheets:**
1. File → Download → Comma-separated values (.csv)

### Step 4: Upload to Dashboard
1. Go to your admin dashboard
2. Click **"Bulk Add Products"** card
3. Select **"CSV"** format from dropdown
4. Copy and paste the CSV content into the textarea
5. Click **"Validate"** to check for errors
6. Click **"Import"** to upload products

## 📝 Sample Data Explained

### Gmail Products:
- **1 Year Aged**: High-quality aged accounts
- **2 Years Aged**: Premium aged accounts with better trust

### Email Services:
- **Outlook Premium**: Microsoft verified accounts
- **Yahoo Basic**: Standard Yahoo email accounts

### Social Media:
- **LinkedIn Business**: Professional networking profiles
- **Instagram Business**: Commercial Instagram accounts
- **Twitter Verified**: Accounts with blue checkmark

### Gaming & Entertainment:
- **Discord Nitro**: Premium Discord subscriptions
- **Spotify Premium**: Ad-free music streaming

## 🔧 Advanced Features

### Multi-language Support
Fill the language-specific columns to provide localized content:
- `title_en/note_en` - English
- `title_ru/note_ru` - Russian
- `title_zh/note_zh` - Chinese
- `title_ar/note_ar` - Arabic

### Image URLs
- Use high-quality product images
- Recommended size: 400x400px or larger
- Host images on your server or reliable CDN
- Example: `https://yourdomain.com/uploads/product-image.jpg`

### Categories
Use consistent category names:
- `GMAIL` - Gmail accounts
- `EMAIL` - Other email services
- `SOCIAL` - Social media accounts
- `GAMING` - Gaming accounts
- `MUSIC` - Music streaming
- `LINKEDIN` - LinkedIn profiles

### Pricing Strategy
- Set competitive prices based on account quality
- Use `offerPrice` for limited-time discounts
- Consider bulk discounts for large quantities

## ⚠️ Important Notes

### Data Validation:
- **Required fields** cannot be empty
- **Prices** must be positive numbers
- **Quantities** must be whole numbers
- **Image URLs** must be valid and accessible
- **Product IDs** must be unique (leave empty for auto-generation)

### Text Formatting:
- Use `\n` for line breaks in descriptions
- Escape quotes with double quotes: `"Product ""Name"""` for `Product "Name"`
- Keep descriptions concise but informative

### File Encoding:
- Always save as **UTF-8 CSV** to preserve special characters
- Test with non-English text before bulk upload

## 📊 Bulk Upload Process

1. **Prepare** your Excel file with product data
2. **Export** to CSV format
3. **Validate** CSV content in dashboard
4. **Import** products to your store
5. **Verify** products appear in marketplace

## 🆘 Troubleshooting

### CSV Import Fails:
- Check required fields are filled
- Verify CSV format (comma-separated)
- Ensure UTF-8 encoding
- Check for special characters in text

### Products Not Showing:
- Verify category exists in system
- Check image URLs are accessible
- Ensure prices are valid numbers
- Confirm quantities are positive

### Multi-language Issues:
- Check UTF-8 encoding
- Verify language columns are properly filled
- Test with sample data first

## 📞 Support

For bulk upload issues:
1. Test with the provided sample data first
2. Check dashboard error messages
3. Verify CSV format matches template
4. Contact development team for complex issues

## 🔄 Updating Existing Products

This template is primarily for **adding new products**. For updating existing products:
- Use the product management interface
- Or export existing products, modify, and re-import
- Note: Re-importing will create duplicates unless IDs match

---

**Template Version**: 1.0
**Last Updated**: December 25, 2025
**Compatible With**: BuyPvaAccount Dashboard v2.0+</content>
<parameter name="filePath">C:\Users\Khan Saheb On\Project Work\BuyPvaAccount\EXCEL_BULK_UPLOAD_GUIDE.md
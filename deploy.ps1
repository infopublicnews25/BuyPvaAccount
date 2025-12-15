# BuyPvaAccount - Live Deployment Script (PowerShell)
# Run this on Windows server to update the website

Write-Host "🚀 Starting BuyPvaAccount Live Deployment..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Project path
$PROJECT_PATH = "C:\inetpub\wwwroot\buypvaaccount"  # Change if needed

Write-Host "Step 1: Checking current directory..." -ForegroundColor Yellow
if (-not (Test-Path $PROJECT_PATH)) {
    Write-Host "❌ Project path not found: $PROJECT_PATH" -ForegroundColor Red
    Write-Host "Please update PROJECT_PATH variable" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Project path found" -ForegroundColor Green

Write-Host "Step 2: Pulling latest changes from GitHub..." -ForegroundColor Yellow
Push-Location $PROJECT_PATH
git pull origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Latest code pulled successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to pull from GitHub" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "Step 3: Installing/Updating dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "Step 4: Restarting backend with PM2..." -ForegroundColor Yellow
pm2 restart buypvaaccount
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backend restarted" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to restart backend" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "Step 5: Checking service status..." -ForegroundColor Yellow
pm2 status buypvaaccount

Write-Host "Step 6: Clearing old logs..." -ForegroundColor Yellow
pm2 flush

Write-Host "Step 7: Verifying deployment..." -ForegroundColor Yellow
Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green

Pop-Location

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "✅ Live website has been updated!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Deployment Summary:" -ForegroundColor Cyan
Write-Host "  📂 Project: $PROJECT_PATH"
Write-Host "  🌐 Website: https://buypvaaccount.com"
Write-Host "  ⚙️  Backend: Running on PM2"
Write-Host "  📦 Dependencies: Updated"
Write-Host ""
Write-Host "🔍 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Clear browser cache: Ctrl+Shift+Delete"
Write-Host "  2. Visit: https://buypvaaccount.com"
Write-Host "  3. Test notification system"
Write-Host "  4. Check: pm2 logs buypvaaccount (for errors)"
Write-Host ""
Write-Host "📞 Support:" -ForegroundColor Yellow
Write-Host "  Check backend logs: pm2 logs buypvaaccount"
Write-Host "  Stop backend: pm2 stop buypvaaccount"
Write-Host "  View all PM2 apps: pm2 status"
Write-Host ""

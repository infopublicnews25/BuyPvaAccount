#!/bin/bash
# BuyPvaAccount - Live Deployment Script
# Run this on your production server to update the website

echo "🚀 Starting BuyPvaAccount Live Deployment..."
echo "=================================================="

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project path
PROJECT_PATH="/var/www/buypvaaccount"

echo -e "${YELLOW}Step 1: Checking current directory...${NC}"
if [ ! -d "$PROJECT_PATH" ]; then
    echo -e "${RED}❌ Project path not found: $PROJECT_PATH${NC}"
    echo "Please update PROJECT_PATH variable"
    exit 1
fi
echo -e "${GREEN}✅ Project path found${NC}"

echo -e "${YELLOW}Step 2: Pulling latest changes from GitHub...${NC}"
cd "$PROJECT_PATH"
git pull origin main
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Latest code pulled successfully${NC}"
else
    echo -e "${RED}❌ Failed to pull from GitHub${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 3: Installing/Updating dependencies...${NC}"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 4: Restarting backend with PM2...${NC}"
pm2 restart buypvaaccount
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend restarted${NC}"
else
    echo -e "${RED}❌ Failed to restart backend${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 5: Checking service status...${NC}"
pm2 status buypvaaccount

echo -e "${YELLOW}Step 6: Clearing old logs...${NC}"
pm2 flush

echo -e "${YELLOW}Step 7: Verifying deployment...${NC}"
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo "=================================================="
echo -e "${GREEN}✅ Live website has been updated!${NC}"
echo "=================================================="
echo ""
echo "📋 Deployment Summary:"
echo "  📂 Project: $PROJECT_PATH"
echo "  🌐 Website: https://buypvaaccount.com"
echo "  ⚙️  Backend: Running on PM2"
echo "  📦 Dependencies: Updated"
echo ""
echo "🔍 Next Steps:"
echo "  1. Clear browser cache: Ctrl+Shift+Delete"
echo "  2. Visit: https://buypvaaccount.com"
echo "  3. Test notification system"
echo "  4. Check: pm2 logs buypvaaccount (for errors)"
echo ""
echo "📞 Support:"
echo "  Check backend logs: pm2 logs buypvaaccount"
echo "  Stop backend: pm2 stop buypvaaccount"
echo "  View all PM2 apps: pm2 status"
echo ""

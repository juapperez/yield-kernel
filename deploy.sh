#!/bin/bash

echo " Deploying DeFi Portfolio Manager Agent"
echo "=========================================="
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo " Firebase CLI not installed"
    echo "Install with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo " Please login to Firebase..."
    firebase login
fi

echo " Building project..."
echo ""

# Create public directory if it doesn't exist
mkdir -p public

# Copy README to public for documentation
if [ -f "README.md" ]; then
    echo " Copying documentation..."
fi

echo ""
echo " Choose your deployment strategy:"
echo " 1) Standard (Firebase Hosting + Functions) - Requires Blaze Plan"
echo " 2) Free Tier (Firebase Hosting + Render Backend) - No Credit Card Needed"
echo ""
read -p "Enter choice (1 or 2): " DEPLOY_CHOICE

if [ "$DEPLOY_CHOICE" == "1" ]; then
    echo " Deploying to Firebase (Hosting + Functions)..."
    firebase deploy
else
    echo " Deploying Frontend to Firebase Hosting..."
    firebase deploy --only hosting
    echo ""
    echo " IMPORTANT: Manual Backend Setup Required"
    echo "=========================================="
    echo "Since you chose the Free Tier, you must deploy the backend to Render:"
    echo "1. Create a new Web Service on Render.com"
    echo "2. Connect your GitHub repository: https://github.com/juapperez/yield-kernel.git"
    echo "3. Render will automatically detect render.yaml and set up the service."
    echo "4. Add your GROQ_API_KEY and WALLET_MNEMONIC in the Render Dashboard."
fi

echo ""
echo " Deployment complete!"
echo ""
echo "Your project is now live at:"
firebase hosting:channel:list | grep "live" || echo "Check Firebase console for URL"
echo ""

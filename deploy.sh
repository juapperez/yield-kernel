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
echo " Deploying to Firebase..."
firebase deploy --only hosting

echo ""
echo " Deployment complete!"
echo ""
echo "Your project is now live at:"
firebase hosting:channel:list | grep "live" || echo "Check Firebase console for URL"
echo ""

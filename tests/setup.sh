#!/bin/bash

echo "Setting up Forum E2E Tests..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Install npm dependencies
echo "Installing npm dependencies..."
npm install

# Install Playwright browsers
echo "Installing Playwright browsers..."
npx playwright install

# Make sure test images exist
echo "Checking test images..."
if [ ! -f "tests/test-image-1.jpg" ]; then
    echo "Creating test-image-1.jpg..."
    convert -size 300x200 xc:blue -pointsize 24 -fill white -gravity center -annotate +0+0 "E2E Test Image 1" tests/test-image-1.jpg
fi

if [ ! -f "tests/test-image-2.jpg" ]; then
    echo "Creating test-image-2.jpg..."
    convert -size 300x200 xc:green -pointsize 24 -fill white -gravity center -annotate +0+0 "E2E Test Image 2" tests/test-image-2.jpg
fi

if [ ! -f "tests/test-comment-image.jpg" ]; then
    echo "Creating test-comment-image.jpg..."
    convert -size 300x200 xc:orange -pointsize 24 -fill white -gravity center -annotate +0+0 "E2E Comment Image" tests/test-comment-image.jpg
fi

echo "Setup complete! You can now run tests with: npm test"

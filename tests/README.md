# Forum E2E Tests

This directory contains end-to-end tests for the forum functionality using Playwright.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install
   ```

## Running Tests

Run all tests:
```bash
npm test
```

Run specific test:
```bash
npx playwright test tests/e2e-forum.spec.js
```

## Test Coverage

The e2e-forum.spec.js test covers:
- Creating a new post with images
- Adding comments with images
- Editing posts (title, description, images)
- Deleting posts
- Git integration verification

## Requirements

- Jekyll server running on port 4000
- Git repository access
- Test images in tests/ directory

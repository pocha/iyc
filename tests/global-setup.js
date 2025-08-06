// global-setup.js
const { chromium } = require('@playwright/test');

async function globalSetup(config) {
  // This setup runs once before all tests
  // We can use this to configure browser behavior
  
  // Set environment variable to control browser closing behavior
  if (process.env.HEADED === 'true' || process.env.DEBUG === 'true') {
    process.env.PWDEBUG = '1'; // This keeps browser open on failure
  }
  
  return async () => {
    // Global teardown - runs after all tests
    console.log('Tests completed');
  };
}

module.exports = globalSetup;

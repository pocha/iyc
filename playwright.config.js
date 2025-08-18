// @ts-check
const { defineConfig, devices } = require("@playwright/test")

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  timeout: 120000, // Set global test timeout to 5 seconds
  use: {
    baseURL: "http://localhost:4001/iyc/",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 5000, // Set action timeout to 5 seconds
    navigationTimeout: 5000, // Set navigation timeout to 5 seconds
    // Keep browser open on failure when running in headed mode
    launchOptions: {
      slowMo: process.env.HEADED ? 500 : 0, // Slow down actions in headed mode
    },
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Keep browser open on failure in headed mode
        contextOptions: {
          // This will keep the browser context alive
        },
      },
    },
  ],

  // Global setup to handle browser persistence on failure
  globalSetup: require.resolve("./tests/global-setup.js"),

  // Remove webServer config since Jekyll is already running on port 4001
  webServer: {
    command: "jekyll serve --port 4001 --host 0.0.0.0 --watch",
    url: "http://localhost:4001/iyc/",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})

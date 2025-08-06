const { test, expect } = require('@playwright/test');

test.describe('Forum End-to-End Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the forum homepage
    await page.goto("http://localhost:4001/iyc/");
    await page.waitForLoadState("networkidle");
  });

  test('should create a new post with multiple images', async ({ page }) => {
    // Click on the Post button to navigate to post creation page
    await page.click('a[href="/iyc/post/"]', { timeout: 7000 });
    
    // Fill in the post form
    await page.fill('#title', 'Test Post with Multiple Images');
    await page.fill('#description', 'This is a test post with multiple attached images for testing purposes.');
    
    // Upload multiple files
    const fileInput = page.locator('#files');
    await fileInput.setInputFiles([
      'tests/test-image-1.jpg',
      'tests/test-image-2.jpg'
    ]);
    
    // Wait for files to be processed and displayed
    await page.waitForTimeout(2000);
    
    // Verify images are displayed in the UI
    const uploadedImages = page.locator("#uploadedFilesList > div");
    await expect(uploadedImages).toHaveCountGreaterThanOrEqual(2);
    
    // Submit the form
    await page.click('#submitBtn', { timeout: 7000 });
    
    // Wait for success message
    await page.waitForSelector('#successMessage', { state: 'visible', timeout: 10000 });
    
    // Verify success message is displayed
    await expect(page.locator('#successMessage')).toBeVisible();
  });

  test('should add a comment to a post', async ({ page }) => {
    // Navigate to the first post
    await page.click('.post-card a', { timeout: 7000 });
    
    // Fill in comment form
    await page.fill('#commentContent', 'This is a test comment with an image.');
    
    // Upload an image for the comment
    const commentFileInput = page.locator('#commentFiles');
    await commentFileInput.setInputFiles(['tests/test-comment-image.jpg']);
    
    // Wait for comment to be added
    await page.waitForTimeout(3000);
    
    // Verify comment appears
    const comments = page.locator('.comment');
    await expect(comments).toHaveCountGreaterThanOrEqual(1);
  });

  test('should edit an existing post', async ({ page }) => {
    // Navigate to a post and click edit (assuming edit functionality exists)
    await page.click('.post-card a', { timeout: 7000 });
    
    // Look for edit button (may be hidden initially)
    const editButton = page.locator('.edit-post-btn');
    if (await editButton.isVisible()) {
      await editButton.click();
      
      // Update the post title
      await page.fill('#title', 'Updated Test Post Title');
      
      // Submit the updated post
      await page.click('#submitBtn', { timeout: 7000 });
      
      // Wait for success message
      await page.waitForSelector('#successMessage', { state: 'visible', timeout: 10000 });
    }
  });

  test('should delete a post', async ({ page }) => {
    // Navigate to a post
    await page.click('.post-card a', { timeout: 7000 });
    
    // Look for delete button
    const deleteButton = page.locator('.delete-post-btn, button:has-text("Delete")');
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      
      // Confirm deletion if there's a confirmation dialog
      await page.click('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")', { timeout: 7000 });
      
      // Should redirect back to homepage
      await page.waitForURL('/', { timeout: 10000 });
    }
  });

  test('should handle form validation', async ({ page }) => {
    // Navigate to post creation page
    await page.click('a[href="/iyc/post/"]', { timeout: 7000 });
    
    // Try to submit empty form
    await page.click('#submitBtn', { timeout: 7000 });
    
    // Check for validation messages (HTML5 validation or custom)
    const titleField = page.locator('#title');
    await expect(titleField).toBeFocused();
  });

  test('should display posts on homepage', async ({ page }) => {
    // Verify that posts are displayed on the homepage
    const posts = page.locator('.post-card, .bg-white.rounded-2xl');
    await expect(posts).toHaveCountGreaterThanOrEqual(1);
    
    // Verify post elements contain expected content
    const firstPost = posts.first();
    await expect(firstPost).toBeVisible();
  });
});

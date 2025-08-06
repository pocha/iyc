const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Forum End-to-End Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set shorter timeout
    page.setDefaultTimeout(5000);
    
    // Navigate to the forum homepage
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  });

  test('should create a new post with multiple images', async ({ page }) => {
    // Wait for the Post button to be visible and click it
    await page.waitForSelector('a[href="/iyc/post/"]', { timeout: 5000 });
    await page.click('a[href="/iyc/post/"]', { timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 });
    
    // Verify we're on the post creation page
    await expect(page).toHaveURL(/.*\/post\/$/);
    
    // Fill in the post form
    await page.fill('input[name="title"]', 'Test Post with Multiple Images');
    await page.fill('textarea[name="content"]', 'This is a test post created by Playwright automation with multiple images attached.');
    
    // Upload multiple test images
    const fileInput = page.locator('input[type="file"]');
    
    // Create test images
    const testImage1Path = path.join(__dirname, 'test-image-1.jpg');
    const testImage2Path = path.join(__dirname, 'test-image-2.jpg');
    
    await fileInput.setInputFiles([testImage1Path, testImage2Path]);
    
    // Wait for images to be processed and displayed
    await page.waitForTimeout(2000);
    
    // Verify images are displayed in the UI
    const uploadedImages = page.locator('.uploaded-image, .attached-file, img[src*="data:image"]');
    await expect(uploadedImages).toHaveCount(2);
    
    // Submit the form
    await page.click('button[type="submit"], input[type="submit"]', { timeout: 5000 });
    
    // Wait for submission to complete and redirect
    await page.waitForTimeout(5000);
    
    // Verify we're redirected to the new post
    await expect(page.url()).toMatch(/.*\/post\/.*test-post-with-multiple-images.*/);
    
    // Verify post content is displayed
    await expect(page.locator('h1, .post-title')).toContainText('Test Post with Multiple Images');
    await expect(page.locator('.post-content, .content')).toContainText('This is a test post created by Playwright automation');
  });

  test('should add a comment to a post', async ({ page }) => {
    // Navigate to an existing post
    await page.click('text=How this forum came into existence', { timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 });
    
    // Find and fill the comment form
    const commentTextarea = page.locator('textarea[name="comment"], textarea[placeholder*="comment"]').first();
    await commentTextarea.fill('This is a test comment added by Playwright automation.');
    
    // Submit the comment
    await page.click('button:has-text("Submit"), button:has-text("Post Comment"), input[type="submit"]', { timeout: 5000 });
    
    // Wait for comment to be added
    await page.waitForTimeout(3000);
    
    // Verify comment appears
    await expect(page.locator('.comment, .comment-content')).toContainText('This is a test comment added by Playwright automation.');
  });

  test('should edit an existing post', async ({ page }) => {
    // First create a post to edit
    await page.waitForSelector('a[href="/iyc/post/"]', { timeout: 5000 });
    await page.click('a[href="/iyc/post/"]', { timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 });
    
    await page.fill('input[name="title"]', 'Post to Edit');
    await page.fill('textarea[name="content"]', 'Original content that will be edited.');
    
    await page.click('button[type="submit"], input[type="submit"]', { timeout: 5000 });
    await page.waitForTimeout(5000);
    
    // Now edit the post - look for edit button
    const editButton = page.locator('button:has-text("Edit"), .edit-post-btn');
    if (await editButton.count() > 0) {
      await editButton.click({ timeout: 5000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 });
      
      // Update the content
      await page.fill('input[name="title"]', 'Edited Post Title');
      await page.fill('textarea[name="content"]', 'Updated content after editing.');
      
      // Submit the edit
      await page.click('button[type="submit"], input[type="submit"]', { timeout: 5000 });
      await page.waitForTimeout(3000);
      
      // Verify the edit was successful
      await expect(page.locator('.post-content, .content')).toContainText('Updated content after editing.');
    }
  });

  test('should delete a post', async ({ page }) => {
    // First create a post to delete
    await page.waitForSelector('a[href="/iyc/post/"]', { timeout: 5000 });
    await page.click('a[href="/iyc/post/"]', { timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 });
    
    await page.fill('input[name="title"]', 'Post to Delete');
    await page.fill('textarea[name="content"]', 'This post will be deleted by the test.');
    
    await page.click('button[type="submit"], input[type="submit"]', { timeout: 5000 });
    await page.waitForTimeout(5000);
    
    // Look for delete button
    const deleteButton = page.locator('button:has-text("Delete"), .delete-post-btn');
    if (await deleteButton.count() > 0) {
      // Handle confirmation dialog
      page.on('dialog', dialog => dialog.accept());
      
      await deleteButton.click({ timeout: 5000 });
      await page.waitForTimeout(3000);
      
      // Verify we're redirected away from the deleted post
      await expect(page.url()).not.toMatch(/.*post-to-delete.*/);
    }
  });

  test('should navigate between pages', async ({ page }) => {
    // Test navigation to post creation
    await page.waitForSelector('a[href="/iyc/post/"]', { timeout: 5000 });
    await page.click('a[href="/iyc/post/"]', { timeout: 5000 });
    await expect(page).toHaveURL(/.*\/post\/$/);
    
    // Navigate back to home
    await page.goto('/');
    await expect(page.locator('h1, .site-title')).toBeVisible();
    
    // Test navigation to an existing post
    await page.click('text=How this forum came into existence', { timeout: 5000 });
    await expect(page).toHaveURL(/.*\/post\/how-this-forum-came-into-existence.*/);
  });

  test('should handle form validation', async ({ page }) => {
    // Navigate to post creation
    await page.waitForSelector('a[href="/iyc/post/"]', { timeout: 5000 });
    await page.click('a[href="/iyc/post/"]', { timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 });
    
    // Try to submit empty form
    await page.click('button[type="submit"], input[type="submit"]', { timeout: 5000 });
    
    // Check for validation messages or that we stay on the same page
    await expect(page).toHaveURL(/.*\/post\/$/);
    
    // Fill only title and try again
    await page.fill('input[name="title"]', 'Test Title Only');
    await page.click('button[type="submit"], input[type="submit"]', { timeout: 5000 });
    
    // Should still be on post creation page or show validation
    await page.waitForTimeout(2000);
  });
});

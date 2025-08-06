const { test, expect } = require("@playwright/test")
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")
const branch = "test"

test.describe("Forum End-to-End Tests", () => {
  let testPostSlug
  let testPostTitle
  let testPostDescription

  //   test.beforeAll(async () => {
  //     // Ensure we're on master branch and have latest code
  //     execSync('git checkout master && git pull origin master', {
  //       cwd: '/home/nonbios/forum-theme',
  //       stdio: 'inherit'
  //     });
  //   });

  test("Complete forum workflow: create post, comment, edit, delete", async ({ page }) => {
    // Generate unique test data
    const timestamp = Date.now()
    testPostTitle = `E2E Test Post ${timestamp}`
    testPostDescription = `This is an end-to-end test post created at ${new Date().toISOString()}`
    testPostSlug = `2025-01-01-e2e-test-post-${timestamp}`.toLowerCase().replace(/[^a-z0-9-]/g, "-")

    // Create test images
    const testImage1Path = `./test-image-1.png`
    const testImage2Path = `./test-image-2.png`

    console.log("=== PHASE 1: CREATE POST ===")

    // Navigate to the forum
    await page.goto("/")
    await expect(page).toHaveTitle(/Whats up Isha/)

    // Click create post button
    await page.click("text=Create New Post")
    await page.waitForSelector("#postTitle")

    // Fill the form
    await page.fill("#postTitle", testPostTitle)
    await page.fill("#postDescription", testPostDescription)

    // Upload first image
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(testImage1Path)

    // Wait for image preview to appear
    await page.waitForSelector(".file-preview", { timeout: 5000 })

    // Verify image preview is visible
    const imagePreview = page.locator(".file-preview img")
    await expect(imagePreview).toBeVisible()

    // Submit the form
    await page.click('button[type="submit"]')

    // Wait for success message
    await page.waitForSelector(".success-message, .alert-success", { timeout: 30000 })

    // Do git pull to get the new post
    execSync(`git pull origin ${branch}`, {
      cwd: "/home/nonbios/forum-theme",
      stdio: "inherit",
    })

    // Wait a moment for Jekyll to rebuild
    await page.waitForTimeout(3000)

    // Navigate back to home and verify post exists
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Check if post appears on homepage
    await expect(page.locator(`text=${testPostTitle}`)).toBeVisible()

    // Click on the post to view it
    await page.click(`text=${testPostTitle}`)
    await page.waitForLoadState("networkidle")

    // Verify post content
    await expect(page.locator("h1")).toContainText(testPostTitle)
    await expect(page.locator("text=" + testPostDescription)).toBeVisible()

    // Verify image is displayed
    const postImage = page.locator(".post-content img, .post-images img")
    await expect(postImage.first()).toBeVisible()

    console.log("=== PHASE 2: ADD COMMENT ===")

    // Add a comment with image
    const commentText = `Test comment with image - ${timestamp}`
    await page.fill("#commentContent", commentText)

    // Upload image for comment
    const commentFileInput = page.locator('#commentForm input[type="file"]')
    await commentFileInput.setInputFiles(testImage2Path)

    // Submit comment
    await page.click('#commentForm button[type="submit"]')

    // Wait for success message
    await page.waitForSelector(".success-message, .alert-success", { timeout: 30000 })

    // Do git pull to get the new comment
    execSync(`git pull origin ${branch}`, {
      cwd: "/home/nonbios/forum-theme",
      stdio: "inherit",
    })

    // Wait for Jekyll to rebuild
    await page.waitForTimeout(3000)
    await page.reload()
    await page.waitForLoadState("networkidle")

    // Verify comment appears
    await expect(page.locator(`text=${commentText}`)).toBeVisible()

    // Verify comment image appears
    const commentImage = page.locator(".comment img, .comment-content img")
    await expect(commentImage.first()).toBeVisible()

    console.log("=== PHASE 3: EDIT POST ===")

    // Click edit button
    await page.click('text=Edit Post, .edit-btn, button:has-text("Edit")')
    await page.waitForSelector("#postTitle")

    // Update post content
    const updatedTitle = `${testPostTitle} - EDITED`
    const updatedDescription = `${testPostDescription} - This post has been edited during E2E testing.`

    await page.fill("#postTitle", updatedTitle)
    await page.fill("#postDescription", updatedDescription)

    // Remove existing image and add new one
    const removeButtons = page.locator('.remove-file, .delete-file, button:has-text("Remove")')
    if ((await removeButtons.count()) > 0) {
      await removeButtons.first().click()
    }

    // Add new image
    const editFileInput = page.locator('input[type="file"]')
    await editFileInput.setInputFiles(testImage2Path)

    // Wait for new image preview
    await page.waitForSelector(".file-preview", { timeout: 5000 })

    // Submit edit
    await page.click('button[type="submit"]')

    // Wait for success message
    await page.waitForSelector(".success-message, .alert-success", { timeout: 30000 })

    // Do git pull to get updated post
    execSync(`git pull origin ${branch}`, {
      cwd: "/home/nonbios/forum-theme",
      stdio: "inherit",
    })

    // Wait for Jekyll to rebuild
    await page.waitForTimeout(3000)

    // Navigate to post and verify changes
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.click(`text=${updatedTitle}`)
    await page.waitForLoadState("networkidle")

    // Verify updated content
    await expect(page.locator("h1")).toContainText("EDITED")
    await expect(page.locator("text=" + updatedDescription)).toBeVisible()

    console.log("=== PHASE 4: DELETE POST ===")

    // Click delete button
    await page.click('text=Delete Post, .delete-btn, button:has-text("Delete")')

    // Confirm deletion if there's a confirmation dialog
    page.on("dialog", (dialog) => dialog.accept())

    // Wait for success message or redirect
    await page.waitForSelector(".success-message, .alert-success", { timeout: 30000 })

    // Do git pull to get deletion
    execSync(`git pull origin ${branch}`, {
      cwd: "/home/nonbios/forum-theme",
      stdio: "inherit",
    })

    // Wait for Jekyll to rebuild
    await page.waitForTimeout(3000)

    // Navigate to home and verify post is gone
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Verify post no longer appears
    await expect(page.locator(`text=${updatedTitle}`)).not.toBeVisible()

    console.log("=== E2E TEST COMPLETED SUCCESSFULLY ===")
  })
})

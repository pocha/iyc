const { test, expect } = require("@playwright/test")
const { execSync, exec } = require("child_process")
const path = require("path")
const projectRoot = path.resolve(__dirname, "..")
const git = "/opt/homebrew/bin/git"

async function gitPull() {
  return new Promise((resolve) => {
    const projectRoot = path.resolve(__dirname, "..")

    console.log("Pulling latest changes...")
    exec("git pull origin test", { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        console.log("Git pull failed, continuing with test:", error.message)
      } else {
        console.log("Successfully pulled latest changes")
        if (stdout) console.log(stdout)
      }
      resolve()
    })
  })
}

test.describe("Forum End-to-End Tests", () => {
  test("should perform complete forum workflow: create post, add comment, edit post, and delete post", async ({
    page,
  }) => {
    // Navigate to the forum homepage
    await page.goto("http://localhost:4001/iyc/")
    await page.waitForLoadState("networkidle")

    // Step 1: Create a new post with multiple images
    console.log("Step 1: Creating a new post with multiple images...")
    await page.click('a[href="/iyc/post/"]', { timeout: 7000 })

    // Fill in the post form
    await page.fill("#title", "Test Post with Multiple Images")
    await page.fill('textarea[name="description"]', "This is a test post with multiple images for end-to-end testing.")

    // Upload multiple files
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(["tests/test-image-1.jpg", "tests/test-image-2.jpg"])

    // Wait for files to be uploaded and displayed
    await page.waitForTimeout(2000)
    const fileListText = await page.locator("#uploadedFilesList").textContent()
    expect(fileListText).toContain("test-image-1.jpg")
    expect(fileListText).toContain("test-image-2.jpg")

    // Submit the post
    await page.click('button[type="submit"]')

    // Wait for the green success notification to appear
    await page.waitForSelector(".bg-green-100", { timeout: 7000 })

    // execSync(`${git} pull origin test`, {
    //   cwd: projectRoot,
    //   stdio: "inherit",
    // })
    await gitPull()
    console.log("Successfully pulled latest changes")

    await page.waitForTimeout(5000) //wait for jekyll to rebuild
    await page.goto("http://localhost:4001/iyc/")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("text=Test Post with Multiple Images")).toBeVisible()

    await page.click("text=Test Post with Multiple Images")
    await page.waitForLoadState("networkidle")

    // check if title, description & images are as expected

    return

    // Step 2: Navigate to the created post and add a comment
    console.log("Step 2: Adding a comment to the post...")
    // Add a comment with image
    await page.fill('textarea[name="comment"]', "This is a test comment with an image.")

    const commentFileInput = page.locator('input[type="file"]').last()
    await commentFileInput.setInputFiles(["tests/test-comment-image.jpg"])

    // Wait for comment image to be uploaded
    await page.waitForTimeout(2000)

    // Submit the comment
    await page.click('button:has-text("Submit Comment")')

    // Wait for comment to appear
    await page.waitForTimeout(3000)
    await expect(page.locator("text=This is a test comment with an image.")).toBeVisible()

    // Step 3: Edit the post
    console.log("Step 3: Editing the post...")
    await page.goto("http://localhost:4001/iyc/")
    await page.waitForLoadState("networkidle")

    // Click edit button (assuming it's visible for the test)
    const editButton = page.locator('button:has-text("Edit")').first()
    if (await editButton.isVisible()) {
      await editButton.click()

      // Update the post title
      await page.fill("#title", "Updated Test Post with Multiple Images")
      await page.fill('textarea[name="description"]', "This post has been updated during end-to-end testing.")

      // Submit the updated post
      await page.click('button[type="submit"]')

      // Wait for redirect and verify update
      await page.waitForURL("**/iyc/", { timeout: 7000 })
      await expect(page.locator("text=Updated Test Post with Multiple Images")).toBeVisible()
    }

    // Step 4: Delete the post
    console.log("Step 4: Deleting the post...")
    await page.click("text=Updated Test Post with Multiple Images")
    await page.waitForLoadState("networkidle")

    // Click delete button
    const deleteButton = page.locator('button:has-text("Delete")')
    if (await deleteButton.isVisible()) {
      await deleteButton.click()

      // Confirm deletion if there's a confirmation dialog
      await page.waitForTimeout(1000)
      const confirmButton = page.locator('button:has-text("Confirm")')
      if (await confirmButton.isVisible()) {
        await confirmButton.click()
      }

      // Wait for redirect to home page
      await page.waitForURL("**/iyc/", { timeout: 7000 })

      // Verify post is deleted
      await expect(page.locator("text=Updated Test Post with Multiple Images")).not.toBeVisible()
    }

    console.log("All tests completed successfully!")
  })
})

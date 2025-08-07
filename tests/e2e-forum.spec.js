const { test, expect } = require("@playwright/test")
const { exec } = require("child_process")
const path = require("path")

const postTitle = "Test Post with Multiple Images"
const updatedPostTitle = "Updated -" + postTitle
const postDescription = "This is a test post with multiple images for end-to-end testing."
const updatedDescription = "This post has been updated during end-to-end testing."
const homeUrl = "http://localhost:4001/iyc/"

const jekyllRebuildTime = 7000
const fileAttachTime = 2000
const firebaseProcessTime = 7000

test.describe("Forum End-to-End Tests", () => {
  test("should perform complete forum workflow: create post, add comment, edit post, and delete post", async ({
    page,
  }) => {
    // Navigate to the forum homepage
    await page.goto(homeUrl)
    await page.waitForLoadState("networkidle")

    //==================
    // Step 1: Create a new post with multiple images
    //==================
    console.log("Step 1: Creating a new post with multiple images...")
    await page.click('a[href="/iyc/post/"]')
    await page.waitForLoadState("networkidle")

    // Fill in the post form
    await page.fill("#title", postTitle)
    await page.fill('textarea[name="description"]', postDescription)

    // Upload multiple files
    let fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(["tests/test-image-1.jpg", "tests/test-image-2.jpg"])

    // Wait for files to be uploaded and displayed
    await page.waitForTimeout(2000)
    const fileListText = await page.locator("#uploadedFilesList").textContent()
    expect(fileListText).toContain("test-image-1.jpg")
    expect(fileListText).toContain("test-image-2.jpg")

    // Submit the post
    await page.click('button[type="submit"]')

    // Wait for the green success notification to appear
    await page.waitForSelector(".bg-green-100", { timeout: firebaseProcessTime })

    await doGitPullAndNavigateToHome(page)

    await expect(page.locator("text=Test Post with Multiple Images")).toBeVisible()

    await page.click("text=Test Post with Multiple Images")
    await page.waitForLoadState("networkidle")

    // check if title, description & images are as expected
    await expect(page.locator(`h1:has-text("${postTitle}")`)).toBeVisible()
    let description = await page.locator(".prose").textContent()
    expect(description).toContain(postDescription)

    let postImages = page.locator(".prose img")
    await expect(postImages).toHaveCount(2)

    //===============
    // Step 2: Navigate to the created post and add a comment
    //===============
    console.log("Step 2: Adding a comment to the post...")
    // Add a comment with image
    await page.fill('textarea[name="comment"]', "This is a test comment with an image.")

    const commentFileInput = page.locator('input[type="file"]').last()
    await commentFileInput.setInputFiles(["tests/test-comment-image.jpg"])

    // Wait for comment image to be uploaded
    await page.waitForTimeout(fileAttachTime)

    // Submit the comment
    await page.click('button:has-text("Submit Comment")')
    await page.waitForSelector(".text-green-600", { timeout: firebaseProcessTime })

    // Wait for comment to appear
    await gitPull()
    await page.waitForTimeout(jekyllRebuildTime)
    await page.reload()
    await page.waitForLoadState("networkidle")

    // check comment text & image
    await expect(page.locator("text=This is a test comment with an image.")).toBeVisible()
    postImages = page.locator("#commentsContainer img")
    await expect(postImages).toHaveCount(1)

    //=============
    // Step 3: Edit the post
    //=============
    console.log("Step 3: Editing the post...")
    await page.goto(homeUrl)
    await page.waitForLoadState("networkidle")

    await expect(page.locator('button:has-text("Edit")')).toBeVisible()

    await page.click(`text=${postTitle}`)
    await page.waitForLoadState("networkidle")
    await expect(page.locator('button:has-text("Edit")')).toBeVisible()

    let editButton = page.locator('button:has-text("Edit")')
    await editButton.click()
    await page.waitForLoadState("networkidle")

    // expect 2 images on the edit page
    expect(page.locator("#existingImagesList > div")).toHaveCount(2)

    // Update the post title
    await page.fill("#title", updatedPostTitle)
    await page.fill('textarea[name="description"]', updatedDescription)

    // remove one image
    let firstImageRemoveButton = page.locator("#existingImagesList button").first()
    await firstImageRemoveButton.click()
    await page.waitForTimeout(fileAttachTime)
    expect(page.locator("#existingImagesList > div")).toHaveCount(1)

    // add another image
    fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(["tests/test-image-3.jpg"])
    await page.waitForTimeout(fileAttachTime)
    // no need to test attachment showing as it is already tested during post creation

    // Submit the updated post & pull latest changes
    await page.click('button[type="submit"]')
    await page.waitForSelector(".bg-green-100", { timeout: firebaseProcessTime })
    await doGitPullAndNavigateToHome(page)

    // navigate to the post & check if title & description updated, also the removed image is removed
    await page.click(`text=${updatedPostTitle}`)
    await page.waitForLoadState("networkidle")
    await expect(page.getByText(updatedPostTitle)).toBeVisible()
    description = await page.locator(".prose").textContent()
    expect(description).toContain(updatedDescription)
    postImages = page.locator(".prose img")
    await expect(postImages).toHaveCount(2)
    let firstImageSrc = await postImages.first().getAttribute("src")
    expect(firstImageSrc).toContain("test-image-2")

    //========
    // Step 4: Delete the post
    //========
    console.log("Step 4: Deleting the post...")
    await page.goto(homeUrl)
    await page.waitForLoadState("networkidle")
    await page.click(`text=${updatedPostTitle}`)
    await page.waitForLoadState("networkidle")

    expect(page.locator('button:has-text("Delete")')).toBeVisible()

    // dialog need to be registered before the delete button is clicked
    page.on("dialog", async (dialog) => {
      dialog.accept()
    })
    // Click delete button
    const deleteButton = page.locator('button:has-text("Delete")')
    await deleteButton.click()

    await page.waitForTimeout(1000) // wait for confirm dialog to come up, the dialog registered will click ok

    await page.waitForEvent("dialog", { timeout: firebaseProcessTime }) // waiting for another dialog to show after deletion, it will also be clicked ok

    await doGitPullAndNavigateToHome(page)

    // Verify post is deleted
    await expect(page.locator(`text=${updatedPostTitle}`)).not.toBeVisible()

    // console.log("All tests completed successfully!")
  })
})

async function gitPull() {
  return new Promise((resolve) => {
    const projectRoot = path.resolve(__dirname, "..")

    console.log("Pulling latest changes...")
    exec("git pull origin test", { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        console.log("Git pull failed, continuing with test:", error.message)
        throw new Error("failing test as git pull did not succeed")
      } else {
        console.log("Successfully pulled latest changes")
        if (stdout) console.log(stdout)
      }
      resolve()
    })
  })
}

async function doGitPullAndNavigateToHome(page) {
  await gitPull()
  console.log("Successfully pulled latest changes")
  await page.waitForTimeout(jekyllRebuildTime) //wait for jekyll to rebuild
  await page.goto(homeUrl)
  await page.waitForLoadState("networkidle")
}

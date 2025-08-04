const functions = require("firebase-functions")
const { corsHandler, parseMultipartData, octokit, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, handleJekyllPost } = require("./library")

exports.submitForm = functions.region("asia-south1").https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
      res.status(200).send()
      return
    }

    // Only allow POST requests
    if (req.method !== "POST") {
      res.status(405).json({
        success: false,
        error: "Method not allowed. Only POST requests are accepted.",
      })
      return
    }

    try {
      // Check GitHub configuration
      if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
        res.status(500).json({
          success: false,
          error: "GitHub configuration is missing. Please configure GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.",
        })
        return
      }

      // Parse multipart data with blog post specific options
      const { fields, fileData, fileName, fileType } = await parseMultipartData(req, {
        fileSize: 10 * 1024 * 1024, // 10MB limit for blog posts
        allowedFileField: "image",
        imageOnly: true,
      })

      // Extract form data
      const { title, description, slug } = fields

      // Extract user cookie from request headers
      const userCookie =
        req.headers["x-user-cookie"] || req.headers["cookie"]?.match(/forum_user_id=([^;]+)/)?.[1] || null

      // Validate that cookie is present (mandatory for post creation/editing)
      if (!userCookie) {
        res.status(401).json({
          success: false,
          error: "User cookie is required to create or edit a post. Please ensure you have a valid session.",
        })
        return
      }
      // Determine if this is an edit operation
      const isEdit = slug && slug.trim() !== ""

      // Use the combined function for both create and edit operations
      const result = await handleJekyllPost(slug, title, description, fileName, fileData, fileType, userCookie)

      // Send success response
      res.status(200).json({
        success: true,
        message: isEdit ? "Blog post updated successfully!" : "Blog post submitted successfully!",
        data: {
          title: title,
          description: description,
          postUrl: result.postUrl,
          githubUrl: result.githubUrl,
          submittedAt: new Date().toISOString(),
          operation: isEdit ? "update" : "create",
        },
      })
    } catch (error) {
      console.error("Error in submitForm:", error)
      res.status(500).json({
        success: false,
        error: error.message || "An unexpected error occurred while processing your submission.",
      })
    }
  })
})

// Submit comment function (for adding comments to blog posts) - refactored to use single commit

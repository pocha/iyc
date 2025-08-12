const functions = require("firebase-functions")
const {
  corsHandler,
  octokit,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
  parseMultipartData,
  createSingleCommit,
  getCommentPaths,
} = require("./library")

exports.submitComment = functions.region("asia-south1").https.onRequest((req, res) => {
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
          error: "GitHub configuration is missing.",
        })
        return
      }

      // Parse multipart data with comment specific options
      const { fields, files } = await parseMultipartData(req, {
        fileSize: 5 * 1024 * 1024, // 5MB limit for comments
        allowedFileField: "image",
        imageOnly: true,
      })

      const { postSlug, postDate, comment, commentId, userCookie } = fields

      // Validate required fields
      if (!postSlug || !comment || !userCookie) {
        res.status(400).json({
          success: false,
          error: "Post slug, comment, and user cookie are required fields.",
        })
        return
      }

      // Generate timestamp
      const now = new Date()
      const timestamp = now.toISOString()

      // Determine if this is edit or create mode
      const isEditMode = commentId && commentId.trim() !== ""
      const { commentPath } = getCommentPaths(postSlug, postDate, commentId)

      // Create comment content in YAML format for Staticman structure
      let commentContent = `date: ${timestamp}
user_cookie: ${userCookie}
message: ${comment}`

      // Prepare files for single commit
      const filesToCreate = []

      // Handle image attachment if present
      if (files && files.length > 0) {
        const file = files[0] // Get first file for comments
        const { filename, mimeType, buffer } = file

        if (mimeType && mimeType.startsWith("image/")) {
          const { commentImagePath } = getCommentPaths(postSlug, postDate, null, filename)

          // Add image reference to comment content
          const imageUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${commentImagePath}?raw=true`
          commentContent += `
image: ${imageUrl}`

          // Add image file to the commit
          filesToCreate.push({
            path: commentImagePath,
            content: buffer.toString("base64"),
            encoding: "base64",
          })
        }
      }

      // Add comment file to the commit
      filesToCreate.push({
        path: commentPath,
        content: commentContent,
        encoding: "utf-8",
      })

      // Use the generic single commit function
      const commitMessage = isEditMode
        ? `Edit comment ${commentId} in post: ${postSlug}`
        : `Add comment to post: ${postSlug}`

      const result = await createSingleCommit(filesToCreate, commitMessage)

      // Send success response
      res.status(200).json(result)
    } catch (error) {
      console.error("Error in submitComment:", error)
      res.status(500).json({
        success: false,
        error: error.message || "An unexpected error occurred while processing your comment.",
      })
    }
  })
})

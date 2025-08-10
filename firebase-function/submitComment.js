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

      const { postSlug, comment, commentId, userCookie } = fields

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
      const timeStr = now.toISOString()

      // Determine if this is edit or create mode
      const isEditMode = commentId && commentId.trim() !== ""

      // Generate comment ID for new comments or use existing for edits
      const finalCommentId = isEditMode ? commentId : `comment-${timeStr.replace(/[:.]/g, "-")}`

      // Create comment content in YAML format for Staticman structure
      // Create comment content in YAML format for Staticman structure
      let commentContent = `_id: ${finalCommentId}
date: ${isEditMode ? timestamp : timestamp}
userCookie: ${userCookie}
message: ${comment}`

      // Prepare files for single commit
      const filesToCreate = []

      // Handle image attachment if present
      if (files && files.length > 0) {
        const file = files[0] // Get first file for comments
        const { filename, mimeType, buffer } = file

        if (mimeType && mimeType.startsWith("image/")) {
          const imageFileName = `comment-${timeStr}-${filename}`
          const imagePath = `_posts/${postSlug}/${imageFileName}`

          // Add image reference to comment content
          const imageUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/_posts/${postSlug}/${imageFileName}?raw=true`
          commentContent += `
image: ${imageUrl}`

          // Add image file to the commit
          filesToCreate.push({
            path: imagePath,
            content: buffer.toString("base64"),
            encoding: "base64",
          })
        }
      }

      // Create comment file in the Staticman structure
      const commentPath = `_data/comments/${postSlug}/${finalCommentId}.yml`

      // Add comment file to the commit
      filesToCreate.push({
        path: commentPath,
        content: commentContent,
        encoding: "utf-8",
      })

      // Use the generic single commit function
      const commitMessage = isEditMode
        ? `Edit comment ${finalCommentId} in post: ${postSlug}`
        : `Add comment to post: ${postSlug}`

      const result = await createSingleCommit(filesToCreate, commitMessage)

      // Send success response
      res.status(200).json({
        success: true,
        message: isEditMode ? "Comment updated successfully!" : "Comment submitted successfully!",
        data: {
          ...result,
          postSlug: postSlug,
          comment: comment,
          commentId: finalCommentId,
          submittedAt: timestamp,
          isEdit: isEditMode,
        },
      })
    } catch (error) {
      console.error("Error in submitComment:", error)
      res.status(500).json({
        success: false,
        error: error.message || "An unexpected error occurred while processing your comment.",
      })
    }
  })
})

const functions = require("firebase-functions")
const { corsHandler, octokit, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = require("./library")

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
      const { fields, fileData, fileName, fileType } = await parseMultipartData(req, {
        fileSize: 5 * 1024 * 1024, // 5MB limit for comments
        allowedFileField: "image",
        imageOnly: true,
      })

      const { postSlug, comment } = fields

      // Validate required fields
      if (!postSlug || !comment) {
        res.status(400).json({
          success: false,
          error: "Post slug and comment are required fields.",
        })
        return
      }

      // Generate timestamp for comment
      const now = new Date()
      const timestamp = now.toISOString()
      const timeStr = now.toISOString()

      // Generate comment ID and sanitized timestamp for filename
      const commentId = `comment-${timeStr.replace(/[:.]/g, "-")}`

      // Create comment content in YAML format for Staticman structure
      let commentContent = `_id: ${commentId}
date: ${timestamp}
name: Anonymous
message: ${comment}`

      // Prepare files for single commit
      const filesToCreate = []

      // Handle image attachment if present
      if (fileData && fileName && fileType && fileType.startsWith("image/")) {
        const imageFileName = `comment-${timeStr}-${fileName}`
        const imagePath = `_posts/${postSlug}/${imageFileName}`

        // Add image reference to comment content
        const imageUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/_posts/${postSlug}/${imageFileName}?raw=true`
        commentContent += `
image: ${imageUrl}`

        // Add image file to the commit
        filesToCreate.push({
          path: imagePath,
          content: Buffer.from(fileData).toString("base64"),
          encoding: "base64",
        })
      }

      // Create comment file in the Staticman structure
      const commentPath = `_data/comments/${postSlug}/${commentId}.yml`

      // Add comment file to the commit
      filesToCreate.push({
        path: commentPath,
        content: commentContent,
        encoding: "utf-8",
      })

      // Use the generic single commit function
      const result = await createSingleCommit(filesToCreate, `Add comment to post: ${postSlug}`)

      // Send success response
      res.status(200).json({
        success: true,
        message: "Comment submitted successfully!",
        data: {
          postSlug: postSlug,
          comment: comment,
          githubUrl: result.githubUrl,
          submittedAt: timestamp,
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
// Delete Post Function

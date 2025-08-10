const functions = require("firebase-functions")
const yaml = require("js-yaml")
const {
  corsHandler,
  octokit,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
  createSingleCommit,
} = require("./library")

exports.deleteContent = functions.region("asia-south1").https.onRequest((req, res) => {
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

      const { postSlug, commentId, userCookie } = req.body

      // Validate required fields
      if (!postSlug || !userCookie) {
        res.status(400).json({
          success: false,
          error: "Post slug and user cookie are required.",
        })
        return
      }

      // Determine if this is comment deletion or post deletion
      const isCommentDeletion = commentId && commentId.trim() !== ""

      // Get content and verify ownership (common for both operations)
      let contentToVerify
      let parsedContent
      if (isCommentDeletion) {
        // Get comment content for ownership verification
        try {
          const commentResponse = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: `_data/comments/${postSlug}/${commentId}.yml`,
            ref: GITHUB_BRANCH,
          })
          contentToVerify = Buffer.from(commentResponse.data.content, 'base64').toString('utf-8')
          // Parse YAML content
          parsedContent = yaml.load(contentToVerify)
        } catch (error) {
          if (error.status === 404) {
            res.status(404).json({
              success: false,
              error: "Comment not found.",
            })
            return
          }
          throw error
        }
      } else {
        // Get post content for ownership verification
        try {
          const postResponse = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: `_posts/${postSlug}/index.md`,
            ref: GITHUB_BRANCH,
          })
          contentToVerify = Buffer.from(postResponse.data.content, 'base64').toString('utf-8')
          // Parse YAML frontmatter for posts
          const frontmatterMatch = contentToVerify.match(/^---\n([\s\S]*?)\n---/)
          if (frontmatterMatch) {
            parsedContent = yaml.load(frontmatterMatch[1])
          }
        } catch (error) {
          if (error.status === 404) {
            res.status(404).json({
              success: false,
              error: "Post not found.",
            })
            return
          }
          throw error
        }
      }

      // Check if userCookie matches (common check for both operations)
      if (!parsedContent || !parsedContent.userCookie || parsedContent.userCookie !== userCookie) {
        res.status(403).json({
          success: false,
          error: isCommentDeletion ? "You can only delete your own comments." : "You can only delete your own posts.",
        })
        return
      }

      // Initialize files to delete array
      const filesToDelete = []
      let commitMessage = ""

      if (isCommentDeletion) {
        // Comment deletion logic
        console.log(`Attempting to delete comment: ${commentId} from post: ${postSlug}`)

        // Add comment file to deletion list
        filesToDelete.push({
          path: `_data/comments/${postSlug}/${commentId}.yml`,
          content: null,
          encoding: null, // This marks the file for deletion
        })

        // Check if comment has an associated image using the parsed YAML
        if (parsedContent.image) {
          const imageUrl = parsedContent.image
          // Extract filename from the GitHub URL
          const urlMatch = imageUrl.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/blob\/[^\/]+\/_posts\/[^\/]+\/(.+)\?raw=true/)
          if (urlMatch) {
            const imageFileName = urlMatch[1]
            filesToDelete.push({
              path: `_posts/${postSlug}/${imageFileName}`,
              content: null,
              encoding: null, // This marks the file for deletion
            })
          }
        }

        commitMessage = `Delete comment ${commentId} from post: ${postSlug}`

      } else {
        // Post deletion logic
        console.log(`Attempting to delete post: ${postSlug}`)

        // Get current branch reference to get the latest SHA
        const branchRef = await octokit.rest.git.getRef({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          ref: `heads/${GITHUB_BRANCH}`,
        })
        const currentSha = branchRef.data.object.sha

        // Get the current tree
        const treeResponse = await octokit.rest.git.getTree({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          tree_sha: currentSha,
          recursive: true,
        })
        const treeData = treeResponse.data

        // Add post directory files and comment directory files to deletion list
        const postDirPath = `_posts/${postSlug}`
        const commentDirPath = `_data/comments/${postSlug}`

        treeData.tree.forEach((item) => {
          if (item.path.startsWith(postDirPath + "/") || item.path.startsWith(commentDirPath + "/")) {
            filesToDelete.push({
              path: item.path,
              content: null,
              encoding: null, // This marks the file for deletion
            })
          }
        })

        console.log(`Files to delete: ${filesToDelete.map((f) => f.path).join(", ")}`)

        if (filesToDelete.length === 0) {
          return res.status(404).json({
            success: false,
            error: "No files found for the specified post slug",
          })
        }

        commitMessage = `Delete post: ${postSlug}`
      }

      // Use createSingleCommit to delete all files in one commit
      const result = await createSingleCommit(filesToDelete, commitMessage)

      // Send success response
      res.status(200).json({
        success: true,
        message: isCommentDeletion ? "Comment deleted successfully!" : "Post deleted successfully!",
        data: {
          ...result,
          postSlug: postSlug,
          deletedFiles: filesToDelete.map(f => f.path),
          ...(isCommentDeletion && { commentId: commentId }),
        },
      })

    } catch (error) {
      console.error("Error in deleteContent:", error)
      res.status(500).json({
        success: false,
        error: error.message || "An unexpected error occurred while deleting content.",
      })
    }
  })
})

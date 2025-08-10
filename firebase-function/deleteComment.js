const functions = require("firebase-functions")
const {
  corsHandler,
  octokit,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
  createSingleCommit,
} = require("./library")

exports.deleteComment = functions.region("asia-south1").https.onRequest((req, res) => {
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
      if (!postSlug || !commentId || !userCookie) {
        res.status(400).json({
          success: false,
          error: "Post slug, comment ID, and user cookie are required.",
        })
        return
      }

      // First, get the comment to verify ownership
      let commentContent
      try {
        const commentResponse = await octokit.repos.getContent({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          path: `_data/comments/${postSlug}/${commentId}.yml`,
          ref: GITHUB_BRANCH,
        })
        
        commentContent = Buffer.from(commentResponse.data.content, 'base64').toString('utf-8')
        
        // Check if userCookie matches
        const userCookieMatch = commentContent.match(/userCookie:\s*(.+)/)
        if (!userCookieMatch || userCookieMatch[1].trim() !== userCookie) {
          res.status(403).json({
            success: false,
            error: "You can only delete your own comments.",
          })
          return
        }
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

      // Prepare files to delete
      const filesToDelete = []

      // Add comment file to deletion list
      filesToDelete.push(`_data/comments/${postSlug}/${commentId}.yml`)

      // Check if comment has an associated image and add to deletion list
      const imageMatch = commentContent.match(/image:\s*https:\/\/github\.com\/[^\/]+\/[^\/]+\/blob\/[^\/]+\/_posts\/[^\/]+\/(.+)\?raw=true/)
      if (imageMatch) {
        const imageFileName = imageMatch[1]
        filesToDelete.push(`_posts/${postSlug}/${imageFileName}`)
      }

      // Get current tree SHA
      const { data: refData } = await octokit.git.getRef({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        ref: `heads/${GITHUB_BRANCH}`,
      })

      const currentCommitSha = refData.object.sha

      // Get current commit
      const { data: currentCommit } = await octokit.git.getCommit({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        commit_sha: currentCommitSha,
      })

      const currentTreeSha = currentCommit.tree.sha

      // Get current tree
      const { data: currentTree } = await octokit.git.getTree({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        tree_sha: currentTreeSha,
        recursive: true,
      })

      // Create new tree without the files to delete
      const newTreeItems = currentTree.tree.filter(item => 
        !filesToDelete.includes(item.path)
      )

      // Create new tree
      const { data: newTree } = await octokit.git.createTree({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        tree: newTreeItems,
      })

      // Create new commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        message: `Delete comment ${commentId} from post: ${postSlug}`,
        tree: newTree.sha,
        parents: [currentCommitSha],
      })

      // Update reference
      await octokit.git.updateRef({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        ref: `heads/${GITHUB_BRANCH}`,
        sha: newCommit.sha,
      })

      // Send success response
      res.status(200).json({
        success: true,
        message: "Comment deleted successfully!",
        data: {
          postSlug: postSlug,
          commentId: commentId,
          commitSha: newCommit.sha,
          deletedFiles: filesToDelete,
        },
      })
    } catch (error) {
      console.error("Error in deleteComment:", error)
      res.status(500).json({
        success: false,
        error: error.message || "An unexpected error occurred while deleting the comment.",
      })
    }
  })
})

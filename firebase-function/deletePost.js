const functions = require("firebase-functions")
const { corsHandler, octokit, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, createSingleCommit } = require("./library")

exports.deletePost = functions.region("asia-south1").https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(204).send("")
      return
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" })
    }

    try {
      const { postSlug } = req.body

      if (!postSlug) {
        return res.status(400).json({
          success: false,
          error: "Post slug is required",
        })
      }

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

      // Create array of files to delete by targeting specific paths
      const filesToProcess = []

      // Add post directory files
      const postDirPath = `_posts/${postSlug}`
      const commentDirPath = `_data/comments/${postSlug}`

      treeData.tree.forEach((item) => {
        if (item.path.startsWith(postDirPath + "/") || item.path.startsWith(commentDirPath + "/")) {
          filesToProcess.push({
            path: item.path,
            content: null,
            encoding: null, // This marks the file for deletion
          })
        }
      })

      console.log(`Files to delete: ${filesToProcess.map((f) => f.path).join(", ")}`)

      if (filesToProcess.length === 0) {
        return res.status(404).json({
          success: false,
          error: "No files found for the specified post slug",
        })
      }

      // Use createSingleCommit to delete all files in one commit
      const result = await createSingleCommit(filesToProcess, `Delete post: ${postSlug}`)

      const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${result.commitSha}`

      // Send success response
      res.status(200).json({
        success: true,
        message: "Post deleted successfully!",
        data: {
          ...result,
          postSlug: postSlug,
          deletedAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      console.error("Error in deletePost:", error)
      res.status(500).json({
        success: false,
        error: error.message || "An unexpected error occurred while deleting the post.",
      })
    }
  })
})

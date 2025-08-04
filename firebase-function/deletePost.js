const functions = require("firebase-functions")
const { corsHandler, octokit, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = require("./library")

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

      // Get current repository state
      const { data: refData } = await octokit.rest.git.getRef({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        ref: `heads/${GITHUB_BRANCH}`,
      })

      const currentSha = refData.object.sha

      // Get current tree
      const { data: treeData } = await octokit.rest.git.getTree({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        tree_sha: currentSha,
        recursive: true,
      })

      // Create array of files to delete by targeting specific paths
      const filesToDelete = []

      // Add post directory files
      const postDirPath = `_posts/${postSlug}`
      const commentDirPath = `_data/comments/${postSlug}`

      treeData.tree.forEach((item) => {
        if (item.path.startsWith(postDirPath + "/") || item.path.startsWith(commentDirPath + "/")) {
          filesToDelete.push({
            path: item.path,
            mode: "100644",
            type: "blob",
            sha: null, // This marks the file for deletion
          })
        }
      })

      console.log(`Files to delete: ${filesToDelete.map((f) => f.path).join(", ")}`)

      // Create new tree with files marked for deletion
      const { data: newTree } = await octokit.rest.git.createTree({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        base_tree: currentSha,
        tree: filesToDelete,
      })

      // Create new commit
      const { data: newCommit } = await octokit.rest.git.createCommit({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        message: `Delete post: ${postSlug}`,
        tree: newTree.sha,
        parents: [currentSha],
      })

      // Update reference
      await octokit.rest.git.updateRef({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        ref: `heads/${GITHUB_BRANCH}`,
        sha: newCommit.sha,
      })

      const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${newCommit.sha}`

      // Send success response
      res.status(200).json({
        success: true,
        message: "Post deleted successfully!",
        data: {
          postSlug: postSlug,
          githubUrl: githubUrl,
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

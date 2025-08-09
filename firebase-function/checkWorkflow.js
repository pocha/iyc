const functions = require("firebase-functions")
const { octokit, corsHandler, GITHUB_OWNER, GITHUB_REPO } = require("./library")

/**
 * Firebase function to check GitHub workflow status
 * Accepts commit SHA and returns workflow run information
 */
const checkWorkflow = functions.region("asia-south1").https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    try {
      // Only allow GET requests
      if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" })
      }

      const { sha, workflowId } = req.query

      if (!sha && !workflowId) {
        return res.status(400).json({ error: "Missing required parameter: sha or workflowId" })
      }

      if (workflowId) {
        console.log(`Checking specific workflow run: ${workflowId}`)

        // Query GitHub API for a specific workflow run
        const response = await octokit.rest.actions.getWorkflowRun({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          run_id: workflowId,
        })

        console.log(`Found workflow run ${workflowId} with status: ${response.data.status}`)

        // Return single workflow run data
        return res.status(200).json({
          /*id: response.data.id, */
          status: response.data.status,
          conclusion: response.data.conclusion,
          createdAt: response.data.created_at,
          /*updated_at: response.data.updated_at,
          head_sha: response.data.head_sha,
          workflowId: response.data.workflow_id,
          name: response.data.name,*/
        })
      } else {
        console.log(`Checking workflow for commit SHA: ${sha}`)

        // Query GitHub API for workflow runs with the specific commit SHA
        const response = await octokit.rest.actions.listWorkflowRunsForRepo({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          head_sha: sha,
          per_page: 10,
        })

        console.log(`Found ${response.data.total_count} workflow runs for SHA: ${sha}`)

        if (response.data.total_count == 0) {
          //workflow is not yet created maybe
          return res.status(200).json({
            workflowId: null,
          })
        }

        // Return the workflow runs data
        return res.status(200).json({
          /*total_count: response.data.total_count,
          workflow_runs: response.data.workflow_runs.map((run) => ({
            id: run.id,
            status: run.status,
            conclusion: run.conclusion,
            created_at: run.created_at,
            updated_at: run.updated_at,
            head_sha: run.head_sha,*/
          workflowId: response.data.workflow_runs[0].workflow_id,
          /*name: run.name,
          })),*/
        })
      }
    } catch (error) {
      console.error("Error checking workflow:", error)
      return res.status(500).json({
        error: "Failed to check workflow status",
        details: error.message,
      })
    }
  })
})

module.exports = { checkWorkflow }

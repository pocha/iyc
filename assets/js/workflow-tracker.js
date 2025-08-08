class WorkflowTracker {
  constructor() {
    this.activeSubmissions = this.loadActiveSubmissions()
    this.checkAndApplyPageRestrictions()
  }

  // Load active submissions from localStorage
  loadActiveSubmissions() {
    try {
      const stored = localStorage.getItem("activeSubmissions")
      return stored ? JSON.parse(stored) : {}
    } catch (error) {
      console.error("Error loading active submissions:", error)
      return {}
    }
  }

  // Save active submissions to localStorage
  saveActiveSubmissions() {
    try {
      localStorage.setItem("activeSubmissions", JSON.stringify(this.activeSubmissions))
    } catch (error) {
      console.error("Error saving active submissions:", error)
    }
  }

  // Track a new submission
  trackSubmission(type, identifier, workflowId) {
    const key = `${type}_${identifier}`
    this.activeSubmissions[key] = {
      type: type,
      identifier: identifier,
      workflowId: workflowId,
      timestamp: Date.now(),
    }
    this.saveActiveSubmissions()
    console.log(`Tracking submission: ${key} with workflow ${workflowId}`)
    // enable page blocking .. ideally this should be with await but there will not be any API call so we should be good
    this.checkAndApplyPageRestrictions(false)
  }

  // Remove a submission from tracking
  removeSubmission(type, identifier) {
    const key = `${type}_${identifier}`
    if (this.activeSubmissions[key]) {
      delete this.activeSubmissions[key]
      this.saveActiveSubmissions()
      console.log(`Removed submission tracking: ${key}`)
    }
  }

  // Check current page and apply restrictions based on active submissions
  async checkAndApplyPageRestrictions(cleanupOldSubmissions = true) {
    const currentPath = window.location.pathname

    // Iterate through each active submission to see if current URL is affected
    for (const [key, submission] of Object.entries(this.activeSubmissions)) {
      const { type, identifier } = submission

      // Check if current page matches any active submission
      if (type === "post" && identifier === "new") {
        // Check if this is the new post page
        if (currentPath === "/" || currentPath.includes("submit") || currentPath.includes("new")) {
          this.handleNewPostPage()
        }
      } else if (type === "edit") {
        // Check if this is the edit page for this specific post
        const editMatch = currentPath.match(/\/edit\/(.+)/)
        if (editMatch && editMatch[1] === identifier) {
          this.handleEditPage(identifier)
        }

        // Also check if this is the post view page with edit links
        const postMatch = currentPath.match(/\/([^\/]+)$/)
        if (postMatch && postMatch[1] === identifier && !currentPath.includes("/edit/")) {
          this.handlePostViewPage(identifier, "edit")
        }
      } else if (type === "delete") {
        // Check if this is the post view page for the post being deleted
        const postMatch = currentPath.match(/\/([^\/]+)$/)
        if (postMatch && postMatch[1] === identifier && !currentPath.includes("/edit/")) {
          this.handlePostViewPage(identifier, "delete")
        }

        // Also check if this is the edit page for the post being deleted
        const editMatch = currentPath.match(/\/edit\/(.+)/)
        if (editMatch && editMatch[1] === identifier) {
          this.handleEditPage(identifier, "delete")
        }
      }
    }

    // Clean up old submissions at the end
    if (cleanupOldSubmissions) await this.cleanupOldSubmissions()
  }

  // Handle new post page restrictions
  handleNewPostPage() {
    const postForm = document.getElementById("postForm")
    const submitButton = document.getElementById("submitBtn")

    this.blockForm(
      postForm,
      submitButton,
      "A new post submission is already in progress. Please wait for it to complete.",
      "Submit Post",
      "Submission in Progress..."
    )
  }

  // Handle edit page restrictions
  handleEditPage(postSlug, conflictType = "edit") {
    const editForm = document.getElementById("editForm") || document.getElementById("postForm")
    const submitButton = document.getElementById("updateBtn") || document.getElementById("submitBtn")

    let message = "An edit submission is already in progress for this post. Please wait for it to complete."
    let progressText = "Edit in Progress..."

    if (conflictType === "delete") {
      message = "This post is currently being deleted. Edit is not available."
      progressText = "Post Being Deleted..."
    }

    this.blockForm(editForm, submitButton, message, "Update Post", progressText)
  }

  // Handle post view page - grey out edit/delete links based on active operations
  handlePostViewPage(postSlug, operationType) {
    if (operationType === "edit") {
      // Grey out edit links when edit is in progress
      const editLinks = document.querySelectorAll(`a[href*="/edit/${postSlug}"]`)

      editLinks.forEach((link) => {
        link.style.opacity = "0.5"
        link.style.pointerEvents = "none"
        link.style.cursor = "not-allowed"
        link.title = "Edit is currently in progress for this post"
      })

      this.showNotification("An edit is currently in progress for this post.")
    } else if (operationType === "delete") {
      // Grey out both edit and delete buttons when delete is in progress
      const editLinks = document.querySelectorAll(`a[href*="/edit/${postSlug}"]`)
      const deleteButtons = document.querySelectorAll(
        `button[onclick*="deletePost"], button[data-post-slug="${postSlug}"]`
      )

      // Disable edit links
      editLinks.forEach((link) => {
        link.style.opacity = "0.5"
        link.style.pointerEvents = "none"
        link.style.cursor = "not-allowed"
        link.title = "This post is currently being deleted"
      })

      // Disable delete buttons
      deleteButtons.forEach((button) => {
        button.disabled = true
        button.style.opacity = "0.5"
        button.style.cursor = "not-allowed"
        button.title = "Delete is currently in progress"

        // Update button text if it contains "Delete"
        if (button.textContent.toLowerCase().includes("delete")) {
          button.textContent = "Deleting..."
        }
      })

      this.showNotification("This post is currently being deleted.")
    }
  }

  // Block form elements
  blockForm(form, submitButton, message, originalText, progressText) {
    if (form) {
      form.style.opacity = "0.5"
      form.style.pointerEvents = "none"
    }

    if (submitButton) {
      submitButton.disabled = true
      submitButton.textContent = progressText
      submitButton.style.cursor = "not-allowed"
    }

    this.showNotification(message)
  }

  // Show notification to user
  showNotification(message) {
    // Remove existing notification if any
    const existing = document.getElementById("workflow-notification")
    if (existing) {
      existing.remove()
    }

    // Create notification element
    const notification = document.createElement("div")
    notification.id = "workflow-notification"
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: #ffeaa7;
      color: #2d3436;
      padding: 15px 20px;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1000;
      max-width: 300px;
      font-size: 14px;
      border-left: 4px solid #fdcb6e;
    `
    notification.textContent = message

    document.body.appendChild(notification)

    // Auto-remove after 10 seconds
  }

  // Check workflow status (placeholder for future implementation)
  // Retrieve workflow information for a commit SHA
  async retrieveWorkflow(commitSha, maxRetries = 5, retryDelay = 5000) {
    console.log(`Attempting to retrieve workflow for commit: ${commitSha}`)

    // Get GitHub configuration from Jekyll config
    const githubUser = window.jekyllConfig?.github_user || "pocha"
    const githubRepo = window.jekyllConfig?.github_repo || "iyc" // Repository name
    const url = `https://api.github.com/repos/${githubUser}/${githubRepo}/actions/runs?head_sha=${commitSha}`
    console.log(url)

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Query GitHub API directly for workflow runs
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "forum-theme-app/1.0",
          },
        })

        if (!response.ok) {
          throw new Error(`GitHub API error! status: ${response.status}`)
        }

        const result = await response.json()
        console.log(result)

        if (result.workflow_runs && result.workflow_runs.length > 0) {
          const workflow = result.workflow_runs[0] // Get the most recent workflow
          console.log(`Found workflow ${workflow.id} for commit ${commitSha}`)
          return {
            workflowId: workflow.id,
            workflowStatus: workflow.status,
            workflowUrl: workflow.html_url,
            workflowCreatedAt: workflow.created_at,
          }
        } else if (attempt < maxRetries) {
          console.log(
            `Workflow not found for commit ${commitSha}, attempt ${attempt}/${maxRetries}. Retrying in ${retryDelay}ms...`
          )
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
        }
      } catch (error) {
        console.error(`Error retrieving workflow (attempt ${attempt}/${maxRetries}):`, error)
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
        }
      }
    }
  }

  async checkWorkflowStatus(workflowId) {
    try {
      // Get GitHub configuration from Jekyll config
      const githubUser = window.jekyllConfig?.github_user || "pocha"
      const githubRepo = window.jekyllConfig?.github_repo || "iyc" // Repository name

      // Query GitHub API directly for workflow status
      const response = await fetch(
        `https://api.github.com/repos/${githubUser}/${githubRepo}/actions/runs/${workflowId}`,
        {
          method: "GET",
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "forum-theme-app",
          },
        }
      )

      if (!response.ok) {
        throw new Error(`GitHub API error! status: ${response.status}`)
      }

      const result = await response.json()

      // Return standardized status object
      return {
        completed: result.status === "completed",
        timedOut: result.status === "cancelled" || result.status === "timed_out",
        status: result.status,
        conclusion: result.conclusion,
      }
    } catch (error) {
      console.error("Error checking workflow status:", error)

      // If API call fails, assume workflow might be completed after reasonable time
      // This prevents indefinite blocking if the API is down
      return {
        completed: true,
        timedOut: true,
        status: "unknown",
        conclusion: "unknown",
      }
    }
  }
  // Clean up old submissions
  async cleanupOldSubmissions() {
    const now = Date.now()
    let updated = false

    for (const [key, submission] of Object.entries(this.activeSubmissions)) {
      const timeDiff = now - submission.timestamp

      // check submissions > 2 min old
      if (timeDiff > 2 * 60 * 1000) {
        try {
          const status = await this.checkWorkflowStatus(submission.workflowId)
          if (status.completed || status.timedOut) {
            console.log(`Workflow ${submission.workflowId} completed/timed out, removing from tracking`)
            delete this.activeSubmissions[key]
            updated = true
          }
        } catch (error) {
          console.error(`Error checking workflow status for ${key}:`, error)
        }
      }

      // If error and older than 10 minutes, remove anyway
      if (timeDiff > 10 * 60 * 1000) {
        console.log(`Workflow ${submission.workflowId} been there for more than 10 min, removing from tracking`)
        delete this.activeSubmissions[key]
        updated = true
      }
    }

    if (updated) {
      this.saveActiveSubmissions()
      // refresh the page so that any blocking & notification goes away
      window.location.reload()
    }
  }
}

// Initialize workflow tracker when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  window.workflowTracker = new WorkflowTracker()
  // window.workflowTracker.checkAndApplyPageRestrictions()
  // checkAndApplyPageRestriction() already launched from the constructor
})

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = WorkflowTracker
}

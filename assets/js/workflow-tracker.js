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
  trackSubmission(url, submissionId, operation, commitSha, createdAt) {
    this.activeSubmissions[url] = {
      submissionId: submissionId,
      operation: operation,
      commitSha: commitSha,
      timestamp: createdAt,
    }
    this.saveActiveSubmissions()
    console.log(`Tracking submission: ${url} with commit SHA ${commitSha}`)
    // enable page blocking .. ideally this should be with await but there will not be any API call so we should be good
    this.checkAndApplyPageRestrictions(false)
  }

  // Check current page and apply restrictions based on active submissions
  async checkAndApplyPageRestrictions(cleanupOldSubmissions = true) {
    if (!this.activeSubmissions || this.activeSubmissions == {}) return

    const currentUrl = window.location.href

    // Iterate through each active submission to see if current URL is affected
    for (const [url, submission] of Object.entries(this.activeSubmissions)) {
      const { submissionId: slug, operation } = submission

      const urlParams = new URLSearchParams(window.location.search)
      const isEditPage = urlParams.get("edit") === null ? false : true

      if (currentUrl === url) {
        if (operation === "new_post") this.handleNewPostPage()
        if (operation === "edit_post") this.handleEditPage("edit")
        if (operation === "delete_post") this.handlePostViewPage(slug, "delete")
      } else if (currentUrl.includes(slug)) {
        if (isEditPage) {
          // on edit page of a post getting deleted
          this.handleEditPage("delete")
        } else {
          // on post view page of post getting edited
          this.handlePostViewPage(slug, "edit")
        }
      }
    }

    if (this.activeSubmissions && Object.entries(this.activeSubmissions).length > 0) {
      const [url, submission] = Object.entries(this.activeSubmissions)[0] // getting the oldest entry
      const { lastRun, timestamp, operation, submissionId, lastChecked } = submission
      let message
      if (lastRun) {
        const { status, conclusion, createdAt } = lastRun
        const formattedTimestamp = new Date(timestamp).toLocaleTimeString()
        const formattedLastChecked = new Date(lastChecked).toLocaleTimeString()
        message = `<p>${operation} operation status is ${status}.</p>`
        message += `<p>Backend received data at ${formattedTimestamp}. Last check was done at ${formattedLastChecked}.</p>`
        message += `<p>Status usually updates in approx 2 minutes from backend receiving the data. Refresh the page then.</p>`
        message += `<p>Operation lifecycle - pending, queued, in-progress, completed</p>`
      } else {
        message = `<p>${operation} operation is pending. Refresh the page after 30 seconds to see an update.</p>`
        message += `<p>Appropriate functionality will be blocked till this operation completes.</p>`
      }
      this.showNotification(message)
    }

    // Clean up old submissions at the end
    if (cleanupOldSubmissions) await this.cleanupOldSubmissions()
  }

  // Handle new post page restrictions
  handleNewPostPage() {
    const postForm = document.getElementById("submissionForm")
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
  handleEditPage(conflictType = "edit") {
    const editForm = document.getElementById("submitBtn")
    const submitButton = document.getElementById("submitBtn")

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
    const buttons = []
    buttons.push(document.getElementById("editPostBtn"))
    buttons.push(document.getElementById("deletePostBtn"))

    buttons.forEach((link) => {
      link.style.opacity = "0.5"
      link.style.pointerEvents = "none"
      link.style.cursor = "not-allowed"
    })
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
      left: 50%;
      transform: translateX(-50%);
      background-color: #ffeaa7;
      color: #2d3436;
      padding: 15px 20px;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1000;
      max-width: 800px;
      min-width: 600px;
      font-size: 12px;
      border-left: 4px solid #fdcb6e;
    `
    notification.innerHTML = message

    document.body.appendChild(notification)

    // Auto-remove after 10 seconds
  }

  // Check workflow status (placeholder for future implementation)
  // Retrieve workflow information for a commit SHA
  // Retrieve workflow information for a commit SHA
  async checkWorkflowStatus(commitSha) {
    try {
      console.log(`Checking workflow status for commit SHA: ${commitSha}`)

      // Use Firebase function to get workflow status

      const url = `${window.firebaseUrl}/checkWorkflow?sha=${commitSha}`

      console.log(`Making request to: ${url}`)

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      console.log("Workflow status received:", result)

      // Return standardized status object
      return result
    } catch (error) {
      console.error("Error checking workflow status:", error)

      // If API call fails, assume workflow might be completed after reasonable time
      // This prevents indefinite blocking if the API is down
      return {
        status: "error",
        conclusion: String.toString(error),
        createdAt: null,
      }
    }
  }

  // Clean up old submissions
  async cleanupOldSubmissions() {
    const now = Date.now()
    let updated = false

    let submissionsRemoved = []

    for (const [url, submission] of Object.entries(this.activeSubmissions)) {
      let timeDiff = now - submission.timestamp
      if (submission.lastChecked) {
        timeDiff = now - submission.lastChecked
      }

      // give 30 sec gap so not to check too often
      if (timeDiff > 0.5 * 60 * 1000) {
        try {
          const workflowStatus = await this.checkWorkflowStatus(submission.commitSha)
          if (["completed", "cancelled", "timed_out"].includes(workflowStatus.status)) {
            console.log(`Workflow for commit ${submission.commitSha} completed/timed out, removing from tracking`)

            const clonedObject = JSON.parse(JSON.stringify(this.activeSubmissions[url]))
            submissionsRemoved.push(clonedObject)

            delete this.activeSubmissions[url]
          } else {
            const submission = this.activeSubmissions[url]
            submission.lastRun = workflowStatus
            submission.lastChecked = Date.now()
          }
          updated = true
        } catch (error) {
          console.error(`Error checking workflow status for ${url}:`, error)
        }
      }

      // If error and older than 10 minutes, remove anyway
      if (timeDiff > 10 * 60 * 1000) {
        console.log(`Workflow ${submission.commitSha} been there for more than 10 min, removing from tracking`)
        delete this.activeSubmissions[url]
        updated = true
      }
    }

    if (updated) this.saveActiveSubmissions()

    submissionsRemoved.forEach((submission) => {
      let message = "Operation is now complete, refresh the page to view updated content"
      if (submission.operation === "new_post") {
        message = "New post operation is now complete, refresh the page to view updated content"
      } else if (submission.operation === "edit_post") {
        message = "Edit post operation is now complete, refresh the page to view updated content"
      } else if (submission.operation === "delete_post") {
        message = "Delete post operation is now complete, refresh the page to view updated content"
      }
      this.showCompletionNotification(message)
    })
  }

  // TODO - there should be a container to which multiple notification should be stacked on the top
  showCompletionNotification(message) {
    const notification = document.createElement("div")
    notification.className = "completion-notification"
    notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #3498db;
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    max-width: 600px;
    min-width: 400px;
    font-size: 14px;
    line-height: 1.4;
  `
    notification.textContent = message

    document.body.appendChild(notification)
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

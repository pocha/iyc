/**
 * Workflow Tracker - Submission Progress Tracking
 * Prevents users from making multiple simultaneous submissions
 * while their previous submission is being processed
 */

class WorkflowTracker {
  constructor() {
    this.activeSubmissions = this.getActiveSubmissions();
    this.init();
  }

  init() {
    this.checkAndUpdateUI();
    this.setupPeriodicCheck();
  }

  // Get active submissions from localStorage
  getActiveSubmissions() {
    const active = localStorage.getItem('activeSubmissions');
    return active ? JSON.parse(active) : {};
  }

  // Save active submissions to localStorage
  saveActiveSubmissions() {
    localStorage.setItem('activeSubmissions', JSON.stringify(this.activeSubmissions));
  }

  // Track a new submission
  trackSubmission(type, identifier, workflowId) {
    const key = `${type}_${identifier}`;
    this.activeSubmissions[key] = {
      type: type, // 'post' or 'edit'
      identifier: identifier, // post slug for edits, 'new' for new posts
      workflowId: workflowId,
      timestamp: Date.now()
    };
    this.saveActiveSubmissions();
    this.updateUI();
  }

  // Remove completed submission
  removeSubmission(type, identifier) {
    const key = `${type}_${identifier}`;
    delete this.activeSubmissions[key];
    this.saveActiveSubmissions();
    this.updateUI();
  }

  // Check if submission is active
  isSubmissionActive(type, identifier) {
    const key = `${type}_${identifier}`;
    return this.activeSubmissions.hasOwnProperty(key);
  }

  // Update UI based on active submissions
  updateUI() {
    this.updateNewPostForm();
    this.updateEditLinks();
  }

  // Update new post form
  updateNewPostForm() {
    const postForm = document.getElementById('postForm');
    const submitButton = document.getElementById('submitBtn');
    const notification = document.getElementById('submission-notification');
    
    if (!postForm) return;

    const hasActivePostSubmission = this.isSubmissionActive('post', 'new');

    if (hasActivePostSubmission) {
      // Grey out form
      postForm.style.opacity = '0.5';
      postForm.style.pointerEvents = 'none';
      
      // Disable submit button
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Submission in Progress...';
      }

      // Show notification
      this.showNotification('A new post submission is already in progress. Please wait for it to complete.');
    } else {
      // Enable form
      postForm.style.opacity = '1';
      postForm.style.pointerEvents = 'auto';
      
      // Enable submit button
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Post';
      }

      // Hide notification
      this.hideNotification();
    }
  }

  // Update edit links
  updateEditLinks() {
    const editLinks = document.querySelectorAll('a[href*="/edit/"]');
    
    editLinks.forEach(link => {
      const href = link.getAttribute('href');
      const postSlug = href.split('/edit/')[1];
      
      if (this.isSubmissionActive('edit', postSlug)) {
        // Grey out edit link
        link.style.opacity = '0.5';
        link.style.pointerEvents = 'none';
        link.style.cursor = 'not-allowed';
        
        // Add tooltip or indication
        link.title = 'Edit submission in progress for this post';
      } else {
        // Enable edit link
        link.style.opacity = '1';
        link.style.pointerEvents = 'auto';
        link.style.cursor = 'pointer';
        link.title = '';
      }
    });
  }

  // Show notification
  showNotification(message) {
    let notification = document.getElementById('submission-notification');
    
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'submission-notification';
      notification.className = 'fixed top-4 right-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
    }
    
    notification.innerHTML = `
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3">
          <p class="text-sm">${message}</p>
        </div>
      </div>
    `;
    
    notification.style.display = 'block';
  }

  // Hide notification
  hideNotification() {
    const notification = document.getElementById('submission-notification');
    if (notification) {
      notification.style.display = 'none';
    }
  }

  // Check workflow status and update submissions
  async checkWorkflowStatus() {
    for (const [key, submission] of Object.entries(this.activeSubmissions)) {
      try {
        // Check if submission is older than 10 minutes (timeout)
        if (Date.now() - submission.timestamp > 10 * 60 * 1000) {
          console.log(`Submission ${key} timed out, removing from tracking`);
          delete this.activeSubmissions[key];
          continue;
        }

        // Here you would typically check the GitHub Actions workflow status
        // For now, we'll implement a simple timeout-based cleanup
        // In a real implementation, you'd call the GitHub API to check workflow status
        
      } catch (error) {
        console.error(`Error checking workflow status for ${key}:`, error);
      }
    }
    
    this.saveActiveSubmissions();
    this.updateUI();
  }

  // Setup periodic checking
  setupPeriodicCheck() {
    // Check every 30 seconds
    setInterval(() => {
      this.checkWorkflowStatus();
    }, 30000);
  }

  // Check and update UI on page load
  checkAndUpdateUI() {
    // Clean up old submissions on page load
    const now = Date.now();
    let updated = false;
    
    for (const [key, submission] of Object.entries(this.activeSubmissions)) {
      // Remove submissions older than 10 minutes
      if (now - submission.timestamp > 10 * 60 * 1000) {
        delete this.activeSubmissions[key];
        updated = true;
      }
    }
    
    if (updated) {
      this.saveActiveSubmissions();
    }
    
    this.updateUI();
  }
}

// Initialize workflow tracker when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  window.workflowTracker = new WorkflowTracker();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorkflowTracker;
}

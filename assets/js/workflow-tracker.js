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

  // Public method to add submission entry (alias for trackSubmission)
  addSubmission(type, identifier, workflowId) {
    return this.trackSubmission(type, identifier, workflowId);
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
    this.blockEditPostForm();
  }

  // Generic function to block/unblock a form
  blockForm(formElement, submitButton, isBlocked, blockMessage, enabledButtonText, blockedButtonText) {
    if (!formElement) return;

    if (isBlocked) {
      // Grey out form
      formElement.style.opacity = '0.5';
      formElement.style.pointerEvents = 'none';
      
      // Disable submit button
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = blockedButtonText;
      }

      // Show notification
      this.showNotification(blockMessage);
    } else {
      // Enable form
      formElement.style.opacity = '1';
      formElement.style.pointerEvents = 'auto';
      
      // Enable submit button
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = enabledButtonText;
      }

      // Hide notification
      this.hideNotification();
    }
  }

  // Update new post form
  updateNewPostForm() {
    const postForm = document.getElementById('postForm');
    const submitButton = document.getElementById('submitBtn');
    
    const hasActivePostSubmission = this.isSubmissionActive('post', 'new');

    this.blockForm(
      postForm,
      submitButton,
      hasActivePostSubmission,
      'A new post submission is already in progress. Please wait for it to complete.',
      'Submit Post',
      'Submission in Progress...'
    );
  }

  // Block edit post form on edit page
  blockEditPostForm() {
    // Check if we're on an edit page
    const currentPath = window.location.pathname;
    const editMatch = currentPath.match(/\/edit\/(.+)/);
    
    if (editMatch) {
      const postSlug = editMatch[1];
      const editForm = document.getElementById('editForm') || document.getElementById('postForm');
      const submitButton = document.getElementById('updateBtn') || document.getElementById('submitBtn');
      
      const hasActiveEditSubmission = this.isSubmissionActive('edit', postSlug);

      this.blockForm(
        editForm,
        submitButton,
        hasActiveEditSubmission,
        'An edit submission is already in progress for this post. Please wait for it to complete.',
        'Update Post',
        'Edit in Progress...'
      );
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

  // Query GitHub workflow status
  async queryWorkflowStatus(workflowId) {
    try {
      // This would typically call your backend API that checks GitHub Actions
      // For now, returning a placeholder - you'll need to implement the actual API call
      const response = await fetch(`/api/workflow-status/${workflowId}`);
      if (response.ok) {
        const data = await response.json();
        return data.status; // 'completed', 'in_progress', 'failed', etc.
      }
      return null;
    } catch (error) {
      console.error(`Error querying workflow status for ${workflowId}:`, error);
      return null;
    }
  }

  // Check and update UI on page load
  async checkAndUpdateUI() {
    const now = Date.now();
    let updated = false;
    
    for (const [key, submission] of Object.entries(this.activeSubmissions)) {
      const timeDiff = now - submission.timestamp;
      
      // If submission is older than 2 minutes, query workflow status
      if (timeDiff > 2 * 60 * 1000) {
        try {
          const status = await this.queryWorkflowStatus(submission.workflowId);
          
          // If workflow is completed or failed, remove from tracking
          if (status === 'completed' || status === 'failure' || status === 'cancelled') {
            console.log(`Workflow ${submission.workflowId} completed with status: ${status}`);
            delete this.activeSubmissions[key];
            updated = true;
          }
          // If we can't get status and it's older than 10 minutes, assume it's done
          else if (status === null && timeDiff > 10 * 60 * 1000) {
            console.log(`Workflow ${submission.workflowId} timed out, removing from tracking`);
            delete this.activeSubmissions[key];
            updated = true;
          }
        } catch (error) {
          console.error(`Error checking workflow status for ${key}:`, error);
          // If error and older than 10 minutes, remove anyway
          if (timeDiff > 10 * 60 * 1000) {
            delete this.activeSubmissions[key];
            updated = true;
          }
        }
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

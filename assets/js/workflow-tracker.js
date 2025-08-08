class WorkflowTracker {
  constructor() {
    this.activeSubmissions = this.loadActiveSubmissions();
    this.checkAndApplyPageRestrictions();
  }

  // Load active submissions from localStorage
  loadActiveSubmissions() {
    try {
      const stored = localStorage.getItem('activeSubmissions');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Error loading active submissions:', error);
      return {};
    }
  }

  // Save active submissions to localStorage
  saveActiveSubmissions() {
    try {
      localStorage.setItem('activeSubmissions', JSON.stringify(this.activeSubmissions));
    } catch (error) {
      console.error('Error saving active submissions:', error);
    }
  }

  // Track a new submission
  trackSubmission(type, identifier, workflowId) {
    const key = `${type}_${identifier}`;
    this.activeSubmissions[key] = {
      type: type,
      identifier: identifier,
      workflowId: workflowId,
      timestamp: Date.now()
    };
    this.saveActiveSubmissions();
    console.log(`Tracking submission: ${key} with workflow ${workflowId}`);
  }

  // Remove a submission from tracking
  removeSubmission(type, identifier) {
    const key = `${type}_${identifier}`;
    if (this.activeSubmissions[key]) {
      delete this.activeSubmissions[key];
      this.saveActiveSubmissions();
      console.log(`Removed submission tracking: ${key}`);
    }
  }

  // Check if a submission is active
  isSubmissionActive(type, identifier) {
    const key = `${type}_${identifier}`;
    return this.activeSubmissions.hasOwnProperty(key);
  }

  // Check current page and apply restrictions based on active submissions
  async checkAndApplyPageRestrictions() {
    const currentPath = window.location.pathname;
    
    // Iterate through each active submission to see if current URL is affected
    for (const [key, submission] of Object.entries(this.activeSubmissions)) {
      const { type, identifier } = submission;
      
      // Check if current page matches any active submission
      if (type === 'post' && identifier === 'new') {
        // Check if this is the new post page
        if (currentPath === '/' || currentPath.includes('submit') || currentPath.includes('new')) {
          this.handleNewPostPage();
        }
      } else if (type === 'edit') {
        // Check if this is the edit page for this specific post
        const editMatch = currentPath.match(/\/edit\/(.+)/);
        if (editMatch && editMatch[1] === identifier) {
          this.handleEditPage(identifier);
        }
        
        // Also check if this is the post view page with edit links
        const postMatch = currentPath.match(/\/([^\/]+)$/);
        if (postMatch && postMatch[1] === identifier && !currentPath.includes('/edit/')) {
          this.handlePostViewPage(identifier);
        }
      }
    }
    
    // Clean up old submissions at the end
    await this.cleanupOldSubmissions();
  }

  // Handle new post page restrictions
  handleNewPostPage() {
    const postForm = document.getElementById('postForm');
    const submitButton = document.getElementById('submitBtn');
    
    this.blockForm(
      postForm,
      submitButton,
      'A new post submission is already in progress. Please wait for it to complete.',
      'Submit Post',
      'Submission in Progress...'
    );
  }

  // Handle edit page restrictions
  handleEditPage(postSlug) {
    const editForm = document.getElementById('editForm') || document.getElementById('postForm');
    const submitButton = document.getElementById('updateBtn') || document.getElementById('submitBtn');
    
    this.blockForm(
      editForm,
      submitButton,
      'An edit submission is already in progress for this post. Please wait for it to complete.',
      'Update Post',
      'Edit in Progress...'
    );
  }

  // Handle post view page - grey out edit links if edit is in progress
  handlePostViewPage(postSlug) {
    const editLinks = document.querySelectorAll(`a[href*="/edit/${postSlug}"]`);
    
    editLinks.forEach(link => {
      link.style.opacity = '0.5';
      link.style.pointerEvents = 'none';
      link.style.cursor = 'not-allowed';
      
      // Add tooltip or notification
      link.title = 'Edit is currently in progress for this post';
    });
    
    // Show notification
    this.showNotification('An edit is currently in progress for this post.');
  }

  // Block form elements
  blockForm(form, submitButton, message, originalText, progressText) {
    if (form) {
      form.style.opacity = '0.5';
      form.style.pointerEvents = 'none';
    }
    
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = progressText;
      submitButton.style.cursor = 'not-allowed';
    }
    
    this.showNotification(message);
  }

  // Show notification to user
  showNotification(message) {
    // Remove existing notification if any
    const existing = document.getElementById('workflow-notification');
    if (existing) {
      existing.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'workflow-notification';
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
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 10000);
  }

  // Check workflow status (placeholder for future implementation)
  async checkWorkflowStatus(workflowId) {
    // This would typically make an API call to check if the workflow is still running
    // For now, return a simple timeout-based check
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ completed: false, timedOut: false });
      }, 1000);
    });
  }

  // Clean up old submissions
  async cleanupOldSubmissions() {
    const now = Date.now();
    let updated = false;
    
    for (const [key, submission] of Object.entries(this.activeSubmissions)) {
      const timeDiff = now - submission.timestamp;
      
      // Remove submissions older than 10 minutes
      if (timeDiff > 10 * 60 * 1000) {
        try {
          const status = await this.checkWorkflowStatus(submission.workflowId);
          if (status.completed || status.timedOut) {
            console.log(`Workflow ${submission.workflowId} completed/timed out, removing from tracking`);
            delete this.activeSubmissions[key];
            updated = true;
          }
        } catch (error) {
          console.error(`Error checking workflow status for ${key}:`, error);
          // If error and older than 10 minutes, remove anyway
          if (timeDiff > 10 * 60 * 1000) {
            console.log(`Workflow ${submission.workflowId} timed out, removing from tracking`);
            delete this.activeSubmissions[key];
            updated = true;
          }
        }
      }
    }
    
    if (updated) {
      this.saveActiveSubmissions();
    }
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

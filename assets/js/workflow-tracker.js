/**
 * Workflow Tracker - User Blocking Functionality
 * Handles blocking/unblocking users and filtering content
 */

class WorkflowTracker {
  constructor() {
    this.blockedUsers = this.getBlockedUsers();
    this.init();
  }

  init() {
    this.addBlockButtons();
    this.filterBlockedContent();
    this.setupEventListeners();
  }

  // Get blocked users from localStorage
  getBlockedUsers() {
    const blocked = localStorage.getItem('blockedUsers');
    return blocked ? JSON.parse(blocked) : [];
  }

  // Save blocked users to localStorage
  saveBlockedUsers() {
    localStorage.setItem('blockedUsers', JSON.stringify(this.blockedUsers));
  }

  // Block a user
  blockUser(username) {
    if (!this.blockedUsers.includes(username)) {
      this.blockedUsers.push(username);
      this.saveBlockedUsers();
      this.filterBlockedContent();
      this.updateBlockButtons();
      console.log(`User ${username} has been blocked`);
    }
  }

  // Unblock a user
  unblockUser(username) {
    const index = this.blockedUsers.indexOf(username);
    if (index > -1) {
      this.blockedUsers.splice(index, 1);
      this.saveBlockedUsers();
      this.filterBlockedContent();
      this.updateBlockButtons();
      console.log(`User ${username} has been unblocked`);
    }
  }

  // Check if user is blocked
  isUserBlocked(username) {
    return this.blockedUsers.includes(username);
  }

  // Add block/unblock buttons to posts and comments
  addBlockButtons() {
    // Add buttons to posts
    const postAuthors = document.querySelectorAll('.post-author, .author-name');
    postAuthors.forEach(authorElement => {
      const username = this.extractUsername(authorElement);
      if (username && !authorElement.querySelector('.block-btn')) {
        this.addBlockButton(authorElement, username);
      }
    });

    // Add buttons to comments
    const commentAuthors = document.querySelectorAll('.comment-author');
    commentAuthors.forEach(authorElement => {
      const username = this.extractUsername(authorElement);
      if (username && !authorElement.querySelector('.block-btn')) {
        this.addBlockButton(authorElement, username);
      }
    });
  }

  // Extract username from author element
  extractUsername(element) {
    return element.textContent.trim().replace(/^By\s+/, '');
  }

  // Add block button to an author element
  addBlockButton(authorElement, username) {
    const isBlocked = this.isUserBlocked(username);
    const button = document.createElement('button');
    button.className = `block-btn ml-2 px-2 py-1 text-xs rounded ${
      isBlocked 
        ? 'bg-green-500 hover:bg-green-600 text-white' 
        : 'bg-red-500 hover:bg-red-600 text-white'
    }`;
    button.textContent = isBlocked ? 'Unblock' : 'Block';
    button.dataset.username = username;
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isBlocked) {
        this.unblockUser(username);
      } else {
        this.blockUser(username);
      }
    });

    authorElement.appendChild(button);
  }

  // Update all block buttons
  updateBlockButtons() {
    const blockButtons = document.querySelectorAll('.block-btn');
    blockButtons.forEach(button => {
      const username = button.dataset.username;
      const isBlocked = this.isUserBlocked(username);
      
      button.textContent = isBlocked ? 'Unblock' : 'Block';
      button.className = `block-btn ml-2 px-2 py-1 text-xs rounded ${
        isBlocked 
          ? 'bg-green-500 hover:bg-green-600 text-white' 
          : 'bg-red-500 hover:bg-red-600 text-white'
      }`;
    });
  }

  // Filter blocked content
  filterBlockedContent() {
    // Hide posts from blocked users
    const posts = document.querySelectorAll('.post-item, .post-container, article');
    posts.forEach(post => {
      const authorElement = post.querySelector('.post-author, .author-name');
      if (authorElement) {
        const username = this.extractUsername(authorElement);
        if (username && this.isUserBlocked(username)) {
          post.style.display = 'none';
          post.classList.add('blocked-content');
        } else {
          post.style.display = '';
          post.classList.remove('blocked-content');
        }
      }
    });

    // Hide comments from blocked users
    const comments = document.querySelectorAll('.comment, .comment-item');
    comments.forEach(comment => {
      const authorElement = comment.querySelector('.comment-author');
      if (authorElement) {
        const username = this.extractUsername(authorElement);
        if (username && this.isUserBlocked(username)) {
          comment.style.display = 'none';
          comment.classList.add('blocked-content');
        } else {
          comment.style.display = '';
          comment.classList.remove('blocked-content');
        }
      }
    });
  }

  // Setup event listeners for dynamic content
  setupEventListeners() {
    // Observer for dynamically added content
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if new posts or comments were added
              if (node.matches('.post-item, .comment, article') || 
                  node.querySelector('.post-author, .comment-author')) {
                setTimeout(() => {
                  this.addBlockButtons();
                  this.filterBlockedContent();
                }, 100);
              }
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Get blocked users list (for admin/debugging)
  getBlockedUsersList() {
    return [...this.blockedUsers];
  }

  // Clear all blocked users (for admin/debugging)
  clearAllBlocks() {
    this.blockedUsers = [];
    this.saveBlockedUsers();
    this.filterBlockedContent();
    this.updateBlockButtons();
    console.log('All user blocks have been cleared');
  }
}

// Initialize workflow tracker when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.workflowTracker = new WorkflowTracker();
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorkflowTracker;
}

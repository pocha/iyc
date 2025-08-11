async function submitCommentForm(formData, imageElementId, operation) {
  const imageInput = document.getElementById(imageElementId)
  if (!imageInput.files || imageInput.files.length === 0 || imageInput.files[0].size === 0) {
    formData.delete("image")
  }

  const response = await fetch(`${window.firebaseUrl}/submitComment`, {
    method: "POST",
    body: formData,
  })

  const result = await response.json()

  if (result.success) {
    if (window.workflowTracker && result.commitSha) {
      window.workflowTracker.trackSubmission(
        window.location.href,
        "{{ page.slug }}",
        operation,
        data.commitSha,
        Date.now()
      )
    }
  }

  return result
}

document.getElementById("commentForm").addEventListener("submit", async function (e) {
  e.preventDefault()

  const statusDiv = document.getElementById("commentStatus")
  const submitBtn = e.target.querySelector('button[type="submit"]')

  // Show loading state
  submitBtn.disabled = true
  submitBtn.textContent = "Submitting..."
  statusDiv.textContent = "Submitting your comment..."
  statusDiv.className = "text-sm text-blue-600"

  const formData = new FormData(e.target)

  // Add user cookie (create one if user doesn't have one)
  const userCookie = getOrSetUserCookie()
  formData.append("userCookie", userCookie)

  try {
    const result = await submitCommentForm(formData, "image", "new_comment")

    if (result.success) {
      statusDiv.textContent = "Comment submitted successfully! It will appear after the site rebuilds."
      statusDiv.className = "text-sm text-green-600"
      e.target.reset() // Clear the form
    } else {
      throw new Error(result.error || "Failed to submit comment")
    }
  } catch (error) {
    console.error("Error submitting comment:", error)
    statusDiv.textContent = "Error submitting comment: " + error.message
    statusDiv.className = "text-sm text-red-600"
  } finally {
    // Reset button state
    submitBtn.disabled = false
    submitBtn.textContent = "Submit Comment"
  }
})

// Comment ownership and edit/delete functionality
function revealCommentActionsIfRequired() {
  const userCookie = getCookie()
  if (!userCookie) return

  const commentActions = document.querySelectorAll(".comment-owner-actions")
  commentActions.forEach((action) => {
    const commentUserCookie = action.getAttribute("data-user-cookie")
    if (commentUserCookie === userCookie) {
      action.style.display = "block"
    }
  })
}

document.getElementById("editCommentForm").addEventListener("submit", async function (e) {
  e.preventDefault()

  const statusDiv = document.getElementById("editCommentStatus")
  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalBtnText = submitBtn.innerHTML

  // Show loading state
  submitBtn.innerHTML =
    '<svg class="w-4 h-4 inline mr-1 animate-spin" fill="currentColor" viewBox="0 0 20 20"><path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4z"></path></svg>Updating...'
  submitBtn.disabled = true
  statusDiv.className = "mb-4 hidden"

  const formData = new FormData(e.target)

  // Add user cookie
  const userCookie = getCookie()
  if (userCookie) {
    formData.append("userCookie", userCookie)
  }

  try {
    const data = await submitCommentForm(formData, "editCommentImage", "edit_comment")

    if (data.success) {
      statusDiv.innerHTML =
        '<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">Comment updated successfully! The page will refresh shortly.</div>'
      statusDiv.className = "mb-4"

      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } else {
      throw new Error(data.error || "Failed to update comment")
    }
  } catch (error) {
    console.error("Error updating comment:", error)
    statusDiv.innerHTML = `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">Error: ${error.message}</div>`
    statusDiv.className = "mb-4"

    // Restore button
    submitBtn.innerHTML = originalBtnText
    submitBtn.disabled = false
  }
})

// Edit comment functionality
function showEditCommentPopup(commentId, commentText, commentImage) {
  const modal = document.getElementById("editCommentModal")
  const commentIdInput = document.getElementById("editCommentId")
  const commentTextArea = document.getElementById("editCommentText")
  const currentImageDiv = document.getElementById("currentCommentImage")
  const currentImagePreview = document.getElementById("currentCommentImagePreview")

  // Set form values
  commentIdInput.value = commentId
  commentTextArea.value = commentText

  // Handle current image
  if (commentImage && commentImage.trim() !== "") {
    currentImageDiv.classList.remove("hidden")
    currentImagePreview.src = commentImage
  } else {
    currentImageDiv.classList.add("hidden")
  }

  // Update URL
  const url = new URL(window.location)
  url.searchParams.set("editComment", commentId)
  window.history.pushState({}, "", url)

  // Show modal
  modal.classList.remove("hidden")
}

// Delete comment functionality
function handleDeleteComment(commentId) {
  if (!confirm("Are you sure you want to delete this comment? This action cannot be undone.")) {
    return
  }

  // Find the comment element and show loading state
  const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`)
  const deleteBtn = commentElement.querySelector(".delete-comment-btn")
  const originalText = deleteBtn.innerHTML
  deleteBtn.innerHTML =
    '<svg class="w-3 h-3 inline mr-1 animate-spin" fill="currentColor" viewBox="0 0 20 20"><path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4z"></path></svg>Deleting...'
  deleteBtn.disabled = true
  fetch(`${window.firebaseUrl}/deleteContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      postSlug: "{{ page.slug }}",
      postDate: postDate,
      commentId: commentId,
      userCookie: getCookie(),
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        if (window.workflowTracker && data.commitSha) {
          window.workflowTracker.trackSubmission(
            window.location.href,
            "{{ page.slug }}",
            "delete_comment",
            data.commitSha,
            Date.now()
          )
        }

        // Remove comment from DOM
        commentElement.remove()
        alert("Comment deleted successfully!")
      } else {
        throw new Error(data.error || "Failed to delete comment")
      }
    })
    .catch((error) => {
      console.error("Error deleting comment:", error)
      alert("Error deleting comment: " + error.message)
      // Restore button state
      deleteBtn.innerHTML = originalText
      deleteBtn.disabled = false
    })
}

// Event listeners for comment actions
document.addEventListener("click", function (e) {
  if (e.target.closest(".edit-comment-btn")) {
    const btn = e.target.closest(".edit-comment-btn")
    const commentId = btn.getAttribute("data-comment-id")
    const postDate = btn.getAttribute("data-post-date")
    const commentText = btn.getAttribute("data-comment-text")
    const commentImage = btn.getAttribute("data-comment-image")
    showEditCommentPopup(commentId, commentText, commentImage)
  }

  if (e.target.closest(".delete-comment-btn")) {
    const btn = e.target.closest(".delete-comment-btn")
    const commentId = btn.getAttribute("data-comment-id")
    const postDate = btn.getAttribute("data-post-date")
    handleDeleteComment(commentId)
  }
})

// Modal close functionality
document.getElementById("closeEditCommentModal").addEventListener("click", function () {
  document.getElementById("editCommentModal").classList.add("hidden")
  // Remove URL parameter
  const url = new URL(window.location)
  url.searchParams.delete("editComment")
  window.history.pushState({}, "", url)
})

document.getElementById("cancelEditComment").addEventListener("click", function () {
  document.getElementById("editCommentModal").classList.add("hidden")
  // Remove URL parameter
  const url = new URL(window.location)
  url.searchParams.delete("editComment")
  window.history.pushState({}, "", url)
})

// Edit comment form submission

// Check URL for direct edit comment access
function checkEditCommentFromURL() {
  const urlParams = new URLSearchParams(window.location.search)
  const editCommentId = urlParams.get("editComment")

  if (editCommentId) {
    // Find the comment and trigger edit
    const commentElement = document.querySelector(`[data-comment-id="${editCommentId}"]`)
    if (commentElement) {
      const editBtn = commentElement.querySelector(".edit-comment-btn")
      if (editBtn && editBtn.closest(".comment-owner-actions").style.display !== "none") {
        const commentText = editBtn.getAttribute("data-comment-text")
        const commentImage = editBtn.getAttribute("data-comment-image")
        showEditCommentPopup(editCommentId, commentText, commentImage)
      }
    }
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // Initialize comment functionality
  revealCommentActionsIfRequired()
  checkEditCommentFromURL()
})

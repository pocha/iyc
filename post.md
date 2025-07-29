---
layout: default
title: Create New Post
permalink: /post/
---

<div class="max-w-4xl mx-auto p-6">
    <div class="bg-white rounded-lg shadow-lg p-8">
        <h1 class="text-3xl font-bold text-orange-600 mb-8">Create New Post</h1>
        
        <form id="postForm" class="space-y-6">
            <div>
                <label for="title" class="block text-sm font-medium text-gray-700 mb-2">
                    Title *
                </label>
                <input 
                    type="text" 
                    id="title" 
                    name="title" 
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Enter your post title"
                >
            </div>

            <div>
                <label for="description" class="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                </label>
                <textarea 
                    id="description" 
                    name="description" 
                    rows="6"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Enter your post description"
                ></textarea>
            </div>

            <div>
                <label for="file" class="block text-sm font-medium text-gray-700 mb-2">
                    Attachment (Optional)
                </label>
                <input 
                    type="file" 
                    id="file" 
                    name="file"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                >
                <p class="mt-1 text-sm text-gray-500">
                    Optional: Upload an image, PDF, or document (max 10MB)
                </p>
            </div>

            <div class="flex items-center justify-between">
                <button 
                    type="submit" 
                    id="submitBtn"
                    class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-6 rounded-md transition duration-200 ease-in-out transform hover:scale-105"
                >
                    Submit Post
                </button>
                
                <a 
                    href="/" 
                    class="text-gray-600 hover:text-gray-800 font-medium"
                >
                    Back to Forum
                </a>
            </div>
        </form>

        <!-- Status Messages -->
        <div id="statusMessage" class="mt-6 hidden">
            <div id="successMessage" class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded hidden">
                <strong>Success!</strong> <span id="successText"></span>
            </div>
            <div id="errorMessage" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded hidden">
                <strong>Error!</strong> <span id="errorText"></span>
            </div>
        </div>

        <!-- Loading Indicator -->
        <div id="loadingIndicator" class="mt-6 text-center hidden">
            <div class="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-orange-600 bg-orange-100">
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting your post...
            </div>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('postForm');
    const submitBtn = document.getElementById('submitBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const statusMessage = document.getElementById('statusMessage');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const successText = document.getElementById('successText');
    const errorText = document.getElementById('errorText');

    // Firebase function URL
    const FIREBASE_FUNCTION_URL = 'https://asia-south1-iyc-forum.cloudfunctions.net/submitForm';

    function showLoading() {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        loadingIndicator.classList.remove('hidden');
        statusMessage.classList.add('hidden');
        successMessage.classList.add('hidden');
        errorMessage.classList.add('hidden');
    }

    function hideLoading() {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Post';
        loadingIndicator.classList.add('hidden');
    }

    function showSuccess(message) {
        hideLoading();
        successText.textContent = message;
        successMessage.classList.remove('hidden');
        statusMessage.classList.remove('hidden');
        
        // Scroll to success message
        statusMessage.scrollIntoView({ behavior: 'smooth' });
    }

    function showError(message) {
        hideLoading();
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        statusMessage.classList.remove('hidden');
        
        // Scroll to error message
        statusMessage.scrollIntoView({ behavior: 'smooth' });
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        showLoading();

        try {
            const formData = new FormData();
            const title = document.getElementById('title').value.trim();
            const description = document.getElementById('description').value.trim();
            const fileInput = document.getElementById('file');

            // Validate required fields
            if (!title || !description) {
                showError('Please fill in all required fields (Title and Description).');
                return;
            }

            // Add form data
            formData.append('title', title);
            formData.append('description', description);

            // Only append file if one is selected
            if (fileInput.files.length > 0 && fileInput.files[0].size > 0) {
                formData.append('file', fileInput.files[0]);
                console.log('File attached:', fileInput.files[0].name, 'Size:', fileInput.files[0].size);
            } else {
                console.log('No file attached');
            }

            console.log('Submitting form to:', FIREBASE_FUNCTION_URL);

            const response = await fetch(FIREBASE_FUNCTION_URL, {
                method: 'POST',
                body: formData,
                mode: 'cors'
            });

            console.log('Response status:', response.status);
            
            const result = await response.json();
            console.log('Response data:', result);

            if (result.success) {
                showSuccess(`Your post "${title}" has been submitted successfully! It will appear on the forum shortly.`);
                
                // Reset form
                form.reset();
                
                // Optionally redirect after a delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 3000);
            } else {
                showError(result.error || 'An error occurred while submitting your post. Please try again.');
            }

        } catch (error) {
            console.error('Form submission error:', error);
            showError('Network error occurred. Please check your connection and try again.');
        }
    });
});
</script>

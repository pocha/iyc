---
layout: default
title: Create New Post
---

<div class="max-w-4xl mx-auto">
    <!-- Page Header -->
    <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-orange-600 mb-4">
            ✨ Share Your Ideas ✨
        </h1>
        <p class="text-xl text-gray-600">
            Create a new post and share your thoughts with the community
        </p>
    </div>

    <!-- Form Container -->
    <div class="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <form id="submissionForm" class="space-y-6">
            <!-- Title Field -->
            <div class="group">
                <label for="title" class="block text-gray-800 text-lg font-semibold mb-2">
                    🎯 Post Title
                </label>
                <input
                    type="text"
                    id="title"
                    name="title"
                    required
                    class="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:bg-white transition-all duration-300 text-lg"
                    placeholder="Enter your post title..."
                >
            </div>

            <!-- Description Field -->
            <div class="group">
                <label for="description" class="block text-gray-800 text-lg font-semibold mb-2">
                    📝 Description
                </label>
                <textarea
                    id="description"
                    name="description"
                    required
                    rows="6"
                    class="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:bg-white transition-all duration-300 text-lg resize-none"
                    placeholder="Share your thoughts, ideas, or questions with the community..."
                ></textarea>
            </div>

            <!-- File Upload Field -->
            <div class="group">
                <label for="file" class="block text-gray-800 text-lg font-semibold mb-2">
                    📎 Attach File (Optional)
                </label>
                <div class="file-upload-area bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:bg-gray-100 hover:border-orange-400 transition-all duration-300">
                    <input
                        type="file"
                        id="file"
                        name="file"
                        class="hidden"
                        accept="*/*"
                    >
                    <div id="fileUploadContent">
                        <div class="text-5xl mb-4 text-gray-400">📁</div>
                        <p class="text-gray-700 text-lg font-semibold mb-2">Drop your file here or click to browse</p>
                        <p class="text-gray-500">Any file type accepted</p>
                    </div>
                    <div id="fileSelectedContent" class="hidden">
                        <div class="text-5xl mb-4 text-green-500">✅</div>
                        <p class="text-gray-700 text-lg font-semibold mb-2">File Selected:</p>
                        <p id="fileName" class="text-orange-600 text-lg font-medium"></p>
                    </div>
                </div>
            </div>

            <!-- Submit Button -->
            <div class="pt-4 flex gap-4">
                <button
                    type="submit"
                    id="submitBtn"
                    class="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-xl text-lg shadow-lg transform hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-orange-300"
                >
                    <span id="submitText">🚀 Create Post</span>
                    <span id="loadingText" class="hidden">⏳ Creating...</span>
                </button>
                <a href="/" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-4 px-8 rounded-xl text-lg text-center transition-all duration-300">
                    Cancel
                </a>
            </div>
        </form>

        <!-- Success Message -->
        <div id="successMessage" class="hidden mt-6 p-6 bg-green-100 border-2 border-green-400 rounded-xl text-center">
            <div class="text-4xl mb-2">🎉</div>
            <p class="text-green-800 text-xl font-semibold">Post Created Successfully!</p>
            <p class="text-green-700">Your post has been submitted to the community.</p>
        </div>

        <!-- Error Message -->
        <div id="errorMessage" class="hidden mt-6 p-6 bg-red-100 border-2 border-red-400 rounded-xl text-center">
            <div class="text-4xl mb-2">❌</div>
            <p class="text-red-800 text-xl font-semibold">Submission Failed</p>
            <p id="errorText" class="text-red-700">Please try again later.</p>
        </div>
    </div>

</div>

<script>
    // Firebase Function URL - Replace with your actual Firebase function URL
    const FIREBASE_FUNCTION_URL = 'https://asia-south1-isocnet-2d37f.cloudfunctions.net/submitForm';

    // File upload handling
    const fileInput = document.getElementById('file');
    const fileUploadArea = document.querySelector('.file-upload-area');
    const fileUploadContent = document.getElementById('fileUploadContent');
    const fileSelectedContent = document.getElementById('fileSelectedContent');
    const fileName = document.getElementById('fileName');

    // Click to upload
    fileUploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // File selection
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            fileName.textContent = file.name;
            fileUploadContent.classList.add('hidden');
            fileSelectedContent.classList.remove('hidden');
        }
    });

    // Drag and drop functionality
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('border-orange-500', 'bg-orange-50');
    });

    fileUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('border-orange-500', 'bg-orange-50');
    });

    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('border-orange-500', 'bg-orange-50');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            const file = files[0];
            fileName.textContent = file.name;
            fileUploadContent.classList.add('hidden');
            fileSelectedContent.classList.remove('hidden');
        }
    });

    // Form submission
    document.getElementById('submissionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const submitText = document.getElementById('submitText');
        const loadingText = document.getElementById('loadingText');
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        
        // Show loading state
        submitBtn.disabled = true;
        submitText.classList.add('hidden');
        loadingText.classList.remove('hidden');
        successMessage.classList.add('hidden');
        errorMessage.classList.add('hidden');

        try {
            // Validate required fields
            const title = document.getElementById('title').value.trim();
            const description = document.getElementById('description').value.trim();
            
            if (!title || !description) {
                throw new Error('Please fill in all required fields');
            }

            const fileInput = document.getElementById('file');
            const hasFile = fileInput.files && fileInput.files.length > 0 && fileInput.files[0];

            let response;
            
            if (hasFile) {
                // If file is attached, use FormData for multipart/form-data
                const formData = new FormData();
                formData.append('title', title);
                formData.append('description', description);
                formData.append('file', fileInput.files[0]);
                
                response = await fetch(FIREBASE_FUNCTION_URL, {
                    method: 'POST',
                    body: formData
                });
            } else {
                // If no file, send as JSON to avoid Multer issues
                response = await fetch(FIREBASE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        title: title,
                        description: description
                    })
                });
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                // Show success message
                successMessage.classList.remove('hidden');
                
                // Reset form after delay
                setTimeout(() => {
                    document.getElementById('submissionForm').reset();
                    successMessage.classList.add('hidden');
                }, 3000);
            } else {
                throw new Error(result.error || 'Submission failed');
            }
            
        } catch (error) {
            console.error('Error submitting post:', error);
            
            // Show error message
            document.getElementById('errorText').textContent = error.message || 'An error occurred while submitting the post';
            errorMessage.classList.remove('hidden');
        } finally {
            // Reset button state
            submitBtn.disabled = false;
            submitText.classList.remove('hidden');
            loadingText.classList.add('hidden');
        }
    });
</script>
            document.getElementById('errorText').textContent = error.message || 'An error occurred while submitting the post';
            errorMessage.classList.remove('hidden');
        } finally {
            // Reset button state
            submitBtn.disabled = false;
            submitText.classList.remove('hidden');
            loadingText.classList.add('hidden');
        }
    });
</script>

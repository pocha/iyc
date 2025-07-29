const functions = require('firebase-functions');
const admin = require('firebase-admin');
const multer = require('multer');
const cors = require('cors');

// Initialize Firebase Admin
admin.initializeApp();

// Configure CORS
const corsHandler = cors({
  origin: true,
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
});

// Configure multer for file uploads (optional files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Cloud Function for form submission with optional file upload
exports.submitForm = functions.region('asia-south1').https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Method not allowed. Only POST requests are accepted.'
      });
    }

    try {
      // Handle both multipart/form-data and JSON requests
      if (req.get('content-type')?.includes('multipart/form-data')) {
        // Handle multipart form data with optional file
        upload.single('file')(req, res, async (err) => {
          if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({
              success: false,
              error: `File upload error: ${err.message}`
            });
          }

          await processFormSubmission(req, res);
        });
      } else if (req.get('content-type')?.includes('application/json')) {
        // Handle JSON requests (no file)
        await processFormSubmission(req, res);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Unsupported content type. Use multipart/form-data or application/json.'
        });
      }
    } catch (error) {
      console.error('Error processing request:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });
});

async function processFormSubmission(req, res) {
  try {
    // Extract form data
    const title = req.body.title;
    const description = req.body.description;
    const file = req.file; // This will be undefined if no file is uploaded

    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required fields.'
      });
    }

    // Prepare submission data
    const submissionData = {
      title: title.trim(),
      description: description.trim(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      hasFile: !!file,
    };

    // Add file information if file is present
    if (file) {
      submissionData.file = {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        // In a real implementation, you would upload the file to Cloud Storage
        // and store the download URL here
        // For now, we'll just store the file info
      };
    }

    // Save to Firestore
    const db = admin.firestore();
    const docRef = await db.collection('forum_posts').add(submissionData);

    console.log('Form submitted successfully:', {
      id: docRef.id,
      title: title,
      hasFile: !!file
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Post submitted successfully!',
      postId: docRef.id,
      hasFile: !!file
    });

  } catch (error) {
    console.error('Error saving to Firestore:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save post. Please try again.'
    });
  }
}

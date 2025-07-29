const functions = require("firebase-functions")
const admin = require("firebase-admin")
const cors = require("cors")
const multer = require("multer")
const { v4: uuidv4 } = require("uuid")
const { Octokit } = require("@octokit/rest")

// Initialize Firebase Admin
admin.initializeApp()

// Configure CORS to allow requests from any origin
const corsHandler = cors({
  origin: ["http://20.42.15.153:4001", "http://localhost:4000", "https://pocha.github.io"],
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
})

// Configure multer for handling multipart/form-data
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types
    cb(null, true)
  },
})

// GitHub configuration - Set these in Firebase Functions config
const GITHUB_TOKEN = functions.config().github?.token || process.env.GITHUB_TOKEN
const GITHUB_OWNER = functions.config().github?.owner || process.env.GITHUB_OWNER
const GITHUB_REPO = functions.config().github?.repo || process.env.GITHUB_REPO
const GITHUB_BRANCH = functions.config().github?.branch || process.env.GITHUB_BRANCH || "main"

// Initialize Octokit
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
})

// Function to create Jekyll post
async function createJekyllPost(title, description, fileName, fileContent, fileType) {
  try {
    const now = new Date()
    const dateStr = now.toISOString().split("T")[0] // YYYY-MM-DD format
    const timeStr = now.toISOString()

    // Create slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim("-")

    // Jekyll post filename format: YYYY-MM-DD-title.md
    const postFileName = `${dateStr}-${slug}.md`
    const postPath = `_posts/${postFileName}`

    // Create Jekyll front matter and content
    let postContent = `---
layout: post
title: "${title}"
date: ${timeStr}
categories: submissions
tags: [user-submission]
author: User Submission
---

${description}

`

    // Only add file section if file exists
    if (fileName && fileContent && fileType) {
      postContent += `
## Attached File

**File Name:** ${fileName}  
**File Type:** ${fileType}  
**Uploaded:** ${timeStr}

`

      // If it's an image, embed it in the post
    if (fileType.startsWith("image/")) {
      // Save image to assets folder
      const imageFileName = `${dateStr}-${slug}-${fileName}`
      const imagePath = `assets/images/submissions/${imageFileName}`

      // Create the image file
      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: imagePath,
        message: `Add image for post: ${title}`,
        content: fileContent, // Base64 content
        branch: GITHUB_BRANCH,
      })

      // Add image to post content
      postContent += `
![${fileName}](/assets/images/submissions/${imageFileName})

`
    } else {
      // For non-image files, create a download link
      const fileFileName = `${dateStr}-${slug}-${fileName}`
      const filePath = `assets/files/submissions/${fileFileName}`

      // Create the file
      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: filePath,
        message: `Add file for post: ${title}`,
        content: fileContent, // Base64 content
        branch: GITHUB_BRANCH,
      })

      // Add download link to post content
      postContent += `
[Download ${fileName}](/assets/files/submissions/${fileFileName})

`
    }

    postContent += `
---
*This post was automatically generated from a user submission.*
`

    // Create the Jekyll post
    const response = await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: postPath,
      message: `New post: ${title}`,
      content: Buffer.from(postContent).toString("base64"),
      branch: GITHUB_BRANCH,
    })

    return {
      success: true,
      postUrl: `https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/${now.getFullYear()}/${String(
        now.getMonth() + 1
      ).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${slug}.html`,
      githubUrl: response.data.content.html_url,
    }
  } catch (error) {
    console.error("Error creating Jekyll post:", error)
    throw error
  }
}

// Main form submission handler
exports.submitForm = functions.region("asia-south1").https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
      res.status(200).send()
      return
    }

    // Only allow POST requests
    if (req.method !== "POST") {
      res.status(405).json({
        success: false,
        error: "Method not allowed. Only POST requests are accepted.",
      })
      return
    }

    try {
      // Check GitHub configuration
      if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
        res.status(500).json({
          success: false,
          error: "GitHub configuration is missing. Please configure GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO.",
        })
        return
      }

      // Use multer middleware to parse multipart form data
      upload.single("file")(req, res, async (err) => {
        if (err) {
          console.error("Multer error:", err)
          res.status(400).json({
            success: false,
            error: "File upload error: " + err.message,
          })
          return
        }

        try {
          // Extract form data
          const { title, description } = req.body
          const file = req.file

          // Validate required fields
          if (!title || !description) {
            res.status(400).json({
              success: false,
              error: "Title and description are required fields.",
            })
            return
          }


          // Generate unique ID for this submission
          const submissionId = uuidv4()
          const timestamp = admin.firestore.Timestamp.now()

          // Convert file buffer to base64
          // Handle optional file upload
          let fileBase64 = null;
          let fileName = null;
          let fileType = null;
          
          if (file) {
            fileBase64 = file.buffer.toString("base64");
            fileName = file.originalname;
            fileType = file.mimetype;
          }

          // Create Jekyll post on GitHub
          const jekyllResult = await createJekyllPost(
            title.trim(),
            description.trim(),
            fileName,
            fileBase64,
            fileType
          )

          // Prepare submission data for Firestore
          const submissionData = {
            id: submissionId,
            title: title.trim(),
            description: description.trim(),
            file: file ? {
              name: file.originalname,
              type: file.mimetype,
              size: file.size,
              uploadedAt: timestamp,
            },
            submittedAt: timestamp,
            status: "published",
            jekyllPost: {
              postUrl: jekyllResult.postUrl,
              githubUrl: jekyllResult.githubUrl,
              createdAt: timestamp,
            },
          }

          /*
          // Store in Firestore
          const db = admin.firestore();
          await db.collection('submissions').doc(submissionId).set(submissionData);
		  */

          // Log successful submission
          console.log(
            `Form submitted and Jekyll post created - ID: ${submissionId}, Title: ${title}, Post URL: ${jekyllResult.postUrl}`
          )

          // Send success response
          res.status(200).json({
            success: true,
            message: "Form submitted successfully and Jekyll post created!",
            data: {
              submissionId: submissionId,
              title: title,
              description: description,
              fileName: file ? file.originalname : null,
              fileSize: file.size,
              submittedAt: timestamp.toDate().toISOString(),
              postUrl: jekyllResult.postUrl,
              githubUrl: jekyllResult.githubUrl,
            },
          })
        } catch (error) {
          console.error("Error processing form submission:", error)

          // More specific error handling
          if (error.status === 404) {
            res.status(500).json({
              success: false,
              error: "GitHub repository not found. Please check your GitHub configuration.",
            })
          } else if (error.status === 401) {
            res.status(500).json({
              success: false,
              error: "GitHub authentication failed. Please check your GitHub token.",
            })
          } else {
            res.status(500).json({
              success: false,
              error: "Error creating Jekyll post: " + error.message,
            })
          }
        }
      })
    } catch (error) {
      console.error("Unexpected error:", error)
      res.status(500).json({
        success: false,
        error: "Unexpected server error occurred.",
      })
    }
  })
})

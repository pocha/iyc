const functions = require("firebase-functions")
const admin = require("firebase-admin")
const cors = require("cors")
const Busboy = require("busboy")
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
      message: `Add new post: ${title}`,
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

      // Parse multipart form data using Busboy
      const busboy = new Busboy({ headers: req.headers })
      const fields = {}
      let fileData = null
      let fileName = null
      let fileType = null

      // Handle form fields
      busboy.on('field', (fieldname, val) => {
        fields[fieldname] = val
      })

      // Handle file uploads
      busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        if (fieldname === 'file') {
          fileName = filename
          fileType = mimetype
          const chunks = []
          
          file.on('data', (chunk) => {
            chunks.push(chunk)
          })
          
          file.on('end', () => {
            if (chunks.length > 0) {
              fileData = Buffer.concat(chunks)
            }
          })
        } else {
          // Skip other files
          file.resume()
        }
      })

      // Handle completion
      busboy.on('finish', async () => {
        try {
          // Extract form data
          const { title, description } = fields

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

          // Convert file buffer to base64 if file exists
          let fileBase64 = null
          if (fileData && fileName && fileType) {
            fileBase64 = fileData.toString("base64")
          }

          // Create Jekyll post on GitHub
          const jekyllResult = await createJekyllPost(
            title.trim(),
            description.trim(),
            fileName,
            fileBase64,
            fileType
          )

          // Log successful submission
          console.log(
            `Form submitted and Jekyll post created - ID: ${submissionId}, Title: ${title}, Post URL: ${jekyllResult.postUrl}`
          )

          // Send success response
          res.status(200).json({
            success: true,
            message: "Form submitted successfully and Jekyll post created!",
            data: {
              id: submissionId,
              title: title,
              description: description,
              fileName: fileName,
              fileSize: fileData ? fileData.length : 0,
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

      // Handle errors
      busboy.on('error', (error) => {
        console.error("Busboy error:", error)
        res.status(400).json({
          success: false,
          error: "Form parsing error: " + error.message,
        })
      })

      // Start parsing
      req.pipe(busboy)

    } catch (error) {
      console.error("Unexpected error:", error)
      res.status(500).json({
        success: false,
        error: "Unexpected server error occurred.",
      })
    }
  })
})

const functions = require("firebase-functions")
const admin = require("firebase-admin")
const cors = require("cors")
const busboy = require("busboy")
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

// Function to create Jekyll post in new directory structure
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

    // Create directory name for the blog post
    const postDirName = `${dateStr}-${slug}`
    const postDirPath = `_posts/${postDirName}`
    const blogFilePath = `${postDirPath}/blog.md`

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
    if (fileName && fileContent && fileType && fileType.startsWith("image/")) {
      // Save image to blog folder
      const imageFileName = `${dateStr}-${slug}-${fileName}`
      const imagePath = `${postDirPath}/${imageFileName}`

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
      postContent += `<p>
![${fileName}](https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${imagePath})
</p>
`
    }

    // Create the blog.md file in the post directory
    const response = await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: blogFilePath,
      message: `Add new blog post: ${title}`,
      content: Buffer.from(postContent).toString("base64"),
      branch: GITHUB_BRANCH,
    })

    return {
      success: true,
      postUrl: `http://20.42.15.153:4001/iyc/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(
        2,
        "0"
      )}/${String(now.getDate()).padStart(2, "0")}/${slug}.html`,
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

      // Check if request has multipart content-type
      const contentType = req.headers["content-type"] || ""
      if (!contentType.includes("multipart/form-data")) {
        res.status(400).json({
          success: false,
          error: "Invalid content type. Expected multipart/form-data.",
        })
        return
      }

      // Parse multipart form data using Busboy
      const busboyInstance = busboy({
        headers: req.headers,
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB limit
          files: 1, // Only allow 1 file
          fields: 10, // Limit number of fields
        },
      })

      const fields = {}
      let fileData = null
      let fileName = null
      let fileType = null
      let hasFinished = false

      // Handle form fields
      busboyInstance.on("field", (fieldname, val) => {
        console.log(`Field received: ${fieldname} = ${val}`)
        fields[fieldname] = val
      })

      // Handle file uploads
      busboyInstance.on("file", (fieldname, file, info) => {
        console.log(`File received: ${fieldname}, filename: ${info.filename}, mimetype: ${info.mimeType}`)

        // Only process if filename exists (not empty file field)
        if (fieldname === "file" && info.filename && info.filename.trim() !== "") {
          fileName = info.filename
          fileType = info.mimeType
          const chunks = []

          file.on("data", (chunk) => {
            chunks.push(chunk)
          })

          file.on("end", () => {
            if (chunks.length > 0) {
              fileData = Buffer.concat(chunks)
              console.log(`File data received: ${fileData.length} bytes`)
            }
          })
        } else {
          // Skip empty file fields or files without names
          console.log("Skipping empty file field")
          file.resume()
        }
      })

      // Handle completion
      busboyInstance.on("finish", async () => {
        if (hasFinished) return // Prevent double processing
        hasFinished = true

        console.log("Busboy finished parsing")
        console.log("Fields received:", Object.keys(fields))
        console.log("File info:", { fileName, fileType, hasFileData: !!fileData })

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
          // Validate that file is an image if file exists
          if (fileData && fileName && fileType && !fileType.startsWith("image/")) {
            res.status(400).json({
              success: false,
              error: "Only image files are allowed for attachments.",
            })
            return
          }

          if (fileData && fileName && fileType) {
            fileBase64 = fileData.toString("base64")
          }

          // Create Jekyll post on GitHub
          const jekyllResult = await createJekyllPost(title, description, fileName, fileBase64, fileType)

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
      busboyInstance.on("error", (error) => {
        if (hasFinished) return // Don't handle errors after finishing
        hasFinished = true

        console.error("Busboy error:", error)
        res.status(400).json({
          success: false,
          error: "Form parsing error: " + error.message,
        })
      })

      // Set a timeout to handle cases where busboy doesn't finish
      const timeout = setTimeout(() => {
        if (!hasFinished) {
          hasFinished = true
          console.error("Busboy timeout - form parsing took too long")
          res.status(408).json({
            success: false,
            error: "Form parsing timeout. Please try again.",
          })
        }
      }, 30000) // 30 second timeout

      // Clear timeout when busboy finishes
      busboyInstance.on("finish", () => {
        clearTimeout(timeout)
      })

      busboyInstance.on("error", () => {
        clearTimeout(timeout)
      })

      // Start parsing - handle case where req.rawBody might be undefined
      if (req.rawBody) {
        busboyInstance.end(req.rawBody)
      } else {
        // For Firebase Functions, we need to read the request body
        let body = Buffer.alloc(0)
        req.on("data", (chunk) => {
          body = Buffer.concat([body, chunk])
        })
        req.on("end", () => {
          busboyInstance.end(body)
        })
      }
    } catch (error) {
      console.error("Unexpected error:", error)
      res.status(500).json({
        success: false,
        error: "Unexpected server error occurred.",
      })
    }
  })
})

// Comment submission handler
exports.submitComment = functions.region("asia-south1").https.onRequest((req, res) => {
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
          error: "GitHub configuration is missing.",
        })
        return
      }

      // Check if request has multipart content-type
      const contentType = req.headers["content-type"] || ""
      if (!contentType.includes("multipart/form-data")) {
        res.status(400).json({
          success: false,
          error: "Invalid content type. Expected multipart/form-data.",
        })
        return
      }

      // Parse multipart form data using Busboy
      const busboyInstance = busboy({
        headers: req.headers,
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB limit for comments
          files: 1,
          fields: 10,
        },
      })

      const fields = {}
      let fileData = null
      let fileName = null
      let fileType = null
      let hasFinished = false

      // Handle form fields
      busboyInstance.on("field", (fieldname, val) => {
        console.log(`Comment field received: ${fieldname} = ${val}`)
        fields[fieldname] = val
      })

      // Handle file uploads
      busboyInstance.on("file", (fieldname, file, info) => {
        console.log(`Comment file received: ${fieldname}, filename: ${info.filename}, mimetype: ${info.mimeType}`)

        if (fieldname === "image" && info.filename && info.filename.trim() !== "") {
          fileName = info.filename
          fileType = info.mimeType
          const chunks = []

          file.on("data", (chunk) => {
            chunks.push(chunk)
          })

          file.on("end", () => {
            if (chunks.length > 0) {
              fileData = Buffer.concat(chunks)
              console.log(`Comment file data received: ${fileData.length} bytes`)
            }
          })
        } else {
          console.log("Skipping empty comment file field")
          file.resume()
        }
      })

      // Handle completion
      busboyInstance.on("finish", async () => {
        if (hasFinished) return
        hasFinished = true

        console.log("Comment busboy finished parsing")
        console.log("Comment fields received:", Object.keys(fields))

        try {
          const { postSlug, userName, comment } = fields

          // Validate required fields
          if (!postSlug || !userName || !comment) {
            res.status(400).json({
              success: false,
              error: "Post slug, user name, and comment are required fields.",
            })
            return
          }

          // Generate timestamp for comment
          const now = new Date()
          const timestamp = now.toISOString()
          const commentId = uuidv4().substring(0, 8)

          // Create comment content
          let commentContent = `---
author: ${userName}
date: ${timestamp}
---

${comment}
`

          // Handle image attachment if present
          let imageUrl = ""
          if (fileData && fileName && fileType && fileType.startsWith("image/")) {
            const imageFileName = `${postSlug}-comment-${commentId}-${fileName}`
            const imagePath = `_posts/${postSlug}/${imageFileName}`

            // Upload image to GitHub
            await octokit.repos.createOrUpdateFileContents({
              owner: GITHUB_OWNER,
              repo: GITHUB_REPO,
              path: imagePath,
              message: `Add comment image for post: ${postSlug}`,
              content: fileData.toString("base64"),
              branch: GITHUB_BRANCH,
            })

            imageUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/_posts/${postSlug}/${imageFileName}`
            commentContent += `
![Comment Image](${imageUrl})
`
          }

          // Create comment file in the post directory
          const commentFileName = `comment-${commentId}.md`
          const commentPath = `_posts/${postSlug}/${commentFileName}`

          await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: commentPath,
            message: `Add comment by ${userName} to post: ${postSlug}`,
            content: Buffer.from(commentContent).toString("base64"),
            branch: GITHUB_BRANCH,
          })

          // Send success response
          res.status(200).json({
            success: true,
            message: "Comment submitted successfully!",
            data: {
              commentId: commentId,
              postSlug: postSlug,
              userName: userName,
              comment: comment,
              imageUrl: imageUrl,
              submittedAt: timestamp,
            },
          })
        } catch (error) {
          console.error("Error processing comment submission:", error)
          res.status(500).json({
            success: false,
            error: "Error creating comment: " + error.message,
          })
        }
      })

      // Handle errors
      busboyInstance.on("error", (error) => {
        if (hasFinished) return
        hasFinished = true

        console.error("Comment busboy error:", error)
        res.status(400).json({
          success: false,
          error: "Comment form parsing error: " + error.message,
        })
      })

      // Set timeout
      const timeout = setTimeout(() => {
        if (!hasFinished) {
          hasFinished = true
          console.error("Comment busboy timeout")
          res.status(408).json({
            success: false,
            error: "Comment form parsing timeout. Please try again.",
          })
        }
      }, 30000)

      busboyInstance.on("finish", () => {
        clearTimeout(timeout)
      })

      busboyInstance.on("error", () => {
        clearTimeout(timeout)
      })

      // Start parsing
      if (req.rawBody) {
        busboyInstance.end(req.rawBody)
      } else {
        let body = Buffer.alloc(0)
        req.on("data", (chunk) => {
          body = Buffer.concat([body, chunk])
        })
        req.on("end", () => {
          busboyInstance.end(body)
        })
      }
    } catch (error) {
      console.error("Unexpected comment error:", error)
      res.status(500).json({
        success: false,
        error: "Unexpected server error occurred.",
      })
    }
  })
})

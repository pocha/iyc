const functions = require("firebase-functions")
const admin = require("firebase-admin")
const { Octokit } = require("@octokit/rest")
const cors = require("cors")
const busboy = require("busboy")
const { v4: uuidv4 } = require("uuid")

// Initialize Firebase Admin SDK
admin.initializeApp()

// GitHub configuration
const GITHUB_TOKEN = functions.config().github?.token || process.env.GITHUB_TOKEN
const GITHUB_OWNER = functions.config().github?.owner || process.env.GITHUB_OWNER
const GITHUB_REPO = functions.config().github?.repo || process.env.GITHUB_REPO
const GITHUB_BRANCH = functions.config().github?.branch || process.env.GITHUB_BRANCH || "main"

// Initialize Octokit
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
})

// CORS configuration
const corsHandler = cors({
  origin: ["http://20.42.15.153:4001", "http://localhost:4000", "https://pocha.github.io"],
  methods: ["GET", "POST", "OPTIONS"],
})

// Shared function to parse multipart form data using Busboy
const parseMultipartData = (req, options = {}) => {
  return new Promise((resolve, reject) => {
    const defaultOptions = {
      fileSize: 10 * 1024 * 1024, // 10MB default
      files: 1,
      fields: 10,
      imageOnly: true, // whether to restrict to images only
    }

    const config = { ...defaultOptions, ...options }

    // Check if request has multipart content-type
    const contentType = req.headers["content-type"] || ""
    if (!contentType.includes("multipart/form-data")) {
      reject(new Error("Invalid content type. Expected multipart/form-data."))
      return
    }

    // Parse multipart form data using Busboy
    const busboyInstance = busboy({
      headers: req.headers,
      limits: {
        fileSize: config.fileSize,
        files: config.files,
        fields: config.fields,
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

      // Only process if filename exists and matches expected field name
      if (info.filename && info.filename.trim() !== "") {
        // Check if image-only restriction is enabled
        if (config.imageOnly && !info.mimeType.startsWith("image/")) {
          reject(new Error("Only image files are allowed for attachments."))
          return
        }

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

      resolve({
        fields,
        fileData,
        fileName,
        fileType,
      })
    })

    // Handle errors
    busboyInstance.on("error", (error) => {
      console.error("Busboy error:", error)
      reject(error)
    })

    // Pipe the request to busboy
    // req.pipe(busboyInstance)
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
  })
}

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
      postContent += `
![${fileName}](https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${imagePath}?raw=true)
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

// Submit form function (for creating blog posts)
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

      // Parse multipart data with blog post specific options
      const { fields, fileData, fileName, fileType } = await parseMultipartData(req, {
        fileSize: 10 * 1024 * 1024, // 10MB limit for blog posts
        allowedFileField: "image",
        imageOnly: true,
      })

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

      // Create slug from title
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim("-")

      // Create date string for Jekyll post naming
      const now = new Date()
      const dateString = now.toISOString().split("T")[0] // YYYY-MM-DD format
      const postSlug = `${dateString}-${slug}`

      // Create post directory path
      const postDir = `_posts/${postSlug}`

      // Create blog post content
      let postContent = `---
layout: post
title: "${title}"
date: ${now.toISOString()}
categories: submissions
tags: [user-submission]
author: User Submission
---

${description}
`

      // Handle image attachment if present
      if (fileData && fileName && fileType.startsWith("image/")) {
        const imageFileName = `${postSlug}-${fileName}`
        const imagePath = `${postDir}/${imageFileName}`

        // Upload image to GitHub
        await octokit.repos.createOrUpdateFileContents({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          path: imagePath,
          message: `Add image for blog post: ${title}`,
          content: fileData.toString("base64"),
          branch: GITHUB_BRANCH,
        })

        // Add image reference to post content
        const imageUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${imagePath}?raw=true`
        postContent += `
![${fileName}](${imageUrl})
`
      }

      // Create blog post file
      const blogPath = `${postDir}/blog.md`
      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: blogPath,
        message: `Add new blog post: ${title}`,
        content: Buffer.from(postContent).toString("base64"),
        branch: GITHUB_BRANCH,
      })

      // Send success response
      res.status(200).json({
        success: true,
        message: "Blog post submitted successfully!",
        data: {
          postSlug: postSlug,
          title: title,
          description: description,
          submittedAt: now.toISOString(),
        },
      })
    } catch (error) {
      console.error("Error in submitForm:", error)
      res.status(500).json({
        success: false,
        error: error.message || "An unexpected error occurred while processing your submission.",
      })
    }
  })
})

// Submit comment function (for adding comments to blog posts)
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

      // Parse multipart data with comment specific options
      const { fields, fileData, fileName, fileType } = await parseMultipartData(req, {
        fileSize: 5 * 1024 * 1024, // 5MB limit for comments
        allowedFileField: "image",
        imageOnly: true,
      })

      const { postSlug, comment } = fields

      // Validate required fields
      if (!postSlug || !comment) {
        res.status(400).json({
          success: false,
          error: "Post slug and comment are required fields.",
        })
        return
      }

      // Generate timestamp for comment
      const now = new Date()
      const timestamp = now.toISOString()
      const commentId = uuidv4().substring(0, 8)

      // Create comment content
      let commentContent = `---
date: ${timestamp}
---

${comment}
`

      // Handle image attachment if present
      let imageUrl = ""
      if (fileData && fileName && fileType) {
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

        imageUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/_posts/${postSlug}/${imageFileName}?raw=true`
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
        message: `Add comment to post: ${postSlug}`,
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
          comment: comment,
          imageUrl: imageUrl,
          submittedAt: timestamp,
        },
      })
    } catch (error) {
      console.error("Error in submitComment:", error)
      res.status(500).json({
        success: false,
        error: error.message || "An unexpected error occurred while processing your comment.",
      })
    }
  })
})

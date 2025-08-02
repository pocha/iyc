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
  origin: ["http://20.42.15.153:4001", "https://pocha.github.io"],
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

// Generic function to create single commit with multiple files
async function createSingleCommit(files, commitMessage) {
  try {
    // Get the latest commit SHA
    const { data: refData } = await octokit.git.getRef({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      ref: `heads/${GITHUB_BRANCH}`,
    })
    const latestCommitSha = refData.object.sha

    // Get the base tree
    const { data: baseTree } = await octokit.git.getTree({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      tree_sha: latestCommitSha,
    })

    // Process files and create blobs for binary files
    const treeItems = []

    for (const file of files) {
      if (file.encoding === "base64") {
        // For binary files (images), create a blob first
        const { data: blob } = await octokit.git.createBlob({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          content: file.content,
          encoding: "base64",
        })

        treeItems.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        })
      } else {
        // For text files, use content directly
        treeItems.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          content: file.content,
          encoding: file.encoding || "utf-8",
        })
      }
    }

    // Create tree with all files
    const { data: newTree } = await octokit.git.createTree({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      base_tree: baseTree.sha,
      tree: treeItems,
    })

    // Create single commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      message: commitMessage,
      tree: newTree.sha,
      parents: [latestCommitSha],
    })

    // Update the reference
    await octokit.git.updateRef({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      ref: `heads/${GITHUB_BRANCH}`,
      sha: newCommit.sha,
    })

    return {
      success: true,
      commitSha: newCommit.sha,
      githubUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${newCommit.sha}`,
    }
  } catch (error) {
    console.error("Error creating single commit:", error)
    throw error
  }
}

// Function to create Jekyll post using single commit
async function createJekyllPost(title, description, fileName, fileContent, fileType, userCookie) {
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
    const blogFilePath = `${postDirPath}/index.md`

    // Create Jekyll front matter and content
    let postContent = `---
layout: post
title: "${title}"
date: ${timeStr}
author: Anonymous
slug: ${slug}
user_cookie: ${userCookie || "anonymous"}
---

${description}

`

    // Prepare files for single commit
    const filesToCreate = []

    // Always add the blog.md file
    filesToCreate.push({
      path: blogFilePath,
      content: postContent,
      encoding: "utf-8",
    })
    // Only add image file if it exists
    if (fileName && fileContent && fileType && fileType.startsWith("image/")) {
      const imageFileName = `${dateStr}-${slug}-${fileName}`
      const imagePath = `${postDirPath}/${imageFileName}`

      // Add image reference to post content
      postContent += `
![${fileName}](https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${imagePath}?raw=true)
`

      // Update the blog.md content with image reference
      filesToCreate[0].content = postContent

      content: fileContent.toString("base64"),
        filesToCreate.push({
          path: imagePath,
          content: Buffer.from(fileContent).toString("base64"),
          encoding: "base64",
        })
    }

    // Use the generic single commit function
    const result = await createSingleCommit(filesToCreate, `Add new blog post: ${title}`)

    return {
      success: true,
      postUrl: `http://20.42.15.153:4001/iyc/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(
        2,
        "0"
      )}/${String(now.getDate()).padStart(2, "0")}/${slug}.html`,
      githubUrl: result.githubUrl,
    }
  } catch (error) {
    console.error("Error creating Jekyll post:", error)
    throw error
  }
}

// Submit form function (for creating blog posts) - refactored to use single commit
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

      // Extract user cookie from request headers
      const userCookie = req.headers["x-user-cookie"] || req.headers["cookie"]?.match(/userCookie=([^;]+)/)?.[1] || null


      // Validate that cookie is present (mandatory for post creation)
      if (!userCookie) {
        res.status(401).json({
          success: false,
          error: "User cookie is required to create a post. Please ensure you have a valid session.",
        })
        return
      }
      // Validate required fields
      if (!title || !description) {
        res.status(400).json({
          success: false,
          error: "Title and description are required fields.",
        })
        return
      }

      // Use the createJekyllPost function - pass raw fileData for images and user cookie
      const result = await createJekyllPost(title, description, fileName, fileData, fileType, userCookie)

      // Send success response
      res.status(200).json({
        success: true,
        message: "Blog post submitted successfully!",
        data: {
          title: title,
          description: description,
          postUrl: result.postUrl,
          githubUrl: result.githubUrl,
          submittedAt: new Date().toISOString(),
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

// Submit comment function (for adding comments to blog posts) - refactored to use single commit
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
      const timeStr = now.toISOString()

      // Generate comment ID and sanitized timestamp for filename
      const commentId = `comment-${timeStr.replace(/[:.]/g, "-")}`

      // Create comment content in YAML format for Staticman structure
      let commentContent = `_id: ${commentId}
date: ${timestamp}
name: Anonymous
message: ${comment}`

      // Prepare files for single commit
      const filesToCreate = []

      // Handle image attachment if present
      if (fileData && fileName && fileType && fileType.startsWith("image/")) {
        const imageFileName = `comment-${timeStr}-${fileName}`
        const imagePath = `_posts/${postSlug}/${imageFileName}`

        // Add image reference to comment content
        const imageUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/_posts/${postSlug}/${imageFileName}?raw=true`
        commentContent += `
image: ${imageUrl}`

        // Add image file to the commit
        filesToCreate.push({
          path: imagePath,
          content: Buffer.from(fileData).toString("base64"),
          encoding: "base64",
        })
      }

      // Create comment file in the Staticman structure
      const commentPath = `_data/comments/${postSlug}/${commentId}.yml`

      // Add comment file to the commit
      filesToCreate.push({
        path: commentPath,
        content: commentContent,
        encoding: "utf-8",
      })

      // Use the generic single commit function
      const result = await createSingleCommit(filesToCreate, `Add comment to post: ${postSlug}`)

      // Send success response
      res.status(200).json({
        success: true,
        message: "Comment submitted successfully!",
        data: {
          postSlug: postSlug,
          comment: comment,
          githubUrl: result.githubUrl,
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

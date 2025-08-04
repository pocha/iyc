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
// Combined function to handle both create and update Jekyll post operations
async function handleJekyllPost(slug, title, description, fileName, fileContent, fileType, userCookie) {
  try {
    const isEdit = slug && slug.trim() !== ""
    let postSlug, postDate, postDirPath, blogFilePath, commitMessage, existingContent

    if (isEdit) {
      // EDIT OPERATION: Fetch existing post content to verify ownership
      // Directly construct the path using the slug pattern
      blogFilePath = `_posts/${slug}/index.md`

      // Get the existing post content to verify user ownership
      let existingFile, existingContent
      try {
        const response = await octokit.rest.repos.getContent({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          path: blogFilePath,
          ref: GITHUB_BRANCH,
        })
        existingFile = response.data
        existingContent = Buffer.from(existingFile.content, "base64").toString("utf-8")

        // Check if the user cookie matches the one in the existing post
        const cookieMatch = existingContent.match(/user_cookie:\s*(.+)/)
        const existingCookie = cookieMatch ? cookieMatch[1].trim() : null

        if (existingCookie !== userCookie) {
          throw new Error("Unauthorized: You can only edit posts you created")
        }
      } catch (error) {
        if (error.status === 404) {
          throw new Error(`Post not found: ${slug}`)
        }
        throw new Error("Unauthorized: You can only edit posts you created")
      }

      // Extract existing date to preserve it
      const dateMatch = existingContent.match(/date:\s*(.+)/)
      postDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString()
      postSlug = slug
      postDirPath = `_posts/${slug}`
      commitMessage = `Update blog post: ${title}`
    } else {
      // CREATE OPERATION: Create new post
      const now = new Date()
      const dateStr = now.toISOString().split("T")[0] // YYYY-MM-DD format
      postDate = now.toISOString()

      // Create slug from title
      postSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim("-")

      // Create directory name for the blog post
      const postDirName = `${dateStr}-${postSlug}`
      postDirPath = `_posts/${postDirName}`
      blogFilePath = `${postDirPath}/index.md`
      commitMessage = `Create new blog post: ${title}`
    }

    // COMMON LOGIC: Create Jekyll front matter and content
    let postContent = `---
layout: post
title: "${title}"
date: ${postDate}
author: Anonymous
slug: ${postSlug}
user_cookie: ${userCookie || "anonymous"}
---

${description}

`

    // Prepare files for single commit
    const filesToProcess = []

    // Handle image logic - preserve existing images during edit if no new image provided
    let hasNewImage = fileName && fileContent && fileType && fileType.startsWith("image/")

    if (hasNewImage) {
      // New image provided
      const imageFileName = isEdit ? `${postSlug}-${fileName}` : `${postDate.split("T")[0]}-${postSlug}-${fileName}`
      const imagePath = `${postDirPath}/${imageFileName}`

      // Add image reference to post content
      postContent += `
![${fileName}](https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${imagePath}?raw=true)
`

      // Add image file
      filesToProcess.push({
        path: imagePath,
        content: Buffer.from(fileContent).toString("base64"),
        encoding: "base64",
      })
    } else if (isEdit && existingContent) {
      // No new image but this is an edit - preserve existing image reference
      const imageMatch = existingContent.match(/!\[.*?\]\(.*?\)/g)
      if (imageMatch && imageMatch.length > 0) {
        postContent += `
${imageMatch[0]}
`
      }
    }
    filesToProcess.push({
      path: blogFilePath,
      content: postContent,
      encoding: "utf-8",
    })

    // Use the generic single commit function
    const result = await createSingleCommit(filesToProcess, commitMessage)

    // Extract date components for URL
    const dateObj = new Date(postDate)
    return {
      success: true,
      postUrl: `http://20.42.15.153:4001/iyc/${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(
        2,
        "0"
      )}/${String(dateObj.getDate()).padStart(2, "0")}/${postSlug}.html`,
      githubUrl: result.githubUrl,
    }
  } catch (error) {
    console.error("Error handling Jekyll post:", error)
    throw error
  }
}

// Submit form function (for creating blog posts) - refactored to use single commit

// Export all functions and constants
module.exports = {
  corsHandler,
  parseMultipartData,
  octokit,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH,
  createSingleCommit,
  handleJekyllPost,
}

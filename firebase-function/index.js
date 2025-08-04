// Main index.js file that exports all Firebase functions
const { submitForm } = require('./submitForm');
const { submitComment } = require('./submitComment');
const { deletePost } = require('./deletePost');

// Export all functions
exports.submitForm = submitForm;
exports.submitComment = submitComment;
exports.deletePost = deletePost;

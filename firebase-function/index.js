// Main index.js file that exports all Firebase functions
const { submitForm } = require('./submitForm');
const { checkWorkflow } = require('./checkWorkflow');
const { submitComment } = require('./submitComment');
const { deletePost } = require('./deletePost');

// Export all functions
exports.checkWorkflow = checkWorkflow;
exports.submitForm = submitForm;
exports.submitComment = submitComment;
exports.deletePost = deletePost;

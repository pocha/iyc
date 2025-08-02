/**
 * Forum Cookie Manager
 * Centralized cookie handling for consistent user identification across the forum
 */

// Cookie management functions
function getCookie(name) {
  const value = "; " + document.cookie;
  const parts = value.split("; " + name + "=");
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

function setCookie(name, value, days) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = name + "=" + value + ";expires=" + expires.toUTCString() + ";path=/";
}

function generateUserCookie() {
  return "user_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
}

// Initialize and get user cookie (main function used across the forum)
function getUserCookie() {
  let userCookie = getCookie("forum_user_id");
  if (!userCookie) {
    userCookie = generateUserCookie();
    setCookie("forum_user_id", userCookie, 365); // Set for 1 year
  }
  return userCookie;
}

// Initialize user cookie on page load
function initializeUserCookie() {
  return getUserCookie();
}

// Check if current user owns a specific post
function checkPostOwnership(postOwnerCookie) {
  const userCookie = getUserCookie();
  return postOwnerCookie && userCookie === postOwnerCookie;
}

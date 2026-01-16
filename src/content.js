/**
 * LeetCode Spaced Repetition Extension
 * Content Script
 * 
 * Detects current LeetCode problem from the page URL
 */

(function() {
  'use strict';
  
  let currentProblem = null;
  
  // Extract problem info from the page
  function extractProblemInfo() {
    const url = window.location.href;
    
    // Match LeetCode problem URL pattern
    // Examples: 
    // https://leetcode.com/problems/two-sum/
    // https://leetcode.com/problems/two-sum/description/
    const problemMatch = url.match(/leetcode\.com\/problems\/([^\/]+)/);
    
    if (!problemMatch) {
      return null;
    }
    
    const problemSlug = problemMatch[1];
    
    // Try to get problem title from page
    let title = problemSlug;
    const titleElement = document.querySelector('[data-cy="question-title"]') || 
                        document.querySelector('h3') ||
                        document.querySelector('.css-v3d350') ||
                        document.querySelector('[class*="title"]');
    
    if (titleElement) {
      title = titleElement.textContent.trim();
    }
    
    // Try to get problem number
    let problemNumber = null;
    const numberElement = document.querySelector('[data-cy="question-title"]')?.parentElement?.querySelector('span');
    if (numberElement) {
      const numberMatch = numberElement.textContent.match(/(\d+)\./);
      if (numberMatch) {
        problemNumber = parseInt(numberMatch[1]);
      }
    }
    
    return {
      slug: problemSlug,
      title: title,
      number: problemNumber,
      url: url
    };
  }
  
  // No longer monitoring submissions - users log confidence in the extension popup
  function setupSubmissionMonitor() {
    // Users now manually log their confidence rating in the extension popup
  }
  
  // Helper function to safely send messages to background script
  function sendMessageSafely(message, callback) {
    try {
      // Check if runtime is available
      if (!chrome.runtime || !chrome.runtime.id) {
        console.warn('LeetCode Spaced Repetition: Extension runtime not available');
        return;
      }
      
      chrome.runtime.sendMessage(message, (response) => {
        // Check for runtime errors
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError.message;
          // Silently ignore "Extension context invalidated" - extension was reloaded
          if (error.includes('Extension context invalidated') || 
              error.includes('message port closed')) {
            return;
          }
          // Log other errors for debugging
          if (error) {
            console.error('LeetCode Spaced Repetition: Runtime error:', error);
          }
          return;
        }
        
        if (callback) {
          callback(response);
        }
      });
    } catch (error) {
      // Silently ignore "Extension context invalidated" errors
      if (error.message && error.message.includes('Extension context invalidated')) {
        return;
      }
      console.error('LeetCode Spaced Repetition: Error sending message:', error);
    }
  }
  
  // Handle submission (legacy support)
  async function handleSubmission(problem, isCorrect) {
    sendMessageSafely({
      type: 'SUBMISSION',
      problem: problem,
      isCorrect: isCorrect,
      timestamp: Date.now()
    });
  }
  
  // Initialize
  function init() {
    // Extract current problem
    currentProblem = extractProblemInfo();
    
    if (currentProblem) {
      // Send current problem info to background (non-critical, so we don't need callback)
      sendMessageSafely({
        type: 'CURRENT_PROBLEM',
        problem: currentProblem
      });
      
      // Setup submission monitoring
      setupSubmissionMonitor();
    }
  }
  
  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Re-run on navigation (for SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(init, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
  
})();

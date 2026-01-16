/**
 * LeetCode Spaced Repetition Extension
 * Background Service Worker
 * 
 * Manages problem data, spaced repetition scheduling, and extension state
 */

// Spaced Repetition Algorithm (SM-2 inspired)
const SpacedRepetition = {
  // Calculate next review date based on performance
  // quality: 0-5 (0=blackout, 1=incorrect, 2=incorrect but remembered, 3=correct with difficulty, 4=correct, 5=perfect)
  calculateNextReview(problem, quality) {
    const now = Date.now();

    // Initialize if first time
    if (!problem.repetitions) {
      problem.repetitions = 0;
      problem.easinessFactor = 2.5;
      problem.interval = 1;
      problem.lastReviewed = now;
    }

    // Update easiness factor based on quality
    problem.easinessFactor = Math.max(
      1.3,
      problem.easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );

    // Update repetitions and interval
    if (quality < 3) {
      // If incorrect, reset interval
      problem.repetitions = 0;
      problem.interval = 1;
    } else {
      // If correct, increase interval
      problem.repetitions += 1;

      if (problem.repetitions === 1) {
        problem.interval = 1;
      } else if (problem.repetitions === 2) {
        problem.interval = 6;
      } else {
        problem.interval = Math.round(problem.interval * problem.easinessFactor);
      }
    }

    // Calculate next review date (interval in days)
    // Ensure minimum 1 day interval - never schedule for same day
    const minInterval = Math.max(1, problem.interval);
    const nextReviewDate = now + (minInterval * 24 * 60 * 60 * 1000);

    // Ensure nextReview is always at least tomorrow (never same day)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowTimestamp = tomorrow.getTime();

    // Ensure nextReview is always a valid number and at least tomorrow
    problem.nextReview = Number(Math.max(nextReviewDate, tomorrowTimestamp));
    problem.lastReviewed = Number(now);

    // Validate the date
    if (isNaN(problem.nextReview) || problem.nextReview <= 0) {
      console.error('Invalid nextReview calculated:', problem.nextReview, 'for problem:', problem.slug);
      problem.nextReview = tomorrowTimestamp; // Default to tomorrow if invalid
    }

    return problem;
  },

  // Get problems due for review today
  getProblemsDueToday(problems) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    return Object.values(problems).filter(problem => {
      if (!problem.nextReview) return false;
      const reviewDate = new Date(problem.nextReview);
      reviewDate.setHours(0, 0, 0, 0);
      return reviewDate.getTime() <= todayTimestamp;
    });
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOG_CONFIDENCE') {
    handleConfidenceRating(message.problem, message.confidence, message.timestamp).then(() => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'SUBMISSION') {
    // Legacy support - convert to confidence rating
    const confidence = message.isCorrect ? 4 : 1;
    handleConfidenceRating(message.problem, confidence, message.timestamp).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === 'GET_PROBLEMS') {
    getProblems().then(problems => {
      sendResponse({ problems });
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'GET_PROBLEMS_DUE_TODAY') {
    getProblemsDueToday().then(problems => {
      sendResponse({ problems });
      // Update badge when popup checks
      updateBadge();
    });
    return true;
  } else if (message.type === 'UPDATE_PROBLEM') {
    updateProblem(message.problem).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === 'GET_SETTINGS') {
    getSettings().then(settings => {
      sendResponse({ settings });
    });
    return true;
  } else if (message.type === 'SAVE_SETTINGS') {
    saveSettings(message.settings).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === 'REDISTRIBUTE_DUE_DATES') {
    redistributeDueDates().then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === 'RESET_ALL_DATA') {
    resetAllData().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }
});

/**
 * Handle confidence rating submission
 * @param {Object} problem - Problem information
 * @param {number} confidence - Confidence rating (1-5)
 * @param {number} timestamp - Timestamp of rating
 */
async function handleConfidenceRating(problem, confidence, timestamp) {
  try {
    const result = await chrome.storage.local.get(['problems']);
    const problems = result.problems || {};

    const problemKey = problem.slug || problem.url;

    // Get or create problem entry
    let problemData = problems[problemKey] || {
      slug: problem.slug,
      title: problem.title,
      number: problem.number,
      url: problem.url,
      submissions: [],
      firstAttempted: timestamp,
      lastAttempted: timestamp
    };

    // Add submission record with confidence
    problemData.submissions.push({
      timestamp: timestamp,
      confidence: confidence
    });

    problemData.lastAttempted = timestamp;
    problemData.lastConfidence = confidence;

    // Use confidence rating directly for spaced repetition (1-5 scale)
    // Confidence maps directly to quality: 1=very hard, 2=hard, 3=medium, 4=easy, 5=very easy
    const quality = confidence;

    // Apply spaced repetition algorithm to get initial due date
    problemData = SpacedRepetition.calculateNextReview(problemData, quality);

    // Save updated problem first
    problems[problemKey] = problemData;
    await chrome.storage.local.set({ problems });

    // Now dynamically redistribute ALL problems based on priority
    // This ensures hard problems come before easy problems
    await redistributeDueDates();

    // Update badge after redistribution
    await updateBadge();

    // Show notification (if permission granted)
    try {
      const confidenceLabels = {
        1: 'Very Hard',
        2: 'Hard',
        3: 'Medium',
        4: 'Easy',
        5: 'Very Easy'
      };

      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon48.png'),
        title: 'Confidence Logged ✓',
        message: `${problem.title || problem.slug} - ${confidenceLabels[confidence]}`
      }, () => {
        // Silently ignore notification errors
        if (chrome.runtime.lastError) {
          // Notification permission may not be granted
        }
      });
    } catch (e) {
      // Notifications not available or permission not granted - silently continue
    }

  } catch (error) {
    console.error('Error handling confidence rating:', error);
    throw error;
  }
}

async function getProblems() {
  const result = await chrome.storage.local.get(['problems']);
  return result.problems || {};
}

async function getProblemsDueToday() {
  const problems = await getProblems();
  return SpacedRepetition.getProblemsDueToday(problems);
}

async function updateProblem(problem) {
  const result = await chrome.storage.local.get(['problems']);
  const problems = result.problems || {};
  const problemKey = problem.slug || problem.url;
  problems[problemKey] = problem;
  await chrome.storage.local.set({ problems });
}

// Settings management
async function getSettings() {
  const result = await chrome.storage.local.get(['settings']);
  return result.settings || { maxProblemsPerDay: 5 }; // Default to 5
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

// Function to find next available day that's under the limit
// Always returns at least tomorrow (never today)
async function findNextAvailableDate(problems, startDate, maxPerDay) {
  const dateCounts = {};

  // Count problems per date
  Object.values(problems).forEach(problem => {
    if (problem.nextReview) {
      const date = new Date(problem.nextReview);
      date.setHours(0, 0, 0, 0);
      const dateKey = date.getTime();
      dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
    }
  });

  // Find next available date - start from tomorrow at minimum
  const now = Date.now();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  let currentDate = new Date(Math.max(startDate, tomorrow.getTime()));
  currentDate.setHours(0, 0, 0, 0);

  // Ensure we start from at least tomorrow
  if (currentDate.getTime() < tomorrow.getTime()) {
    currentDate = new Date(tomorrow);
  }

  // Look up to 365 days ahead
  for (let i = 0; i < 365; i++) {
    const dateKey = currentDate.getTime();
    const count = dateCounts[dateKey] || 0;

    if (count < maxPerDay) {
      return currentDate.getTime();
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Fallback: return tomorrow if we can't find one
  return tomorrow.getTime();
}

// Calculate priority for a problem (lower number = higher priority = should be scheduled earlier)
// Hard problems get higher priority (lower number), easy problems get lower priority (higher number)
function calculateProblemPriority(problem) {
  if (!problem.nextReview) {
    return 999999; // Problems without due dates go to the end
  }

  const now = Date.now();
  const dueDate = problem.nextReview;
  const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

  // Base priority: days until due (earlier = higher priority)
  let priority = daysUntilDue;

  // Adjust based on confidence history
  // Lower confidence (harder) = higher priority (lower number)
  if (problem.confidenceHistory && problem.confidenceHistory.length > 0) {
    const avgConfidence = problem.confidenceHistory.reduce((sum, c) => sum + c, 0) / problem.confidenceHistory.length;
    const lastConfidence = problem.confidenceHistory[problem.confidenceHistory.length - 1];

    // Very hard problems (1-2) get priority boost (subtract days)
    if (avgConfidence <= 2) {
      priority -= 10; // Hard problems should be scheduled much earlier
    } else if (avgConfidence <= 2.5) {
      priority -= 5;
    }

    // Very easy problems (4.5+) get priority reduction (add days)
    if (avgConfidence >= 4.5) {
      priority += 5; // Easy problems can wait longer
    }

    // Last confidence also matters
    if (lastConfidence <= 2) {
      priority -= 5;
    } else if (lastConfidence >= 4.5) {
      priority += 3;
    }
  } else if (problem.lastConfidence) {
    // Use last confidence if no history
    if (problem.lastConfidence <= 2) {
      priority -= 5;
    } else if (problem.lastConfidence >= 4.5) {
      priority += 3;
    }
  }

  return priority;
}

// Dynamic redistribution: recalculate all due dates and redistribute by priority
async function redistributeDueDates() {
  const settings = await getSettings();
  const maxPerDay = settings.maxProblemsPerDay || 5;

  const result = await chrome.storage.local.get(['problems']);
  const problems = result.problems || {};

  // Get all problems with due dates
  const problemsList = Object.values(problems).filter(p => p.nextReview);

  if (problemsList.length === 0) {
    return;
  }

  // Sort by priority (lower priority number = higher priority = should be scheduled first)
  problemsList.sort((a, b) => {
    const priorityA = calculateProblemPriority(a);
    const priorityB = calculateProblemPriority(b);
    return priorityA - priorityB;
  });

  // Redistribute problems across days
  // Start from tomorrow - never schedule problems for today
  const now = Date.now();
  let currentDate = new Date(now);
  currentDate.setDate(currentDate.getDate() + 1); // Start from tomorrow
  currentDate.setHours(0, 0, 0, 0);

  const dateCounts = {};
  const problemsByDate = {};

  for (const problem of problemsList) {
    // Find next available date (always at least tomorrow)
    let assignedDate = currentDate.getTime();
    let dateKey = assignedDate;
    let count = dateCounts[dateKey] || 0;

    // If current date is full, find next available
    while (count >= maxPerDay) {
      currentDate.setDate(currentDate.getDate() + 1);
      assignedDate = currentDate.getTime();
      dateKey = assignedDate;
      count = dateCounts[dateKey] || 0;
    }

    // Ensure assigned date is at least tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    if (assignedDate < tomorrow.getTime()) {
      assignedDate = tomorrow.getTime();
      dateKey = assignedDate;
      currentDate = new Date(tomorrow);
    }

    // Assign problem to this date
    problem.nextReview = assignedDate;
    dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;

    if (!problemsByDate[dateKey]) {
      problemsByDate[dateKey] = [];
    }
    problemsByDate[dateKey].push(problem);

    // Update in problems object
    const problemKey = problem.slug || problem.url;
    problems[problemKey] = problem;

    // Move to next day if this day is now full
    if (dateCounts[dateKey] >= maxPerDay) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Save updated problems
  await chrome.storage.local.set({ problems });

  // Update badge
  await updateBadge();
}

// Update extension badge with count of problems due today
async function updateBadge() {
  try {
    const problems = await getProblemsDueToday();
    const count = problems.length;

    if (count > 0) {
      // Show count on badge
      chrome.action.setBadgeText({
        text: count.toString()
      });

      // Set badge color to red to indicate urgency
      chrome.action.setBadgeBackgroundColor({
        color: '#f44336'
      });
    } else {
      // Hide badge if no problems due
      chrome.action.setBadgeText({
        text: ''
      });
    }
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

// Update badge on startup
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Update badge when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

/**
 * Reset all extension data
 * Clears all problems and resets settings to defaults
 */
async function resetAllData() {
  try {
    // Clear all problems
    await chrome.storage.local.remove(['problems']);

    // Reset settings to defaults
    await chrome.storage.local.set({ settings: { maxProblemsPerDay: 5 } });

    // Clear badge
    try {
      chrome.action.setBadgeText({ text: '' });
    } catch (e) {
      // Ignore badge errors
    }

    // Update badge count (should be 0 now)
    await updateBadge();
  } catch (error) {
    console.error('Error resetting data:', error);
    throw error;
  }
}

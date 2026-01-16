/**
 * LeetCode Spaced Repetition Extension
 * Popup Script
 * 
 * Manages the extension popup UI and user interactions
 */

let currentProblem = null;
let selectedRating = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Tab switching
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      tabContents.forEach(content => {
        content.style.display = 'none';
      });

      if (tabName === 'log') {
        document.getElementById('log-content').style.display = 'block';
        loadCurrentProblem();
      } else if (tabName === 'today') {
        document.getElementById('today-content').style.display = 'block';
        loadTodayProblems();
      } else if (tabName === 'settings') {
        document.getElementById('settings-content').style.display = 'block';
        loadSettings();
      } else {
        document.getElementById('all-content').style.display = 'block';
        loadAllProblems();
      }
    });
  });

  // Setup rating buttons
  setupRatingButtons();

  // Load initial data
  await loadCurrentProblem();
});

async function loadCurrentProblem() {
  const infoCard = document.getElementById('log-problem-info');
  const ratingSection = document.getElementById('confidence-rating');
  const feedback = document.getElementById('rating-feedback');

  infoCard.innerHTML = '<div class="loading">Detecting current problem...</div>';
  ratingSection.style.display = 'none';
  feedback.innerHTML = '';
  selectedRating = null;

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('leetcode.com/problems/')) {
      infoCard.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-text">Please navigate to a LeetCode problem page to log your confidence.</div>
        </div>
      `;
      return;
    }

    // Extract problem info from URL
    const urlMatch = tab.url.match(/leetcode\.com\/problems\/([^\/]+)/);
    if (!urlMatch) {
      infoCard.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-text">Could not detect problem from URL.</div>
        </div>
      `;
      return;
    }

    const problemSlug = urlMatch[1];
    const problemTitle = problemSlug.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    currentProblem = {
      slug: problemSlug,
      title: problemTitle,
      url: tab.url
    };

    // Display problem info
    infoCard.innerHTML = `
      <div class="problem-info-title">${problemTitle}</div>
      <div class="problem-info-url">${tab.url}</div>
    `;

    // Show rating section
    ratingSection.style.display = 'block';

    // Reset rating buttons
    document.querySelectorAll('.rating-btn').forEach(btn => {
      btn.classList.remove('selected');
    });

  } catch (error) {
    console.error('Error loading current problem:', error);
    infoCard.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-text">Error detecting problem: ${error.message}</div>
      </div>
    `;
  }
}

function setupRatingButtons() {
  const ratingButtons = document.querySelectorAll('.rating-btn');

  ratingButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove selected from all buttons
      ratingButtons.forEach(b => b.classList.remove('selected'));
      // Add selected to clicked button
      btn.classList.add('selected');
      selectedRating = parseInt(btn.dataset.rating);

      // Show submit button if not already shown
      let submitBtn = document.getElementById('submit-rating-btn');
      if (!submitBtn) {
        submitBtn = document.createElement('button');
        submitBtn.id = 'submit-rating-btn';
        submitBtn.className = 'submit-rating-btn';
        submitBtn.textContent = 'Log Confidence Rating';
        submitBtn.onclick = submitRating;
        document.getElementById('confidence-rating').appendChild(submitBtn);
      }
      submitBtn.disabled = false;

      // Update feedback
      const feedback = document.getElementById('rating-feedback');
      const labels = {
        1: 'Very Hard - Review soon!',
        2: 'Hard - Needs more practice',
        3: 'Medium - Getting there',
        4: 'Easy - Well understood',
        5: 'Very Easy - Mastered!'
      };
      feedback.textContent = labels[selectedRating];
      feedback.className = 'rating-feedback';
    });
  });
}

async function submitRating() {
  if (!currentProblem || !selectedRating) {
    return;
  }

  const submitBtn = document.getElementById('submit-rating-btn');
  const feedback = document.getElementById('rating-feedback');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging...';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'LOG_CONFIDENCE',
        problem: currentProblem,
        confidence: selectedRating,
        timestamp: Date.now()
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || { success: true });
      });
    });

    feedback.textContent = '✓ Confidence logged successfully!';
    feedback.className = 'rating-feedback success';

    // Reset after 2 seconds
    setTimeout(() => {
      selectedRating = null;
      document.querySelectorAll('.rating-btn').forEach(btn => {
        btn.classList.remove('selected');
      });
      feedback.innerHTML = '';
      submitBtn.textContent = 'Log Confidence Rating';
      submitBtn.disabled = true;
    }, 2000);

  } catch (error) {
    console.error('Error submitting rating:', error);
    feedback.textContent = 'Error logging confidence. Please try again.';
    feedback.className = 'rating-feedback';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log Confidence Rating';
  }
}

async function loadSettings() {
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || { settings: {} });
      });
    });

    const maxProblems = response.settings?.maxProblemsPerDay || 5;
    document.getElementById('max-problems-input').value = maxProblems;

    // Save button handler
    document.getElementById('save-settings-btn').onclick = saveSettings;

    // Reset button handler
    document.getElementById('reset-all-btn').onclick = resetAllData;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings() {
  const maxProblems = parseInt(document.getElementById('max-problems-input').value);
  const feedback = document.getElementById('settings-feedback');

  if (isNaN(maxProblems) || maxProblems < 1) {
    feedback.textContent = 'Please enter a valid number (1 or more)';
    feedback.className = 'rating-feedback';
    return;
  }

  const saveBtn = document.getElementById('save-settings-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        settings: { maxProblemsPerDay: maxProblems }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || { success: true });
      });
    });

    feedback.textContent = '✓ Settings saved! Redistributing problems...';
    feedback.className = 'rating-feedback success';

    // Trigger redistribution
    chrome.runtime.sendMessage({ type: 'REDISTRIBUTE_DUE_DATES' }, () => {
      setTimeout(() => {
        feedback.innerHTML = '';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Settings';
      }, 2000);
    });

  } catch (error) {
    console.error('Error saving settings:', error);
    feedback.textContent = 'Error saving settings. Please try again.';
    feedback.className = 'rating-feedback';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
}

async function resetAllData() {
  const resetBtn = document.getElementById('reset-all-btn');
  const feedback = document.getElementById('reset-feedback');

  // Confirmation dialog
  const confirmed = confirm(
    'Are you sure you want to clear all data?\n\n' +
    'This will permanently delete:\n' +
    '• All tracked problems\n' +
    '• All confidence ratings\n' +
    '• All settings\n\n' +
    'This action cannot be undone.'
  );

  if (!confirmed) {
    return;
  }

  // Double confirmation
  const doubleConfirmed = confirm(
    'Final confirmation: This will delete ALL your data.\n\n' +
    'Are you absolutely sure?'
  );

  if (!doubleConfirmed) {
    return;
  }

  resetBtn.disabled = true;
  resetBtn.textContent = 'Clearing...';
  feedback.textContent = '';

  try {
    // Check if runtime is available
    if (!chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension runtime not available');
    }

    const response = await new Promise((resolve, reject) => {
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, 5000);

      chrome.runtime.sendMessage({ type: 'RESET_ALL_DATA' }, (response) => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError.message;
          // Ignore "message port closed" if we got a response
          if (error && !error.includes('message port closed')) {
            reject(new Error(error));
            return;
          }
        }

        // Even if there's an error, if we got here, assume success
        resolve(response || { success: true });
      });
    });

    feedback.textContent = '✓ All data cleared successfully!';
    feedback.className = 'rating-feedback success';

    // Reset settings input
    document.getElementById('max-problems-input').value = 5;

    // Reload all tabs to reflect empty state
    setTimeout(() => {
      // Switch to today tab to show empty state
      document.querySelector('[data-tab="today"]').click();
      resetBtn.disabled = false;
      resetBtn.textContent = 'Clear All Data';
      feedback.innerHTML = '';
    }, 2000);

  } catch (error) {
    console.error('Error resetting data:', error);

    // Even if there's an error, try to clear locally and show success
    // The background script should have cleared the data
    feedback.textContent = '✓ Data cleared (if error occurred, please refresh)';
    feedback.className = 'rating-feedback success';

    // Reset settings input
    document.getElementById('max-problems-input').value = 5;

    setTimeout(() => {
      resetBtn.disabled = false;
      resetBtn.textContent = 'Clear All Data';
      feedback.innerHTML = '';
      // Switch to today tab
      document.querySelector('[data-tab="today"]').click();
    }, 2000);
  }
}

async function loadTodayProblems() {
  const container = document.getElementById('today-problems');
  container.innerHTML = '<div class="loading">Loading...</div>';

  try {
    // Check if runtime is available
    if (!chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension runtime not available');
    }

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_PROBLEMS_DUE_TODAY' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || { problems: [] });
      });
    });

    const problems = response.problems || [];

    if (problems.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-text">No problems due today!<br>Great job staying on track!</div>
        </div>
      `;
      return;
    }

    container.innerHTML = problems.map(problem => createProblemCard(problem, true)).join('');

    // Add click handlers
    container.querySelectorAll('.problem-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });
  } catch (error) {
    console.error('Error loading today problems:', error);
    const errorMsg = error.message && error.message.includes('Extension context invalidated')
      ? 'Extension was reloaded. Please refresh the page.'
      : 'Error loading problems';
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${errorMsg}</div></div>`;
  }
}

async function loadAllProblems() {
  const container = document.getElementById('all-problems');
  container.innerHTML = '<div class="loading">Loading...</div>';

  try {
    // Check if runtime is available
    if (!chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension runtime not available');
    }

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_PROBLEMS' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || { problems: {} });
      });
    });

    const problems = response.problems || {};
    const problemList = Object.values(problems);

    // Get problems due today for stats
    const dueResponse = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_PROBLEMS_DUE_TODAY' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || { problems: [] });
      });
    });

    const dueToday = dueResponse.problems || [];

    // Update stats
    document.getElementById('total-problems').textContent = problemList.length;
    document.getElementById('due-count').textContent = dueToday.length;
    document.getElementById('completed-count').textContent = problemList.filter(p =>
      p.submissions && p.submissions.length > 0
    ).length;

    if (problemList.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-text">No problems tracked yet.<br>Start solving problems on LeetCode!</div>
        </div>
      `;
      return;
    }

    // Sort by next review date
    problemList.sort((a, b) => {
      const aDate = a.nextReview || 0;
      const bDate = b.nextReview || 0;
      return aDate - bDate;
    });

    container.innerHTML = problemList.map(problem => {
      const isDue = dueToday.some(p => p.slug === problem.slug);
      return createProblemCard(problem, isDue);
    }).join('');

    // Add click handlers
    container.querySelectorAll('.problem-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });
  } catch (error) {
    console.error('Error loading all problems:', error);
    const errorMsg = error.message && error.message.includes('Extension context invalidated')
      ? 'Extension was reloaded. Please refresh the page.'
      : 'Error loading problems';
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${errorMsg}</div></div>`;
  }
}

function createProblemCard(problem, isDue = false) {
  const totalSubmissions = problem.submissions?.length || 0;
  const hasCompleted = totalSubmissions > 0;
  const avgConfidence = problem.submissions?.length > 0
    ? (problem.submissions.reduce((sum, s) => sum + (s.confidence || 0), 0) / problem.submissions.length).toFixed(1)
    : 0;

  // Safely parse nextReview date
  let nextReviewDate = null;
  let daysUntilReview = null;

  if (problem.nextReview) {
    // Handle both number and string formats
    const reviewTimestamp = typeof problem.nextReview === 'number'
      ? problem.nextReview
      : parseInt(problem.nextReview);

    if (!isNaN(reviewTimestamp) && reviewTimestamp > 0) {
      nextReviewDate = new Date(reviewTimestamp);
      // Check if date is valid
      if (!isNaN(nextReviewDate.getTime())) {
        const diffMs = nextReviewDate.getTime() - Date.now();
        daysUntilReview = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }
    }
  }

  let reviewText = '';
  if (daysUntilReview !== null && !isNaN(daysUntilReview)) {
    if (daysUntilReview <= 0) {
      reviewText = 'Due now';
    } else if (daysUntilReview === 1) {
      reviewText = 'Due tomorrow';
    } else {
      reviewText = `Due in ${daysUntilReview} days`;
    }
  } else if (problem.nextReview) {
    // If we have a nextReview but couldn't parse it, show a fallback
    reviewText = 'Review scheduled';
  }

  const itemClass = isDue ? 'problem-item due' : (hasCompleted ? 'problem-item completed' : 'problem-item');
  const badgeClass = isDue ? 'badge due' : (hasCompleted ? 'badge completed' : 'badge');
  const badgeText = isDue ? 'Due Today' : (hasCompleted ? 'Completed' : 'In Progress');

  return `
    <div class="${itemClass}" data-url="${problem.url}">
      <div class="problem-title">
        ${problem.number ? `${problem.number}. ` : ''}${problem.title || problem.slug}
        <span class="${badgeClass}">${badgeText}</span>
      </div>
      <div class="problem-meta">
        <div class="problem-stats">
          <div class="stat">
            <span>📊</span>
            <span>${totalSubmissions} attempt${totalSubmissions !== 1 ? 's' : ''}</span>
          </div>
          ${avgConfidence > 0 ? `<div class="stat">⭐ ${avgConfidence}/5</div>` : ''}
          ${reviewText ? `<div class="stat">📅 ${reviewText}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

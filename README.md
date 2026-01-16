# LeetCode Spaced Repetition Chrome Extension

A Chrome extension that tracks your LeetCode problem practice using spaced repetition with confidence-based scheduling.

## Features

- **Manual Confidence Rating**: Log your confidence level (1-5) for each problem after solving it
- **Smart Scheduling**: Dynamic spaced repetition algorithm that prioritizes harder problems
- **Daily Review List**: See which problems are due for review today
- **Max Problems Per Day**: Set a limit on daily problems to avoid overload
- **Badge Counter**: Extension badge shows count of problems due today
- **Progress Tracking**: View all attempted problems with statistics and average confidence
- **Automatic Redistribution**: Problems are automatically rescheduled based on priority after each rating

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the extension directory

## Usage

### Logging Confidence

1. Navigate to any LeetCode problem page (e.g., `https://leetcode.com/problems/two-sum/`)
2. Solve the problem
3. Open the extension popup
4. Go to the **Log** tab
5. Select your confidence level:
   - **1 - Very Hard**: Struggled significantly
   - **2 - Hard**: Found it challenging
   - **3 - Medium**: Moderate difficulty
   - **4 - Easy**: Solved with ease
   - **5 - Very Easy**: Mastered it
6. Click "Log Confidence Rating"

### Viewing Your Schedule

- **Today Tab**: Shows problems due for review today
- **All Problems Tab**: View all tracked problems sorted by due date
- **Settings Tab**: Configure max problems per day

### Settings

- **Max Problems Per Day**: Set the maximum number of problems that can be due on any single day
  - When you change this setting, all problems are automatically redistributed
  - Hard problems are prioritized and scheduled before easy ones

## How Spaced Repetition Works

The extension uses a confidence-based spaced repetition algorithm:

- **Very Easy (5)**: Scheduled 7 days first time, then 30+ days
- **Easy (4)**: Scheduled 3 days first time, then 14+ days
- **Medium (3)**: Scheduled 1 day first time, then 7 days
- **Hard (2)**: Always scheduled for 1-2 days
- **Very Hard (1)**: Always scheduled for 1 day

### Dynamic Scheduling

After each rating, all problems are recalculated and redistributed:
- Hard problems are prioritized and scheduled before easy ones
- Problems are distributed across days respecting your max per day limit
- Historical performance is considered (consistently hard problems stay high priority)
- Problems are never scheduled for the same day they're logged (minimum 1 day)

## Technical Details

- **Content Script** (`src/content.js`): Detects current LeetCode problem from URL
- **Background Service Worker** (`src/background.js`): Manages data storage, spaced repetition calculations, and badge updates
- **Popup UI** (`src/popup.html`, `src/popup.js`): Displays problems, confidence rating interface, and settings
- **Storage**: Uses Chrome's local storage API to persist problem data locally
- **Badge**: Shows count of problems due today on extension icon

## Project Structure

```
leetcode-spaced-repetiton-extension/
├── src/                    # Source files
│   ├── background.js       # Service worker
│   ├── content.js          # Content script
│   ├── popup.html         # Popup UI
│   └── popup.js           # Popup logic
├── assets/                 # Icons and images
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── logo.svg
├── manifest.json          # Extension manifest
├── README.md              # Documentation
└── LICENSE                # MIT License
```

## Privacy

All data is stored locally in your browser. No data is sent to external servers.

## License

MIT License

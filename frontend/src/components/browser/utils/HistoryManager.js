/**
 * HistoryManager - Utility for browser navigation history management
 */

// In-memory storage for recent history entries
let historyEntries = [];
const MAX_HISTORY_SIZE = 1000;

/**
 * Add a URL to history
 * @param {Array} history - Current history array
 * @param {number} currentIndex - Current history index
 * @param {string} url - URL to add
 * @returns {Object} Updated history and index
 */
export function addToHistory(history, currentIndex, url) {
  if (!url) return { history, historyIndex: currentIndex };

  // If we're not at the most recent entry, truncate forward history
  let newHistory = [...history];
  if (currentIndex < history.length - 1) {
    newHistory = history.slice(0, currentIndex + 1);
  }
  
  // Add the new URL to the history
  newHistory.push(url);
  
  // Return updated history and index
  return {
    history: newHistory,
    historyIndex: newHistory.length - 1
  };
}

/**
 * Navigate back in history
 * @param {Array} history - Current history array
 * @param {number} currentIndex - Current history index
 * @returns {Object} New URL and updated index, or null if can't go back
 */
export function goBack(history, currentIndex) {
  if (currentIndex > 0) {
    const newIndex = currentIndex - 1;
    return {
      url: history[newIndex],
      historyIndex: newIndex
    };
  }
  return null;
}

/**
 * Navigate forward in history
 * @param {Array} history - Current history array
 * @param {number} currentIndex - Current history index
 * @returns {Object} New URL and updated index, or null if can't go forward
 */
export function goForward(history, currentIndex) {
  if (currentIndex < history.length - 1) {
    const newIndex = currentIndex + 1;
    return {
      url: history[newIndex],
      historyIndex: newIndex
    };
  }
  return null;
}

/**
 * Check if can go back
 * @param {number} currentIndex - Current history index
 * @returns {boolean} True if can go back
 */
export function canGoBack(currentIndex) {
  return currentIndex > 0;
}

/**
 * Check if can go forward
 * @param {Array} history - Current history array
 * @param {number} currentIndex - Current history index
 * @returns {boolean} True if can go forward
 */
export function canGoForward(history, currentIndex) {
  return currentIndex < history.length - 1;
}

/**
 * Get the current URL from history
 * @param {Array} history - Current history array
 * @param {number} currentIndex - Current history index
 * @returns {string} Current URL or empty string
 */
export function getCurrentUrl(history, currentIndex) {
  if (history.length === 0 || currentIndex < 0 || currentIndex >= history.length) {
    return '';
  }
  return history[currentIndex];
}

/**
 * Load browser history from local storage
 * @returns {Object} History array and current index
 */
export function loadHistory() {
  try {
    const savedHistory = localStorage.getItem('browser-history');
    const savedIndex = localStorage.getItem('browser-history-index');
    
    if (savedHistory) {
      return {
        history: JSON.parse(savedHistory),
        historyIndex: savedIndex ? parseInt(savedIndex, 10) : -1
      };
    }
  } catch (error) {
    console.error('Error loading browser history:', error);
  }
  
  return { history: [], historyIndex: -1 };
}

/**
 * Save browser history to local storage
 * @param {Array} history - History array
 * @param {number} historyIndex - Current history index
 */
export function saveHistory(history, historyIndex) {
  try {
    // Only save last 100 items to prevent localStorage from getting too big
    const trimmedHistory = history.slice(-100);
    let adjustedIndex = historyIndex;
    
    // Adjust index if we trimmed history
    if (history.length > 100) {
      adjustedIndex = historyIndex - (history.length - 100);
      if (adjustedIndex < 0) adjustedIndex = 0;
    }
    
    localStorage.setItem('browser-history', JSON.stringify(trimmedHistory));
    localStorage.setItem('browser-history-index', adjustedIndex.toString());
    return true;
  } catch (error) {
    console.error('Error saving browser history:', error);
    return false;
  }
}

/**
 * Try a direct navigation method (used for alternative navigation approaches)
 * @param {Object} browser - Browser instance
 * @param {string} url - URL to navigate to
 */
export function tryDirectNavigation(browser, url) {
  if (!url) return;
  
  console.log('Attempting direct navigation method for URL:', url);
  
  // Show loading content
  if (typeof browser.showLoadingContent === 'function') {
    browser.showLoadingContent(url);
  }
  
  // Use appropriate method for webview
  if (browser.webview) {
    if (browser.webview.tagName.toLowerCase() === 'webview') {
      try {
        if (typeof browser.webview.src === 'string') {
          // Set src directly
          browser.webview.src = url;
        } else if (typeof browser.webview.loadURL === 'function') {
          // Use loadURL method
          browser.webview.loadURL(url);
        }
      } catch (err) {
        console.error('Error in direct navigation:', err);
      }
    } else if (browser.contentFrame) {
      browser.contentFrame.src = url;
    }
  }
  
  // Update state
  browser.currentUrl = url;
  if (browser.searchInput) {
    browser.searchInput.value = url;
  }
}

/**
 * Handle back button action
 * @param {Object} browser - Browser instance
 */
export function handleBackAction(browser) {
  if (!browser) return;
  
  // Check if we can go back
  if (canGoBack(browser.state.historyPosition)) {
    // Get previous URL
    const result = goBack(browser.state.history, browser.state.historyPosition);
    
    if (result) {
      // Update browser state
      browser.setState({
        historyPosition: result.historyIndex,
        isLoading: true
      });
      
      // Navigate to the URL
      browser.navigate(result.url);
      
      // Update button states
      if (browser.backButton) {
        browser.backButton.disabled = !canGoBack(result.historyIndex);
      }
      if (browser.forwardButton) {
        browser.forwardButton.disabled = !canGoForward(browser.state.history, result.historyIndex);
      }
    }
  }
}

/**
 * Handle forward button action
 * @param {Object} browser - Browser instance
 */
export function handleForwardAction(browser) {
  if (!browser) return;
  
  // Check if we can go forward
  if (canGoForward(browser.state.history, browser.state.historyPosition)) {
    // Get next URL
    const result = goForward(browser.state.history, browser.state.historyPosition);
    
    if (result) {
      // Update browser state
      browser.setState({
        historyPosition: result.historyIndex,
        isLoading: true
      });
      
      // Navigate to the URL
      browser.navigate(result.url);
      
      // Update button states
      if (browser.backButton) {
        browser.backButton.disabled = !canGoBack(result.historyIndex);
      }
      if (browser.forwardButton) {
        browser.forwardButton.disabled = !canGoForward(browser.state.history, result.historyIndex);
      }
    }
  }
}

/**
 * Update the visited URLs history with a new URL
 * @param {Object} browser - Browser instance
 * @param {string} url - URL to add to history
 */
export function updateVisitedUrls(browser, url) {
  if (!browser || !url) return;
  
  // Update the history state
  const { history, historyIndex } = addToHistory(
    browser.state.history,
    browser.state.historyPosition,
    url
  );
  
  // Update the browser state
  browser.setState({
    history,
    historyPosition: historyIndex
  });
  
  // Save to localStorage
  saveHistory(history, historyIndex);
  
  // Update navigation buttons
  if (browser.backButton) {
    browser.backButton.disabled = !canGoBack(historyIndex);
  }
  if (browser.forwardButton) {
    browser.forwardButton.disabled = !canGoForward(history, historyIndex);
  }
}

/**
 * Create a history record object
 * @param {string} url - The URL
 * @param {string} title - The page title
 * @param {string} timestamp - ISO timestamp
 * @returns {Object} History record object
 */
export function createHistoryRecord(url, title, timestamp) {
  return {
    url: url || '',
    title: title || 'Untitled Page',
    timestamp: timestamp || new Date().toISOString(),
    id: `hist_${Date.now()}_${Math.floor(Math.random() * 10000)}`
  };
}

/**
 * Add a history entry to the persistent history
 * @param {Object} entry - History entry with url, title, favicon, visitedAt properties
 * @returns {Promise<Object>} Promise resolving to the added entry
 */
export function addHistoryEntry(entry) {
  if (!entry || !entry.url) {
    return Promise.reject(new Error('Invalid history entry'));
  }
  
  // Create a proper history record
  const historyRecord = {
    ...entry,
    id: `hist_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    visitedAt: entry.visitedAt || new Date().toISOString()
  };
  
  try {
    // Load existing history
    let savedEntries = [];
    try {
      const savedHistory = localStorage.getItem('browser-history-entries');
      if (savedHistory) {
        savedEntries = JSON.parse(savedHistory);
      }
    } catch (e) {
      console.error('Error loading history entries:', e);
    }
    
    // Add the new entry
    savedEntries.unshift(historyRecord);
    
    // Keep history size manageable
    if (savedEntries.length > MAX_HISTORY_SIZE) {
      savedEntries = savedEntries.slice(0, MAX_HISTORY_SIZE);
    }
    
    // Save to localStorage
    localStorage.setItem('browser-history-entries', JSON.stringify(savedEntries));
    
    // Update in-memory cache
    historyEntries = savedEntries;
    
    return Promise.resolve(historyRecord);
  } catch (error) {
    console.error('Error adding history entry:', error);
    return Promise.reject(error);
  }
}

/**
 * Get recent history entries
 * @param {number} limit - Maximum number of entries to return
 * @returns {Promise<Array>} Promise resolving to recent history entries
 */
export function getRecentHistory(limit = 20) {
  try {
    // Try to use in-memory cache first
    if (historyEntries.length > 0) {
      return Promise.resolve(historyEntries.slice(0, limit));
    }
    
    // Load from localStorage if cache is empty
    const savedHistory = localStorage.getItem('browser-history-entries');
    if (savedHistory) {
      try {
        const entries = JSON.parse(savedHistory);
        // Update cache
        historyEntries = entries;
        return Promise.resolve(entries.slice(0, limit));
      } catch (e) {
        console.error('Error parsing history entries:', e);
      }
    }
    
    // Return empty array if nothing found
    return Promise.resolve([]);
  } catch (error) {
    console.error('Error getting recent history:', error);
    return Promise.reject(error);
  }
}

/**
 * Search history entries
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Promise resolving to matching history entries
 */
export function searchHistory(query, limit = 10) {
  if (!query) {
    return Promise.resolve([]);
  }
  
  try {
    // Use in-memory cache or load from localStorage
    let entries = historyEntries;
    if (entries.length === 0) {
      const savedHistory = localStorage.getItem('browser-history-entries');
      if (savedHistory) {
        try {
          entries = JSON.parse(savedHistory);
          // Update cache
          historyEntries = entries;
        } catch (e) {
          console.error('Error parsing history entries during search:', e);
          return Promise.resolve([]);
        }
      }
    }
    
    // Search entries
    const lowerQuery = query.toLowerCase();
    const results = entries.filter(entry => 
      (entry.url && entry.url.toLowerCase().includes(lowerQuery)) || 
      (entry.title && entry.title.toLowerCase().includes(lowerQuery))
    ).slice(0, limit);
    
    return Promise.resolve(results);
  } catch (error) {
    console.error('Error searching history:', error);
    return Promise.reject(error);
  }
}

/**
 * Clear browser history
 * @param {Object} options - Options for clearing history
 * @param {string} options.timeRange - Time range to clear ('all', 'today', 'hour')
 * @returns {Promise<boolean>} Promise resolving to success flag
 */
export function clearHistory(options = {}) {
  try {
    const { timeRange = 'all' } = options;
    
    if (timeRange === 'all') {
      // Clear all history
      localStorage.removeItem('browser-history-entries');
      historyEntries = [];
      return Promise.resolve(true);
    }
    
    // Load existing history
    let entries = [];
    const savedHistory = localStorage.getItem('browser-history-entries');
    if (savedHistory) {
      try {
        entries = JSON.parse(savedHistory);
      } catch (e) {
        console.error('Error parsing history entries during clear:', e);
        return Promise.resolve(false);
      }
    }
    
    // Filter entries based on time range
    const now = new Date();
    let filteredEntries = [];
    
    if (timeRange === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filteredEntries = entries.filter(entry => {
        const visitTime = new Date(entry.visitedAt);
        return visitTime < today;
      });
    } else if (timeRange === 'hour') {
      const hourAgo = new Date(now.getTime() - (60 * 60 * 1000));
      filteredEntries = entries.filter(entry => {
        const visitTime = new Date(entry.visitedAt);
        return visitTime < hourAgo;
      });
    }
    
    // Save filtered entries
    localStorage.setItem('browser-history-entries', JSON.stringify(filteredEntries));
    historyEntries = filteredEntries;
    
    return Promise.resolve(true);
  } catch (error) {
    console.error('Error clearing history:', error);
    return Promise.reject(error);
  }
}

export default {
  addToHistory,
  goBack,
  goForward,
  canGoBack,
  canGoForward,
  getCurrentUrl,
  loadHistory,
  saveHistory,
  tryDirectNavigation,
  handleBackAction,
  handleForwardAction,
  updateVisitedUrls,
  createHistoryRecord,
  // New methods
  addHistoryEntry,
  getRecentHistory,
  searchHistory,
  clearHistory
}; 
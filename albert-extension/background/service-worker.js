// Albert Extension Service Worker
// Handles background tasks, keyboard shortcuts, and API communication

const CONFIG = {
  serverUrl: 'http://localhost:3001',
};

// Load config from storage on startup
chrome.storage.local.get(['serverUrl'], (result) => {
  if (result.serverUrl) {
    CONFIG.serverUrl = result.serverUrl;
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.serverUrl) {
    CONFIG.serverUrl = changes.serverUrl.newValue;
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Albert] Command received:', command);

  if (command === 'activate_voice') {
    // Get active tab and send message to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'START_VOICE' });
      } catch (e) {
        console.log('[Albert] Content script not ready, injecting...');
        // Content script might not be loaded, try opening popup
        // or notify user
      }
    }
  }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Albert] Message received:', message);

  switch (message.type) {
    case 'GET_CONFIG':
      sendResponse({ serverUrl: CONFIG.serverUrl });
      break;

    case 'SET_CONFIG':
      if (message.serverUrl) {
        CONFIG.serverUrl = message.serverUrl;
        chrome.storage.local.set({ serverUrl: message.serverUrl });
      }
      sendResponse({ success: true });
      break;

    case 'SEND_PAGE_CONTEXT':
      sendPageContext(message.context)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async

    case 'CHECK_CONNECTION':
      checkServerConnection()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ connected: false, error: error.message }));
      return true;
  }
});

// Send page context to Albert server
async function sendPageContext(context) {
  try {
    const response = await fetch(`${CONFIG.serverUrl}/api/extension/context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(context),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    return { success: true, ...result };
  } catch (error) {
    console.error('[Albert] Send context error:', error);
    return { success: false, error: error.message };
  }
}

// Check server connection
async function checkServerConnection() {
  try {
    const response = await fetch(`${CONFIG.serverUrl}/api/extension/context`, {
      method: 'GET',
    });

    return { connected: response.ok };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Albert] Extension installed:', details.reason);

  if (details.reason === 'install') {
    // Set default config
    chrome.storage.local.set({
      serverUrl: CONFIG.serverUrl,
      floatingButtonEnabled: true,
    });

    // Open welcome/setup page
    // chrome.tabs.create({ url: 'popup/popup.html' });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This won't fire since we have a popup, but keeping for reference
  console.log('[Albert] Icon clicked on tab:', tab.id);
});

// Context menu for right-click actions
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu items
  chrome.contextMenus.create({
    id: 'albert-ask-about',
    title: 'Ask Albert about this',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'albert-summarize',
    title: 'Summarize with Albert',
    contexts: ['page'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('[Albert] Context menu clicked:', info.menuItemId);

  const context = {
    url: tab.url,
    title: tab.title,
    timestamp: Date.now(),
  };

  if (info.menuItemId === 'albert-ask-about' && info.selectionText) {
    context.selectedText = info.selectionText;
    context.action = 'ask';
  } else if (info.menuItemId === 'albert-summarize') {
    context.action = 'summarize';
  }

  // Send to server
  const result = await sendPageContext(context);

  // Show notification
  if (result.success) {
    // Could show a notification or open popup
    console.log('[Albert] Context sent successfully');
  } else {
    console.error('[Albert] Failed to send context:', result.error);
  }
});

console.log('[Albert] Service worker loaded');

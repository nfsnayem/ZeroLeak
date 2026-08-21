// BlurShield Background Service Worker (Manifest V3)
// Production-grade context menu orchestration, badge state management, and messaging

/**
 * Re-registers all context menu items idempotently with the exact user layout:
 * - Blur This Element
 * - Unblur This Element
 * ──────────────
 * - Mask Selected Text
 * - Unmask Selected Text
 * ──────────────
 * - Select Element to Blur (Alt+Shift+B)
 */
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {}

    // 1. Root Parent Item
    chrome.contextMenus.create({
      id: 'blurshield-parent',
      title: 'BlurShield',
      contexts: ['all']
    }, onMenuCreated);

    // Group 1: Element Blur / Unblur
    chrome.contextMenus.create({
      id: 'blurshield-blur-element',
      parentId: 'blurshield-parent',
      title: 'Blur This Element',
      contexts: ['all']
    }, onMenuCreated);

    chrome.contextMenus.create({
      id: 'blurshield-unblur-element',
      parentId: 'blurshield-parent',
      title: 'Unblur This Element',
      contexts: ['all']
    }, onMenuCreated);

    // Separator 1
    chrome.contextMenus.create({
      id: 'blurshield-sep-1',
      parentId: 'blurshield-parent',
      type: 'separator',
      contexts: ['all']
    }, onMenuCreated);

    // Group 2: Text Mask / Unmask
    chrome.contextMenus.create({
      id: 'blurshield-mask-selection',
      parentId: 'blurshield-parent',
      title: 'Mask Selected Text',
      contexts: ['all']
    }, onMenuCreated);

    chrome.contextMenus.create({
      id: 'blurshield-unmask-selection',
      parentId: 'blurshield-parent',
      title: 'Unmask Selected Text',
      contexts: ['all']
    }, onMenuCreated);

    // Separator 2
    chrome.contextMenus.create({
      id: 'blurshield-sep-2',
      parentId: 'blurshield-parent',
      type: 'separator',
      contexts: ['all']
    }, onMenuCreated);

    // Group 3: Element Picker
    chrome.contextMenus.create({
      id: 'blurshield-pick-element',
      parentId: 'blurshield-parent',
      title: 'Select Element to Blur (Alt+Shift+B)',
      contexts: ['all']
    }, onMenuCreated);
  });
}

function onMenuCreated() {
  if (chrome.runtime.lastError) {
    // Suppress duplicate ID or transient registration warnings
  }
}

/**
 * Synchronize context menu state
 */
function syncContextMenusFromStorage() {
  setupContextMenus();
}

// Extension installation & upgrade initialization
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['blurshield_settings', 'blurshield_rules'], (result) => {
    const defaultSettings = {
      masterEnabled: true,
      blurIntensity: 8,
      phraseChar: '*',
      phraseColor: 'auto',
      hoverReveal: false
    };

    if (!result.blurshield_settings) {
      chrome.storage.local.set({ blurshield_settings: defaultSettings }, () => {
        setupContextMenus();
      });
    } else {
      setupContextMenus();
    }

    if (!result.blurshield_rules) {
      chrome.storage.local.set({ blurshield_rules: {} });
    }
  });
});

// Re-register context menus on service worker startup
chrome.runtime.onStartup.addListener(() => {
  syncContextMenusFromStorage();
});

// Listen for storage changes to dynamically sync badge
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.blurshield_settings || changes.blurshield_rules) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          updateBadgeForTab(tabs[0].id);
        }
      });
    }
  }
});

// Handle Context Menu clicks with full production logic
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  const payload = {
    action: '',
    text: (info.selectionText || '').trim(),
    srcUrl: info.srcUrl || null,
    linkUrl: info.linkUrl || null,
    mediaType: info.mediaType || null,
    pageUrl: info.pageUrl || tab.url || ''
  };

  switch (info.menuItemId) {
    case 'blurshield-blur-element':
      payload.action = 'BLUR_CLICKED_ELEMENT';
      break;

    case 'blurshield-unblur-element':
      payload.action = 'UNBLUR_CLICKED_ELEMENT';
      break;

    case 'blurshield-mask-selection':
      payload.action = 'MASK_SELECTION_TEXT';
      break;

    case 'blurshield-unmask-selection':
      payload.action = 'UNMASK_SELECTION_TEXT';
      break;

    case 'blurshield-pick-element':
      payload.action = 'START_PICKER';
      break;

    default:
      return;
  }

  // Ensure masterEnabled is active if user triggers a blur/mask action
  chrome.storage.local.get(['blurshield_settings'], (result) => {
    const settings = result.blurshield_settings || { masterEnabled: true };
    if (!settings.masterEnabled) {
      settings.masterEnabled = true;
      chrome.storage.local.set({ blurshield_settings: settings });
    }

    chrome.tabs.sendMessage(tab.id, payload, () => {
      if (chrome.runtime.lastError) {
        // Tab might be chrome:// or webstore where content scripts cannot run
      }
    });
  });
});

// Update badge on active tab change
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  updateBadgeForTab(activeInfo.tabId);
});

// Update badge when tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    updateBadgeForTab(tabId);
  }
});

// Listen for keyboard command shortcuts (Alt+Shift+B)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-picker') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_PICKER' }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
  }
});

// Listen for runtime messages from content script & popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'UPDATE_BADGE' && sender.tab) {
    updateBadgeText(sender.tab.id, message.count);
    sendResponse({ success: true });
  }
  return true;
});

/**
 * Reads tab domain and updates badge text and background color
 */
async function updateBadgeForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url || (!tab.url.startsWith('http') && !tab.url.startsWith('file'))) {
      chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }

    let domain = 'unknown';
    if (tab.url.startsWith('file:')) {
      domain = 'Local File';
    } else {
      domain = new URL(tab.url).hostname;
    }

    chrome.storage.local.get(['blurshield_settings', 'blurshield_rules'], (result) => {
      const settings = result.blurshield_settings || { masterEnabled: true };
      if (!settings.masterEnabled) {
        chrome.action.setBadgeText({ tabId, text: 'OFF' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' });
        return;
      }
      const rules = result.blurshield_rules || {};
      const count = (rules[domain] || []).length;
      updateBadgeText(tabId, count);
    });
  } catch (e) {
    // Ignore tab access errors
  }
}

function updateBadgeText(tabId, count) {
  if (count > 0) {
    chrome.action.setBadgeText({ tabId, text: String(count) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#6366f1' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}


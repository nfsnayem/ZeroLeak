// BlurShield Background Service Worker (Manifest V3)

function updateContextMenus(enabled = true) {
  chrome.contextMenus.removeAll(() => {
    if (!enabled) return;

    chrome.contextMenus.create({
      id: 'blurshield-mask-selection',
      title: 'Mask Selected Text with BlurShield',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'blurshield-blur-element',
      title: 'Blur This Element with BlurShield',
      contexts: ['page', 'image', 'link', 'video', 'audio']
    });
  });
}

function syncContextMenusFromStorage() {
  chrome.storage.local.get(['blurshield_settings'], (result) => {
    const settings = result.blurshield_settings;
    const isMasterEnabled = settings ? settings.masterEnabled !== false : true;
    updateContextMenus(isMasterEnabled);
  });
}

// Initialize default settings and context menus upon extension install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['blurshield_settings', 'blurshield_rules'], (result) => {
    if (!result.blurshield_settings) {
      chrome.storage.local.set({
        blurshield_settings: {
          masterEnabled: true,
          blurIntensity: 8,
          hoverReveal: false,
          maskStyle: 'blur' // 'blur' or 'redact'
        }
      }, () => {
        updateContextMenus(true);
      });
    } else {
      const isMasterEnabled = result.blurshield_settings.masterEnabled !== false;
      updateContextMenus(isMasterEnabled);
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

// Listen for storage changes to dynamically toggle context menus and badge
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.blurshield_settings) {
      const newSettings = changes.blurshield_settings.newValue;
      const isMasterEnabled = newSettings ? newSettings.masterEnabled !== false : true;
      updateContextMenus(isMasterEnabled);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          updateBadgeForTab(tabs[0].id);
        }
      });
    }
    if (changes.blurshield_rules) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          updateBadgeForTab(tabs[0].id);
        }
      });
    }
  }
});

// Sync context menu on service worker boot
syncContextMenusFromStorage();

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  chrome.storage.local.get(['blurshield_settings'], (result) => {
    const settings = result.blurshield_settings || { masterEnabled: true };
    if (settings.masterEnabled === false) return;

    if (info.menuItemId === 'blurshield-mask-selection') {
      const selectedText = (info.selectionText || '').trim();
      chrome.tabs.sendMessage(tab.id, {
        action: 'MASK_SELECTION_TEXT',
        text: selectedText
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    } else if (info.menuItemId === 'blurshield-blur-element') {
      chrome.tabs.sendMessage(tab.id, {
        action: 'BLUR_CLICKED_ELEMENT'
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
  });
});

// Update badge count or state on active tab change
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  updateBadgeForTab(activeInfo.tabId);
});

// Listen for keyboard command shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-picker') {
    chrome.storage.local.get(['blurshield_settings'], async (result) => {
      const settings = result.blurshield_settings || { masterEnabled: true };
      if (settings.masterEnabled === false) return;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_PICKER' }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    });
  }
});

// Listen for runtime messages to update badge and context menu item title
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'UPDATE_BADGE' && sender.tab) {
    updateBadgeText(sender.tab.id, message.count);
    sendResponse({ success: true });
  } else if (message.action === 'UPDATE_CONTEXT_MENU_TARGET') {
    let menuTitle = 'Blur This Element with BlurShield';

    if (message.isMasked) {
      if (message.maskType === 'text') {
        menuTitle = 'Unmask This Text with BlurShield';
      } else {
        menuTitle = 'Unblur This Element with BlurShield';
      }
    }

    chrome.contextMenus.update('blurshield-blur-element', {
      title: menuTitle
    }, () => {
      // Ignore if menu is not currently present (e.g. disabled)
      if (chrome.runtime.lastError) {}
    });
    sendResponse({ success: true });
  }
  return true;
});

async function updateBadgeForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url || !tab.url.startsWith('http')) {
      chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    const url = new URL(tab.url);
    const domain = url.hostname;

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

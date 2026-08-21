// BlurShield Popup Controller - 3-Tab Architecture

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const tabRuleCount = document.getElementById('tab-rule-count');

  // DOM Elements - Tab 1 (Controls)
  const masterSwitch = document.getElementById('master-switch');
  const masterStatusText = document.getElementById('master-status-text');
  const powerCard = document.getElementById('power-card');
  const domainText = document.getElementById('domain-text');
  const btnPickElement = document.getElementById('btn-pick-element');
  const blurSlider = document.getElementById('blur-slider');
  const blurValText = document.getElementById('blur-val-text');

  // Text Phrase Elements
  const btnQuickTextToggle = document.getElementById('btn-quick-text-toggle');
  const textMaskPanel = document.getElementById('text-mask-input-panel');
  const manualTextInput = document.getElementById('manual-text-input');
  const btnAddTextMask = document.getElementById('btn-add-text-mask');
  const charBtns = document.querySelectorAll('.char-btn');
  const customCharInput = document.getElementById('custom-char-input');
  const previewSample = document.getElementById('preview-sample');
  const phraseColorDots = document.querySelectorAll('#phrase-color-group .color-dot');
  const phraseColorPicker = document.getElementById('phrase-color-picker');
  const phraseColorPickerLabel = document.getElementById('phrase-color-picker-label');
  const hoverRevealSwitch = document.getElementById('hover-reveal-switch');

  // DOM Elements - Tab 2 (Masks / History)
  const rulesList = document.getElementById('rules-list');
  const ruleCount = document.getElementById('rule-count');
  const btnClearSite = document.getElementById('btn-clear-site');

  // DOM Elements - Tab 3 (Settings & Tools)
  const btnDonate = document.getElementById('btn-donate');
  const btnExportRules = document.getElementById('btn-export-rules');
  const btnImportRules = document.getElementById('btn-import-rules');
  const fileImport = document.getElementById('file-import');

  let activeTab = null;
  let currentDomain = '';
  let currentSettings = {
    masterEnabled: true,
    blurIntensity: 8,
    phraseChar: '*',
    phraseColor: 'auto',
    hoverReveal: false
  };
  let currentRules = {};

  // =========================================================================
  // 1. Tab Navigation Switching Logic
  // =========================================================================
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-target');

      navTabs.forEach(t => t.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });

  // =========================================================================
  // 2. Identify Current Tab & Domain
  // =========================================================================
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      activeTab = tabs[0];
      if (activeTab.url) {
        if (activeTab.url.startsWith('file://')) {
          currentDomain = 'Local File';
        } else if (activeTab.url.startsWith('http://') || activeTab.url.startsWith('https://')) {
          try {
            const parsed = new URL(activeTab.url);
            currentDomain = parsed.hostname || 'unknown';
          } catch (e) {
            currentDomain = 'Active Page';
          }
        } else {
          currentDomain = 'Browser System Tab';
        }
      } else {
        currentDomain = 'Unknown Page';
      }
    }
  } catch (e) {
    currentDomain = 'Unknown Page';
  }

  if (domainText) {
    domainText.textContent = currentDomain;
  }

  // =========================================================================
  // 3. Load Stored Settings and Rules
  // =========================================================================
  loadAllData();

  function loadAllData() {
    chrome.storage.local.get(['blurshield_settings', 'blurshield_rules'], (result) => {
      if (result.blurshield_settings) {
        currentSettings = { ...currentSettings, ...result.blurshield_settings };
      }
      currentRules = result.blurshield_rules || {};

      renderSettingsUI();
      renderRulesUI();

      // Remove preload class cleanly on next frame so subsequent user clicks animate smoothly,
      // but initial render / storage loading is instant with zero toggle sliding
      requestAnimationFrame(() => {
        setTimeout(() => {
          document.body.classList.remove('preload');
        }, 50);
      });
    });
  }

  function renderSettingsUI() {
    // Master switch
    if (masterSwitch) {
      masterSwitch.checked = currentSettings.masterEnabled;
    }
    if (masterStatusText) {
      if (currentSettings.masterEnabled) {
        masterStatusText.textContent = 'Active';
        masterStatusText.className = 'power-status';
      } else {
        masterStatusText.textContent = 'Deactive';
        masterStatusText.className = 'power-status off';
      }
    }
    if (powerCard) {
      if (currentSettings.masterEnabled) {
        powerCard.classList.remove('disabled');
      } else {
        powerCard.classList.add('disabled');
      }
    }

    // Toggle controls disabled state in Tab 1
    const tabControls = document.getElementById('tab-controls');
    if (tabControls) {
      if (currentSettings.masterEnabled) {
        tabControls.classList.remove('controls-disabled');
      } else {
        tabControls.classList.add('controls-disabled');
      }
      const interactiveElements = tabControls.querySelectorAll('input, button');
      interactiveElements.forEach((el) => {
        el.disabled = !currentSettings.masterEnabled;
      });
    }

    // Element Blur slider
    blurSlider.value = currentSettings.blurIntensity || 8;
    blurValText.textContent = `(${blurSlider.value}px)`;
    updateSliderFill(blurSlider.value);

    // Phrase Mask Character Presets
    const activeChar = currentSettings.phraseChar || '*';
    let matchedPreset = false;

    charBtns.forEach((btn) => {
      if (btn.getAttribute('data-char') === activeChar) {
        btn.classList.add('active');
        matchedPreset = true;
      } else {
        btn.classList.remove('active');
      }
    });

    if (!matchedPreset) {
      customCharInput.value = activeChar;
      customCharInput.classList.add('active');
    } else {
      customCharInput.value = '';
      customCharInput.classList.remove('active');
    }

    // Phrase Character Color Presets (#000000, #ffffff, or custom #38bdf8 picker)
    const color = currentSettings.phraseColor || '#000000';
    let matchedPresetColor = false;

    phraseColorDots.forEach((dot) => {
      const dotColor = dot.getAttribute('data-color');
      if (dotColor.toLowerCase() === color.toLowerCase()) {
        dot.classList.add('active');
        matchedPresetColor = true;
      } else {
        dot.classList.remove('active');
      }
    });

    if (!matchedPresetColor) {
      phraseColorPickerLabel.classList.add('active');
      phraseColorPickerLabel.style.background = color;
      phraseColorPicker.value = color.startsWith('#') && color.length === 7 ? color : '#38bdf8';
    } else {
      phraseColorPickerLabel.classList.remove('active');
    }

    if (previewSample) {
      previewSample.textContent = activeChar.repeat(3);
    }

    // Hover reveal
    hoverRevealSwitch.checked = !!currentSettings.hoverReveal;
  }

  function renderRulesUI() {
    const siteRules = currentRules[currentDomain] || [];
    const count = siteRules.length;
    
    if (ruleCount) ruleCount.textContent = count;
    if (tabRuleCount) tabRuleCount.textContent = count;
    const tabMasksTitle = document.getElementById('tab-masks-title');
    if (tabMasksTitle) tabMasksTitle.textContent = `Masks (${count})`;

    rulesList.innerHTML = '';

    if (siteRules.length === 0) {
      rulesList.innerHTML = `
        <div class="empty-rules">
          No masks saved for <strong>${escapeHTML(currentDomain)}</strong>.<br><br>
          Go to the <strong>Controls</strong> tab and click <em>"Pick Element"</em> or highlight any text on the page to blur.
        </div>
      `;
      return;
    }

    siteRules.forEach((rule) => {
      const item = document.createElement('div');
      item.className = 'rule-item';

      const isText = rule.type === 'text';
      const tagClass = isText ? 'rule-tag text-tag' : 'rule-tag';
      const tagText = isText ? 'TEXT' : 'ELEM';
      const labelText = isText ? `"${rule.text}"` : (rule.label || rule.selector);

      item.innerHTML = `
        <div class="rule-info" title="${escapeHTML(rule.selector || rule.text || '')}">
          <span class="${tagClass}">${tagText}</span>
          <span class="rule-label">${escapeHTML(labelText)}</span>
        </div>
        <div class="rule-actions">
          ${!isText ? `
            <button class="btn-icon locate-btn" title="Highlight on page">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          ` : ''}
          <button class="btn-icon delete-btn" title="Remove Mask">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      // Locate element event
      const locateBtn = item.querySelector('.locate-btn');
      if (locateBtn) {
        locateBtn.addEventListener('click', () => {
          if (activeTab && activeTab.id) {
            chrome.tabs.sendMessage(activeTab.id, {
              action: 'HIGHLIGHT_RULE',
              selector: rule.selector
            }, () => {
              if (chrome.runtime.lastError) {
                // Cleanly consume lastError if tab cannot receive messages
              }
            });
          }
        });
      }

      // Delete rule event
      item.querySelector('.delete-btn').addEventListener('click', () => {
        deleteRule(rule.id);
      });

      rulesList.appendChild(item);
    });
  }

  function saveSettings() {
    chrome.storage.local.set({ blurshield_settings: currentSettings }, () => {
      renderSettingsUI();
      notifyTabsStateChange();
    });
  }

  function notifyTabsStateChange() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        tabs.forEach(tab => {
          if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'STATE_CHANGED' }, () => {
              if (chrome.runtime.lastError) {
                // Cleanly consume lastError for system or unsupported tabs
              }
            });
          }
        });
      }
    });
  }

  function deleteRule(ruleId) {
    if (!currentRules[currentDomain]) return;
    currentRules[currentDomain] = currentRules[currentDomain].filter(r => r.id !== ruleId);
    chrome.storage.local.set({ blurshield_rules: currentRules }, () => {
      renderRulesUI();
      notifyTabsStateChange();
    });
  }

  // =========================================================================
  // 4. Tab 1 Event Listeners (Controls)
  // =========================================================================

  // Master Switch
  masterSwitch.addEventListener('change', (e) => {
    currentSettings.masterEnabled = e.target.checked;
    saveSettings();
  });

  // Pick Element Button
  btnPickElement.addEventListener('click', async () => {
    if (!currentSettings.masterEnabled) return;
    if (!activeTab || !activeTab.id) return;
    chrome.tabs.sendMessage(activeTab.id, { action: 'START_PICKER' }, () => {
      if (chrome.runtime.lastError) {
        // Tab does not allow content scripts (e.g. chrome:// or WebStore)
      }
      window.close();
    });
  });

  // Toggle Text Panel
  btnQuickTextToggle.addEventListener('click', () => {
    if (!currentSettings.masterEnabled) return;
    const isHidden = textMaskPanel.style.display === 'none';
    textMaskPanel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      manualTextInput.focus();
    }
  });

  // Add Text Mask Button
  btnAddTextMask.addEventListener('click', () => {
    if (!currentSettings.masterEnabled) return;
    const text = manualTextInput.value.trim();
    if (!text) return;

    if (!currentRules[currentDomain]) {
      currentRules[currentDomain] = [];
    }

    currentRules[currentDomain].push({
      id: 'text_' + Date.now(),
      type: 'text',
      text: text,
      label: `Text: "${text}"`,
      createdAt: Date.now()
    });

    chrome.storage.local.set({ blurshield_rules: currentRules }, () => {
      manualTextInput.value = '';
      textMaskPanel.style.display = 'none';
      renderRulesUI();
      notifyTabsStateChange();
    });
  });

  manualTextInput.addEventListener('keydown', (e) => {
    if (!currentSettings.masterEnabled) return;
    if (e.key === 'Enter') {
      btnAddTextMask.click();
    }
  });

  function updateSliderFill(val) {
    if (!blurSlider) return;
    const min = parseInt(blurSlider.min || 3, 10);
    const max = parseInt(blurSlider.max || 25, 10);
    const percentage = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    blurSlider.style.setProperty('--slider-fill', `${percentage}%`);
  }

  // Blur Intensity Slider (Live dragging)
  blurSlider.addEventListener('input', (e) => {
    if (!currentSettings.masterEnabled) return;
    const val = parseInt(e.target.value, 10);
    blurValText.textContent = `(${val}px)`;
    updateSliderFill(val);
    currentSettings.blurIntensity = val;
    saveSettings();
  });

  blurSlider.addEventListener('change', () => {
    if (!currentSettings.masterEnabled) return;
    saveSettings();
  });

  // Phrase Mask Character Presets (*, #, $, •, X)
  charBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!currentSettings.masterEnabled) return;
      const char = btn.getAttribute('data-char');
      currentSettings.phraseChar = char;
      saveSettings();
    });
  });

  // Custom Character Input
  customCharInput.addEventListener('input', (e) => {
    if (!currentSettings.masterEnabled) return;
    const char = e.target.value.trim();
    if (char) {
      currentSettings.phraseChar = char.charAt(0);
      saveSettings();
    }
  });

  // Phrase Character Color Presets
  phraseColorDots.forEach((dot) => {
    dot.addEventListener('click', () => {
      if (!currentSettings.masterEnabled) return;
      const color = dot.getAttribute('data-color');
      currentSettings.phraseColor = color;
      saveSettings();
    });
  });

  // Phrase Character Color Picker (Native <input type="color"> handles open on click)
  phraseColorPicker.addEventListener('input', (e) => {
    if (!currentSettings.masterEnabled) return;
    const val = e.target.value;
    currentSettings.phraseColor = val;
    phraseColorPickerLabel.style.background = val;
    phraseColorDots.forEach(d => d.classList.remove('active'));
    phraseColorPickerLabel.classList.add('active');
    saveSettings();
  });

  phraseColorPicker.addEventListener('change', (e) => {
    if (!currentSettings.masterEnabled) return;
    const val = e.target.value;
    currentSettings.phraseColor = val;
    phraseColorPickerLabel.style.background = val;
    phraseColorDots.forEach(d => d.classList.remove('active'));
    phraseColorPickerLabel.classList.add('active');
    saveSettings();
  });

  // Hover to reveal
  hoverRevealSwitch.addEventListener('change', (e) => {
    if (!currentSettings.masterEnabled) return;
    currentSettings.hoverReveal = e.target.checked;
    saveSettings();
  });

  // =========================================================================
  // 5. Tab 2 Event Listeners (Site Masks) & Custom Modal
  // =========================================================================

  const confirmModal = document.getElementById('confirm-modal');
  const confirmModalMessage = document.getElementById('confirm-modal-message');
  const btnModalCancel = document.getElementById('btn-modal-cancel');
  const btnModalConfirm = document.getElementById('btn-modal-confirm');
  const toastNotification = document.getElementById('toast-notification');
  const toastText = document.getElementById('toast-text');
  let toastTimer = null;

  function showToast(message) {
    if (!toastNotification || !toastText) return;
    toastText.textContent = message;
    toastNotification.style.display = 'flex';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastNotification.style.display = 'none';
    }, 2800);
  }

  btnClearSite.addEventListener('click', () => {
    if (!currentRules[currentDomain] || currentRules[currentDomain].length === 0) return;
    
    confirmModalMessage.innerHTML = `Remove all <strong>${currentRules[currentDomain].length}</strong> mask(s) for <strong>${escapeHTML(currentDomain)}</strong> and reload page?`;
    confirmModal.style.display = 'flex';
  });

  btnModalCancel.addEventListener('click', () => {
    confirmModal.style.display = 'none';
  });

  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      confirmModal.style.display = 'none';
    }
  });

  btnModalConfirm.addEventListener('click', () => {
    confirmModal.style.display = 'none';
    currentRules[currentDomain] = [];
    chrome.storage.local.set({ blurshield_rules: currentRules }, () => {
      renderRulesUI();
      notifyTabsStateChange();
      if (activeTab && activeTab.id) {
        chrome.tabs.reload(activeTab.id);
      }
    });
  });

  // =========================================================================
  // 6. Tab 3 Event Listeners (Settings & Tools)
  // =========================================================================

  // Export rules to JSON
  btnExportRules.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentRules, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `blurshield_rules_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Rules exported to JSON file');
  });

  // Import rules from JSON
  btnImportRules.addEventListener('click', () => {
    fileImport.click();
  });

  fileImport.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (typeof imported === 'object') {
          currentRules = { ...currentRules, ...imported };
          chrome.storage.local.set({ blurshield_rules: currentRules }, () => {
            renderRulesUI();
            notifyTabsStateChange();
            showToast('Rules successfully imported!');
          });
        }
      } catch (err) {
        showToast('Invalid JSON rules file');
      }
    };
    reader.readAsText(file);
  });

  // Support / Donate
  if (btnDonate) {
    btnDonate.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://donate.stripe.com/4gM6oH9MLcj4g319Mj4gg01' });
    });
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }
});

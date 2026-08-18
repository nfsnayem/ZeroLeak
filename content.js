// BlurShield Production Content Script (Manifest V3)
// Features: Zero-FOUC Pre-Paint Injection, Element Blur + 1-to-1 Phrase Masking (*, #, $, •, X), Anti-Dynamic Class Sanitizer, Targeted Mutation TreeWalker

(function () {
  'use strict';

  if (window.__blurShieldInjected) return;
  window.__blurShieldInjected = true;

  const currentHost = window.location.protocol === 'file:' ? 'Local File' : (window.location.hostname || 'unknown');
  let isPickerActive = false;
  let hoveredElement = null;
  let hoverBox = null;
  let hoverTag = null;
  let pickerBanner = null;
  let textActionPopup = null;
  let observer = null;
  let rafPending = false;
  let pendingNodesToScan = new Set();

  // Cached state
  let currentSettings = {
    masterEnabled: true,
    blurIntensity: 8,
    phraseChar: '*',
    phraseColor: 'auto',
    hoverReveal: false
  };
  let currentRules = [];

  // Converts each non-whitespace character into the chosen mask character (e.g. "LET" -> "***")
  function maskStringToChar(str, maskChar) {
    const char = maskChar || '*';
    return str.replace(/[^\s\t\n\r]/g, char);
  }

  // =========================================================================
  // 1. Zero-FOUC Pre-Paint Style Injector for Elements
  // =========================================================================

  function injectPrePaintStyles(rules, settings) {
    if (!settings.masterEnabled) {
      removePrePaintStyles();
      return;
    }

    const elementRules = rules.filter(r => r.type === 'element' && r.selector);
    if (!elementRules.length) {
      removePrePaintStyles();
      return;
    }

    const selectors = elementRules.map(r => r.selector).join(',\n');
    const blurPx = settings.blurIntensity || 8;
    
    let cssText = `
      ${selectors} {
        filter: blur(${blurPx}px) !important;
        user-select: none !important;
        transition: filter 0.15s ease !important;
      }
    `;

    if (settings.hoverReveal) {
      cssText += `
        ${selectors}:hover {
          filter: none !important;
        }
      `;
    }

    let styleEl = document.getElementById('blurshield-pre-paint-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'blurshield-pre-paint-style';
      const target = document.head || document.documentElement;
      if (target) target.appendChild(styleEl);
    }
    styleEl.textContent = cssText;
  }

  function removePrePaintStyles() {
    const styleEl = document.getElementById('blurshield-pre-paint-style');
    if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
  }

  // =========================================================================
  // 2. Storage & Immediate Execution
  // =========================================================================

  function loadAndApply() {
    chrome.storage.local.get(['blurshield_settings', 'blurshield_rules'], (result) => {
      if (chrome.runtime.lastError) return;

      currentSettings = { ...currentSettings, ...(result.blurshield_settings || {}) };
      const allRules = result.blurshield_rules || {};
      currentRules = allRules[currentHost] || [];

      injectPrePaintStyles(currentRules, currentSettings);

      document.documentElement.style.setProperty(
        '--blurshield-amount',
        `${currentSettings.blurIntensity || 8}px`
      );
      document.documentElement.style.setProperty(
        '--blurshield-phrase-color',
        (!currentSettings.phraseColor || currentSettings.phraseColor === 'auto')
          ? 'inherit'
          : currentSettings.phraseColor
      );

      if (document.body) {
        applyAllRules();
      }

      notifyBadgeCount();
    });
  }

  function notifyBadgeCount() {
    try {
      chrome.runtime.sendMessage({
        action: 'UPDATE_BADGE',
        count: currentSettings.masterEnabled ? currentRules.length : 0
      }).catch(() => {});
    } catch (e) {}
  }

  // =========================================================================
  // 3. Rule Application & Live DOM Transformation
  // =========================================================================

  function applyAllRules() {
    if (!currentSettings.masterEnabled) {
      removeAllMasks();
      removePrePaintStyles();
      return;
    }

    injectPrePaintStyles(currentRules, currentSettings);

    const char = currentSettings.phraseChar || '*';
    const hoverClass = currentSettings.hoverReveal ? 'blurshield-hover-reveal' : '';

    // 1. Synchronize all ALREADY-MASKED element containers
    const activeElementIds = new Set(
      currentRules.filter(r => r.type === 'element').map(r => r.id)
    );

    document.querySelectorAll('.blurshield-masked-element').forEach((el) => {
      const ruleId = el.getAttribute('data-blurshield-id');
      // If the rule was deleted, unblur and restore the element immediately
      if (ruleId && !activeElementIds.has(ruleId)) {
        el.classList.remove('blurshield-masked-element', 'blurshield-hover-reveal');
        el.removeAttribute('data-blurshield-id');
        el.style.filter = '';
      } else {
        if (currentSettings.hoverReveal) {
          el.classList.add('blurshield-hover-reveal');
        } else {
          el.classList.remove('blurshield-hover-reveal');
        }
      }
    });

    // 2. Synchronize all ALREADY-MASKED text spans
    const activeTextPhrases = new Set(
      currentRules
        .filter(r => r.type === 'text' && r.text)
        .map(r => r.text.trim().toLowerCase())
    );

    document.querySelectorAll('.blurshield-text-phrase').forEach((span) => {
      const originalText = span.getAttribute('data-original-text') || span.textContent || '';
      // If the text rule was deleted, restore the original text node immediately
      if (!activeTextPhrases.has(originalText.trim().toLowerCase())) {
        const parent = span.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(originalText), span);
          parent.normalize();
        }
      } else {
        if (currentSettings.hoverReveal) {
          span.classList.add('blurshield-hover-reveal');
        } else {
          span.classList.remove('blurshield-hover-reveal');
        }
        span.textContent = maskStringToChar(originalText, char);
      }
    });

    // 3. Apply Element Rules for newly matching or untagged elements
    currentRules.forEach((rule) => {
      if (rule.type === 'element' && rule.selector) {
        try {
          const elements = document.querySelectorAll(rule.selector);
          elements.forEach((el) => {
            if (isExtensionElement(el)) return;
            el.classList.add('blurshield-masked-element');
            if (currentSettings.hoverReveal) {
              el.classList.add('blurshield-hover-reveal');
            } else {
              el.classList.remove('blurshield-hover-reveal');
            }
            el.setAttribute('data-blurshield-id', rule.id);
          });
        } catch (e) {}
      }
    });

    // 4. Scan for any unmasked target text phrases
    const textRules = currentRules.filter(r => r.type === 'text' && r.text && r.text.trim().length > 0);
    if (textRules.length > 0 && document.body) {
      scanSubtreeForText(document.body, textRules, hoverClass);
    }
  }

  function removeAllMasks() {
    document.querySelectorAll('.blurshield-masked-element').forEach((el) => {
      el.classList.remove('blurshield-masked-element', 'blurshield-hover-reveal');
    });

    document.querySelectorAll('.blurshield-text-phrase').forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        const original = mark.getAttribute('data-original-text') || mark.textContent || '';
        parent.replaceChild(document.createTextNode(original), mark);
        parent.normalize();
      }
    });
  }

  // =========================================================================
  // 4. Targeted Text Scanner with TreeWalker & 1-to-1 Character Masking
  // =========================================================================

  function scanSubtreeForText(rootNode, textRules, hoverClass) {
    if (!rootNode || isExtensionElement(rootNode)) return;

    const searchTexts = textRules.map(r => r.text.trim()).filter(Boolean);
    if (!searchTexts.length) return;

    const escapedTerms = searchTexts.map(t => escapeRegExp(t));
    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    const char = currentSettings.phraseChar || '*';

    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || isExtensionElement(parent)) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'textarea', 'input', 'code', 'pre'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.classList.contains('blurshield-text-phrase')) {
            return NodeFilter.FILTER_REJECT;
          }
          return regex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodesToReplace = [];
    while (walker.nextNode()) {
      nodesToReplace.push(walker.currentNode);
    }

    nodesToReplace.forEach(node => {
      const parent = node.parentNode;
      if (!parent) return;

      const text = node.nodeValue;
      regex.lastIndex = 0;
      const fragments = document.createDocumentFragment();
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragments.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
        }

        const span = document.createElement('span');
        span.className = `blurshield-text-phrase ${hoverClass}`.trim();
        span.setAttribute('data-original-text', match[0]);
        span.textContent = maskStringToChar(match[0], char);

        if (currentSettings.hoverReveal) {
          span.onmouseenter = () => { span.textContent = span.getAttribute('data-original-text'); };
          span.onmouseleave = () => { span.textContent = maskStringToChar(span.getAttribute('data-original-text'), char); };
        }

        fragments.appendChild(span);
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        fragments.appendChild(document.createTextNode(text.substring(lastIndex)));
      }

      parent.replaceChild(fragments, node);
    });
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // =========================================================================
  // 5. Localized MutationObserver for SPAs
  // =========================================================================

  function setupMutationObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (!currentSettings.masterEnabled || currentRules.length === 0) return;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (isExtensionElement(m.target)) continue;

        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j];
            if (node.nodeType === Node.ELEMENT_NODE && !isExtensionElement(node)) {
              pendingNodesToScan.add(node);
            }
          }
        }
      }

      if (pendingNodesToScan.size > 0 && !rafPending) {
        rafPending = true;
        requestAnimationFrame(flushPendingMutations);
      }
    });

    const target = document.body || document.documentElement;
    if (target) {
      observer.observe(target, {
        childList: true,
        subtree: true
      });
    }
  }

  function flushPendingMutations() {
    rafPending = false;
    if (!currentSettings.masterEnabled || !pendingNodesToScan.size) {
      pendingNodesToScan.clear();
      return;
    }

    const hoverClass = currentSettings.hoverReveal ? 'blurshield-hover-reveal' : '';
    const textRules = currentRules.filter(r => r.type === 'text' && r.text);

    pendingNodesToScan.forEach(node => {
      if (!node.isConnected) return;

      currentRules.forEach(rule => {
        if (rule.type === 'element' && rule.selector) {
          try {
            if (node.matches && node.matches(rule.selector)) {
              node.classList.add('blurshield-masked-element');
              if (hoverClass) node.classList.add(hoverClass);
            }
            if (node.querySelectorAll) {
              node.querySelectorAll(rule.selector).forEach(el => {
                if (!isExtensionElement(el)) {
                  el.classList.add('blurshield-masked-element');
                  if (hoverClass) el.classList.add(hoverClass);
                }
              });
            }
          } catch (e) {}
        }
      });

      if (textRules.length > 0) {
        scanSubtreeForText(node, textRules, hoverClass);
      }
    });

    pendingNodesToScan.clear();
  }

  // =========================================================================
  // 6. Strict Waterfall Selector Generator
  // =========================================================================

  const RANDOM_CLASS_REGEX = /^(x[0-9a-z]{5,}|css-[0-9a-z]+|sc-[0-9a-z]+|style_[0-9a-z]+|_[0-9a-z]{5,}|[a-f0-9]{8,}|jsx-[0-9]+|styled-[0-9a-z]+)$/i;
  const STATE_CLASS_REGEX = /^(active|is-active|hover|focus|selected|open|closed|visible|hidden|loading|show|disabled)$/i;
  const RANDOM_ID_REGEX = /^(:r[0-9a-z]+:|react-aria|[a-f0-9]{8,}|ember[0-9]+|uid-[0-9]+|temp-)/i;

  function isCleanClass(className) {
    if (!className || typeof className !== 'string') return false;
    if (className.startsWith('blurshield-')) return false;
    if (RANDOM_CLASS_REGEX.test(className)) return false;
    if (STATE_CLASS_REGEX.test(className)) return false;
    if (className.length < 2 || className.length > 35) return false;
    return true;
  }

  function isCleanId(id) {
    if (!id || typeof id !== 'string') return false;
    if (id.startsWith('blurshield-')) return false;
    if (RANDOM_ID_REGEX.test(id)) return false;
    if (/^\d+$/.test(id)) return false;
    return true;
  }

  function generateSelector(element) {
    if (!(element instanceof Element)) return null;

    if (element.id && isCleanId(element.id)) {
      return `#${CSS.escape(element.id)}`;
    }

    const testAttrs = ['data-testid', 'data-qa', 'data-cy', 'data-automation-id', 'data-id', 'aria-label', 'name'];
    for (const attr of testAttrs) {
      const val = element.getAttribute(attr);
      if (val && val.trim().length > 0 && val.length < 50 && !RANDOM_ID_REGEX.test(val)) {
        return `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
      }
    }

    const cleanClasses = Array.from(element.classList || []).filter(isCleanClass);
    if (cleanClasses.length > 0) {
      const classSelector = `${element.tagName.toLowerCase()}.${cleanClasses.slice(0, 2).map(c => CSS.escape(c)).join('.')}`;
      if (document.querySelectorAll(classSelector).length === 1) {
        return classSelector;
      }
    }

    const path = [];
    let curr = element;

    while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.documentElement) {
      if (curr === document.body) {
        path.unshift('body');
        break;
      }

      let segment = curr.tagName.toLowerCase();

      if (curr.id && isCleanId(curr.id)) {
        segment += `#${CSS.escape(curr.id)}`;
        path.unshift(segment);
        break;
      }

      const currClasses = Array.from(curr.classList || []).filter(isCleanClass);
      if (currClasses.length > 0) {
        segment += `.${CSS.escape(currClasses[0])}`;
      }

      const parent = curr.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(el => el.tagName === curr.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(curr) + 1;
          segment += `:nth-of-type(${index})`;
        }
      }

      path.unshift(segment);
      curr = curr.parentElement;

      if (path.length >= 4) break;
    }

    return path.join(' > ');
  }

  function getElementFriendlyName(element) {
    const tag = element.tagName.toLowerCase();
    const text = (element.innerText || element.textContent || '').trim().substring(0, 24);
    if (text) return `<${tag}> "${text}..."`;
    if (element.id && isCleanId(element.id)) return `<${tag}#${element.id}>`;
    return `<${tag}> element`;
  }

  // =========================================================================
  // 7. Element Picker Mode
  // =========================================================================

  function startElementPicker() {
    if (isPickerActive) return;
    isPickerActive = true;

    hoverBox = document.createElement('div');
    hoverBox.id = 'blurshield-hover-box';
    hoverTag = document.createElement('div');
    hoverTag.id = 'blurshield-hover-tag';
    hoverBox.appendChild(hoverTag);
    document.documentElement.appendChild(hoverBox);

    pickerBanner = document.createElement('div');
    pickerBanner.id = 'blurshield-picker-banner';
    pickerBanner.innerHTML = `
      <span class="blurshield-badge"></span>
      <span>Click any element to blur</span>
      <button id="blurshield-exit-btn">Exit (Esc)</button>
    `;
    document.documentElement.appendChild(pickerBanner);

    pickerBanner.querySelector('#blurshield-exit-btn').addEventListener('click', stopElementPicker);

    window.addEventListener('mousemove', onPickerMouseMove, true);
    window.addEventListener('click', onPickerClick, true);
    window.addEventListener('keydown', onPickerKeyDown, true);
  }

  function stopElementPicker() {
    if (!isPickerActive) return;
    isPickerActive = false;

    if (hoverBox && hoverBox.parentNode) hoverBox.parentNode.removeChild(hoverBox);
    if (pickerBanner && pickerBanner.parentNode) pickerBanner.parentNode.removeChild(pickerBanner);

    hoverBox = null;
    hoverTag = null;
    pickerBanner = null;
    hoveredElement = null;

    window.removeEventListener('mousemove', onPickerMouseMove, true);
    window.removeEventListener('click', onPickerClick, true);
    window.removeEventListener('keydown', onPickerKeyDown, true);
  }

  function onPickerMouseMove(e) {
    if (!isPickerActive) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || isExtensionElement(target)) return;

    hoveredElement = target;
    const rect = target.getBoundingClientRect();

    if (hoverBox && hoverTag) {
      hoverBox.style.display = 'block';
      hoverBox.style.top = `${rect.top}px`;
      hoverBox.style.left = `${rect.left}px`;
      hoverBox.style.width = `${rect.width}px`;
      hoverBox.style.height = `${rect.height}px`;

      const friendlyName = target.tagName.toLowerCase() + (target.id && isCleanId(target.id) ? `#${target.id}` : '');
      hoverTag.textContent = friendlyName;
    }
  }

  function onPickerClick(e) {
    if (!isPickerActive) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || isExtensionElement(target)) return;

    e.preventDefault();
    e.stopPropagation();

    const selector = generateSelector(target);
    const label = getElementFriendlyName(target);

    saveRule({
      id: 'elem_' + Date.now(),
      type: 'element',
      selector: selector,
      label: label,
      createdAt: Date.now()
    });

    target.classList.add('blurshield-masked-element');
    stopElementPicker();
  }

  function onPickerKeyDown(e) {
    if (e.key === 'Escape') {
      stopElementPicker();
      removeTextActionPopup();
    }
  }

  function isExtensionElement(element) {
    if (!element) return false;
    return !!(
      element.id?.startsWith('blurshield-') ||
      element.closest?.('#blurshield-picker-banner') ||
      element.closest?.('#blurshield-hover-box') ||
      element.closest?.('#blurshield-text-action-popup')
    );
  }

  // =========================================================================
  // 8. Context Menu Target Tracking & Quick Actions
  // =========================================================================

  let lastContextMenuTarget = null;

  // Track the element that was right-clicked for context menu actions
  document.addEventListener('contextmenu', (e) => {
    if (!isExtensionElement(e.target)) {
      lastContextMenuTarget = e.target;
    }
  }, true);

  function removeTextActionPopup() {
    if (textActionPopup && textActionPopup.parentNode) {
      textActionPopup.parentNode.removeChild(textActionPopup);
    }
    textActionPopup = null;
  }

  // =========================================================================
  // 9. Save & Delete Rules
  // =========================================================================

  function saveRule(newRule) {
    chrome.storage.local.get(['blurshield_rules'], (result) => {
      const allRules = result.blurshield_rules || {};
      if (!allRules[currentHost]) allRules[currentHost] = [];

      const exists = allRules[currentHost].some(
        r => (r.type === 'element' && r.selector === newRule.selector) ||
             (r.type === 'text' && r.text === newRule.text)
      );

      if (!exists) {
        allRules[currentHost].push(newRule);
        chrome.storage.local.set({ blurshield_rules: allRules }, () => {
          currentRules = allRules[currentHost];
          applyAllRules();
          notifyBadgeCount();
        });
      }
    });
  }

  // =========================================================================
  // 10. Runtime Communication & Listeners
  // =========================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'MASK_SELECTION_TEXT': {
        const textToMask = (message.text || window.getSelection()?.toString() || '').trim();
        if (textToMask) {
          const displayLabel = textToMask.length > 28
            ? `Text: "${textToMask.substring(0, 25)}..."`
            : `Text: "${textToMask}"`;
          saveRule({
            id: 'text_' + Date.now(),
            type: 'text',
            text: textToMask,
            label: displayLabel,
            createdAt: Date.now()
          });
          window.getSelection()?.removeAllRanges();
          removeTextActionPopup();
        }
        sendResponse({ success: true });
        break;
      }

      case 'BLUR_CLICKED_ELEMENT': {
        if (lastContextMenuTarget && !isExtensionElement(lastContextMenuTarget)) {
          const selector = generateSelector(lastContextMenuTarget);
          const label = getElementFriendlyName(lastContextMenuTarget);
          if (selector) {
            saveRule({
              id: 'elem_' + Date.now(),
              type: 'element',
              selector: selector,
              label: label,
              createdAt: Date.now()
            });
            lastContextMenuTarget.classList.add('blurshield-masked-element');
          }
        }
        sendResponse({ success: true });
        break;
      }

      case 'TOGGLE_PICKER':
        if (isPickerActive) stopElementPicker();
        else startElementPicker();
        sendResponse({ isPickerActive });
        break;

      case 'START_PICKER':
        startElementPicker();
        sendResponse({ success: true });
        break;

      case 'STOP_PICKER':
        stopElementPicker();
        sendResponse({ success: true });
        break;

      case 'STATE_CHANGED':
        loadAndApply();
        sendResponse({ success: true });
        break;

      case 'HIGHLIGHT_RULE':
        if (message.selector) {
          const el = document.querySelector(message.selector);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.outline = '3px solid #10b981';
            setTimeout(() => { el.style.outline = ''; }, 2000);
          }
        }
        sendResponse({ success: true });
        break;

      case 'GET_STATUS':
        sendResponse({
          currentHost,
          rulesCount: currentRules.length,
          masterEnabled: currentSettings.masterEnabled
        });
        break;
    }
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.blurshield_settings || changes.blurshield_rules)) {
      loadAndApply();
    }
  });

  // =========================================================================
  // 11. Delegated Hover-To-Reveal Handler for Phrases
  // =========================================================================

  document.addEventListener('mouseover', (e) => {
    if (!currentSettings.masterEnabled || !currentSettings.hoverReveal) return;
    const phraseSpan = e.target && e.target.closest ? e.target.closest('.blurshield-text-phrase') : null;
    if (phraseSpan) {
      const orig = phraseSpan.getAttribute('data-original-text');
      if (orig) phraseSpan.textContent = orig;
    }
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (!currentSettings.masterEnabled) return;
    const phraseSpan = e.target && e.target.closest ? e.target.closest('.blurshield-text-phrase') : null;
    if (phraseSpan) {
      const orig = phraseSpan.getAttribute('data-original-text');
      const char = currentSettings.phraseChar || '*';
      if (orig) phraseSpan.textContent = maskStringToChar(orig, char);
    }
  }, true);

  // =========================================================================
  // 12. Bootstrap
  // =========================================================================

  loadAndApply();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyAllRules();
      setupMutationObserver();
    });
  } else {
    applyAllRules();
    setupMutationObserver();
  }

})();

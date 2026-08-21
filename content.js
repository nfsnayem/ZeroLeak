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
          span.onmouseenter = () => { span.textContent = span.getAttribute('data-original-text'); };
          span.onmouseleave = () => { span.textContent = maskStringToChar(span.getAttribute('data-original-text'), char); };
        } else {
          span.classList.remove('blurshield-hover-reveal');
          span.onmouseenter = null;
          span.onmouseleave = null;
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

  function isUniqueSelector(selector, targetElement) {
    if (!selector) return false;
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && (!targetElement || matches[0] === targetElement);
    } catch (e) {
      return false;
    }
  }

  function getUniqueAttributeSelector(element) {
    if (!(element instanceof Element)) return null;
    const tag = element.tagName.toLowerCase();

    // 1. Check ID only if truly unique in DOM
    if (element.id && isCleanId(element.id)) {
      const idSel = `#${CSS.escape(element.id)}`;
      if (isUniqueSelector(idSel, element)) return idSel;
    }

    // 2. Check semantic & testing data attributes
    const testAttrs = [
      'data-testid', 'data-qa', 'data-cy', 'data-automation-id', 'data-id',
      'data-item-id', 'data-asin', 'data-video-id', 'data-tweet-id', 'data-post-id',
      'data-row-id', 'data-entry-id', 'data-key', 'name', 'aria-label', 'title'
    ];

    for (const attr of testAttrs) {
      const val = element.getAttribute(attr);
      if (val && val.trim().length > 0 && val.length < 80 && !RANDOM_ID_REGEX.test(val)) {
        const attrSel = `${tag}[${attr}="${CSS.escape(val)}"]`;
        if (isUniqueSelector(attrSel, element)) return attrSel;
      }
    }

    // 3. Check unique href / link target (essential for video cards, articles, social posts)
    if (element.hasAttribute('href')) {
      const href = element.getAttribute('href');
      if (href && href.length > 3 && href.length < 120 && !href.startsWith('#') && !href.startsWith('javascript:')) {
        const hrefSel = `${tag}[href="${CSS.escape(href)}"]`;
        if (isUniqueSelector(hrefSel, element)) return hrefSel;
      }
    }

    return null;
  }

  function generateSelector(element) {
    if (!(element instanceof Element)) return null;

    // Step 1: Check if element itself has a 100% unique selector
    const directUnique = getUniqueAttributeSelector(element);
    if (directUnique) return directUnique;

    // Step 2: Check clean class names on element if unique
    const cleanClasses = Array.from(element.classList || []).filter(isCleanClass);
    if (cleanClasses.length > 0) {
      const classSelector = `${element.tagName.toLowerCase()}.${cleanClasses.slice(0, 2).map(c => CSS.escape(c)).join('.')}`;
      if (isUniqueSelector(classSelector, element)) {
        return classSelector;
      }
    }

    // Step 3: Check if element is or is inside a repeating card (YouTube video, tweet, Reddit post, product card)
    // and can be uniquely anchored using CSS :has() with a unique child link/attribute
    let ancestor = element;
    let depth = 0;
    while (ancestor && ancestor !== document.body && depth < 7) {
      const uniqueChildLink = ancestor.querySelector('a[href*="watch?v="], a[href*="/shorts/"], a[href*="/status/"], a[href*="/comments/"], a[href*="/dp/"], a[href*="/p/"], a[href*="/item?"]');
      if (uniqueChildLink && uniqueChildLink.getAttribute('href')) {
        const hrefVal = uniqueChildLink.getAttribute('href');
        const cardTag = ancestor.tagName.toLowerCase();
        const hasCardSelector = `${cardTag}:has(a[href="${CSS.escape(hrefVal)}"])`;
        
        // 3a. Target the entire card / video item
        if (ancestor === element && isUniqueSelector(hasCardSelector, element)) {
          return hasCardSelector;
        }

        // 3b. Target a specific sub-component (e.g. Thumbnail, Title, Avatar, Price) inside the card
        if (ancestor !== element) {
          const targetTag = element.tagName.toLowerCase();

          // Try clean semantic child selector first (e.g., "ytd-thumbnail", "img", "#video-title", "a#thumbnail")
          const cleanSubSelectors = [];
          if (element.id && isCleanId(element.id)) {
            cleanSubSelectors.push(`${hasCardSelector} #${CSS.escape(element.id)}`);
          }
          cleanSubSelectors.push(`${hasCardSelector} ${targetTag}`);
          const cleanElemClasses = Array.from(element.classList || []).filter(isCleanClass);
          if (cleanElemClasses.length > 0) {
            cleanSubSelectors.push(`${hasCardSelector} ${targetTag}.${cleanElemClasses[0]}`);
          }

          for (const subSel of cleanSubSelectors) {
            if (isUniqueSelector(subSel, element)) {
              return subSel;
            }
          }

          // Direct child combinator path from the unique card to target element
          const subPath = [];
          let currSub = element;
          while (currSub && currSub !== ancestor) {
            let seg = currSub.tagName.toLowerCase();
            const parent = currSub.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(el => el.tagName === currSub.tagName);
              if (siblings.length > 1) {
                const index = siblings.indexOf(currSub) + 1;
                seg += `:nth-of-type(${index})`;
              }
            }
            subPath.unshift(seg);
            currSub = currSub.parentElement;
          }
          const fullHasSelector = `${hasCardSelector} > ${subPath.join(' > ')}`;
          if (isUniqueSelector(fullHasSelector, element)) {
            return fullHasSelector;
          }
        }
      }
      ancestor = ancestor.parentElement;
      depth++;
    }

    // Step 4: Robust Hierarchical Path climbing with :nth-of-type indexing
    const path = [];
    let curr = element;

    while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.documentElement) {
      if (curr === document.body) {
        path.unshift('body');
        break;
      }

      let segment = curr.tagName.toLowerCase();

      // Check if current ancestor has a unique ID in DOM
      if (curr.id && isCleanId(curr.id)) {
        const idSel = `#${CSS.escape(curr.id)}`;
        if (isUniqueSelector(idSel, curr)) {
          segment = idSel;
          path.unshift(segment);
          const candidate = path.join(' > ');
          if (isUniqueSelector(candidate, element)) {
            return candidate;
          }
          break;
        }
      }

      // Check if current ancestor has a unique data/href attribute
      const ancestorUnique = getUniqueAttributeSelector(curr);
      if (ancestorUnique && isUniqueSelector(ancestorUnique, curr)) {
        path.unshift(ancestorUnique);
        const candidate = path.join(' > ');
        if (isUniqueSelector(candidate, element)) {
          return candidate;
        }
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

      // Verify if current selector path is already 100% unique
      const testPath = path.join(' > ');
      if (isUniqueSelector(testPath, element)) {
        return testPath;
      }

      curr = curr.parentElement;
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
    }, (saved) => {
      if (saved) {
        showToast(`Blurred: ${label}`);
      } else {
        showToast(`Element already blurred`, 'info');
      }
    });

    target.classList.add('blurshield-masked-element');
    if (currentSettings.hoverReveal) {
      target.classList.add('blurshield-hover-reveal');
    }
    stopElementPicker();
  }

  function onPickerKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      stopElementPicker();
      removeTextActionPopup();
    }
  }

  // =========================================================================
  // Global In-Page Shortcut Listener for Alt+Shift+B (Instant DOM Trigger)
  // =========================================================================

  window.addEventListener('keydown', (e) => {
    // Check for Alt+Shift+B across all keyboard layouts and platforms
    if (e.altKey && e.shiftKey && (e.code === 'KeyB' || e.key === 'B' || e.key === 'b')) {
      e.preventDefault();
      e.stopPropagation();

      if (!currentSettings.masterEnabled) {
        showToast('BlurShield is currently paused', 'warning');
        return;
      }

      if (isPickerActive) {
        stopElementPicker();
      } else {
        startElementPicker();
        showToast('🎯 Element Picker active: Click any element (Esc to exit)', 'info', 2200);
      }
    }
  }, true);

  function isExtensionElement(element) {
    if (!element) return false;
    return !!(
      element.id?.startsWith('blurshield-') ||
      element.closest?.('#blurshield-picker-banner') ||
      element.closest?.('#blurshield-hover-box') ||
      element.closest?.('#blurshield-text-action-popup') ||
      element.closest?.('#blurshield-toast-container')
    );
  }

  // =========================================================================
  // 8. In-Page Modern Glassmorphic Toast Notifications
  // =========================================================================

  function showToast(message, type = 'success', duration = 2400) {
    let container = document.getElementById('blurshield-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'blurshield-toast-container';
      (document.body || document.documentElement).appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `blurshield-toast blurshield-toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div class="blurshield-toast-icon">${iconSvg}</div>
      <div class="blurshield-toast-message">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('blurshield-toast-exit');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
        if (container.children.length === 0 && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 250);
    }, duration);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // =========================================================================
  // 9. Context Menu Target Tracking & Production Handlers
  // =========================================================================

  let lastContextMenuTarget = null;
  let lastContextMenuCoords = { x: 0, y: 0 };

  // Find whether an element is currently masked by an element rule or phrase rule
  function findMaskedRuleForElement(el) {
    if (!el || isExtensionElement(el)) return null;

    // 1. Direct rule ID or class on element / ancestor
    const maskedContainer = el.closest ? el.closest('.blurshield-masked-element, [data-blurshield-id]') : null;
    if (maskedContainer) {
      const ruleId = maskedContainer.getAttribute('data-blurshield-id');
      if (ruleId) {
        const found = currentRules.find(r => r.id === ruleId);
        if (found) return found;
      }
      return { type: 'element', element: maskedContainer, label: 'Masked Element' };
    }

    // 2. Text phrase span
    const textSpan = el.closest ? el.closest('.blurshield-text-phrase') : null;
    if (textSpan) {
      const orig = (textSpan.getAttribute('data-original-text') || textSpan.textContent || '').trim().toLowerCase();
      const found = currentRules.find(r => r.type === 'text' && r.text && r.text.trim().toLowerCase() === orig);
      if (found) return found;
      return { type: 'text', text: orig, label: `Text: "${orig.substring(0, 20)}"` };
    }

    // 3. Match against active selector rules
    for (const rule of currentRules) {
      if (rule.type === 'element' && rule.selector) {
        try {
          if (el.matches(rule.selector) || (el.closest && el.closest(rule.selector))) {
            return rule;
          }
        } catch (e) {}
      }
    }

    return null;
  }

  // Remove/unblur rule(s) matching an element or text with user feedback
  function removeRulesForElement(targetEl) {
    if (!targetEl || isExtensionElement(targetEl)) {
      showToast('No active blur found on this element', 'info');
      return;
    }

    const maskedContainer = targetEl.closest ? targetEl.closest('.blurshield-masked-element, [data-blurshield-id]') : null;
    const ruleId = maskedContainer ? maskedContainer.getAttribute('data-blurshield-id') : null;

    const textSpan = targetEl.closest ? targetEl.closest('.blurshield-text-phrase') : null;
    const textOriginal = textSpan ? (textSpan.getAttribute('data-original-text') || textSpan.textContent || '').trim().toLowerCase() : null;

    chrome.storage.local.get(['blurshield_rules'], (result) => {
      const allRules = result.blurshield_rules || {};
      const hostRules = allRules[currentHost] || [];

      const initialCount = hostRules.length;
      let removedRuleLabel = '';

      const updatedRules = hostRules.filter(rule => {
        if (ruleId && rule.id === ruleId) {
          removedRuleLabel = rule.label || 'Element Blur';
          return false;
        }
        if (textOriginal && rule.type === 'text' && rule.text && rule.text.trim().toLowerCase() === textOriginal) {
          removedRuleLabel = rule.label || `Text: "${rule.text.substring(0, 20)}"`;
          return false;
        }
        if (rule.type === 'element' && rule.selector) {
          try {
            if (targetEl.matches(rule.selector) || (targetEl.closest && targetEl.closest(rule.selector))) {
              removedRuleLabel = rule.label || 'Element Blur';
              return false;
            }
          } catch (e) {}
        }
        return true;
      });

      if (updatedRules.length < initialCount) {
        allRules[currentHost] = updatedRules;
        chrome.storage.local.set({ blurshield_rules: allRules }, () => {
          currentRules = updatedRules;
          applyAllRules();
          notifyBadgeCount();
          showToast(`Unblurred: ${removedRuleLabel || 'Target item'}`);
        });
      } else if (maskedContainer) {
        // Fallback: If it had the class directly applied
        maskedContainer.classList.remove('blurshield-masked-element', 'blurshield-hover-reveal');
        maskedContainer.removeAttribute('data-blurshield-id');
        maskedContainer.style.filter = '';
        showToast('Blur removed from element');
      } else {
        showToast('No active blur found on this element', 'info');
      }
    });
  }

  // Find media element under right-clicked point or ancestor
  function resolveMediaTarget(targetEl, coords, srcUrl) {
    if (targetEl) {
      if (['img', 'video', 'svg', 'canvas', 'picture', 'audio', 'iframe'].includes(targetEl.tagName.toLowerCase())) {
        return targetEl;
      }
      const childMedia = targetEl.querySelector('img, video, svg, canvas, picture');
      if (childMedia) return childMedia;
      const parentMedia = targetEl.closest('img, video, svg, canvas, picture, [style*="background-image"]');
      if (parentMedia) return parentMedia;
    }

    if (coords && (coords.x || coords.y)) {
      const elAtPoint = document.elementFromPoint(coords.x, coords.y);
      if (elAtPoint) {
        const media = elAtPoint.closest('img, video, svg, canvas, picture') || elAtPoint.querySelector('img, video, svg, canvas, picture');
        if (media) return media;
      }
    }

    if (srcUrl) {
      try {
        const cleanUrl = srcUrl.split('?')[0];
        const match = document.querySelector(`img[src*="${CSS.escape(cleanUrl)}"], video[src*="${CSS.escape(cleanUrl)}"]`);
        if (match) return match;
      } catch (e) {}
    }

    return targetEl;
  }

  // Track the element and coordinates that were right-clicked
  document.addEventListener('contextmenu', (e) => {
    if (!isExtensionElement(e.target)) {
      lastContextMenuTarget = e.target;
      lastContextMenuCoords = { x: e.clientX, y: e.clientY };
    }
  }, true);

  function removeTextActionPopup() {
    if (textActionPopup && textActionPopup.parentNode) {
      textActionPopup.parentNode.removeChild(textActionPopup);
    }
    textActionPopup = null;
  }

  // =========================================================================
  // 10. Save & Delete Rules
  // =========================================================================

  function saveRule(newRule, onComplete) {
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
          if (onComplete) onComplete(true);
        });
      } else {
        if (onComplete) onComplete(false);
      }
    });
  }

  // =========================================================================
  // 11. Runtime Communication & Context Menu Listeners
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
          }, (saved) => {
            if (saved) {
              showToast(`Masked: "${textToMask.length > 20 ? textToMask.substring(0, 18) + '...' : textToMask}"`);
            } else {
              showToast(`Phrase is already masked`, 'info');
            }
          });
          window.getSelection()?.removeAllRanges();
          removeTextActionPopup();
        } else {
          showToast('Highlight text before selecting Mask Text', 'warning');
        }
        sendResponse({ success: true });
        break;
      }

      case 'BLUR_CLICKED_ELEMENT': {
        const target = lastContextMenuTarget || (lastContextMenuCoords.x ? document.elementFromPoint(lastContextMenuCoords.x, lastContextMenuCoords.y) : null);
        if (target && !isExtensionElement(target)) {
          const selector = generateSelector(target);
          const label = getElementFriendlyName(target);
          if (selector) {
            saveRule({
              id: 'elem_' + Date.now(),
              type: 'element',
              selector: selector,
              label: label,
              createdAt: Date.now()
            }, (saved) => {
              if (saved) {
                showToast(`Blurred: ${label}`);
              } else {
                showToast(`Element already blurred`, 'info');
              }
            });
            target.classList.add('blurshield-masked-element');
            if (currentSettings.hoverReveal) {
              target.classList.add('blurshield-hover-reveal');
            }
          }
        } else {
          showToast('Unable to detect target element', 'warning');
        }
        sendResponse({ success: true });
        break;
      }

      case 'UNBLUR_CLICKED_ELEMENT': {
        const target = lastContextMenuTarget || (lastContextMenuCoords.x ? document.elementFromPoint(lastContextMenuCoords.x, lastContextMenuCoords.y) : null);
        if (target && !isExtensionElement(target)) {
          removeRulesForElement(target);
        } else {
          showToast('No active blur found on this element', 'info');
        }
        sendResponse({ success: true });
        break;
      }

      case 'UNMASK_SELECTION_TEXT': {
        const selectedText = (message.text || window.getSelection()?.toString() || '').trim();
        const target = lastContextMenuTarget || (lastContextMenuCoords.x ? document.elementFromPoint(lastContextMenuCoords.x, lastContextMenuCoords.y) : null);
        
        let textToUnmask = selectedText;
        if (!textToUnmask && target) {
          const phraseSpan = target.closest ? target.closest('.blurshield-text-phrase') : null;
          if (phraseSpan) {
            textToUnmask = (phraseSpan.getAttribute('data-original-text') || phraseSpan.textContent || '').trim();
          }
        }

        if (textToUnmask) {
          const targetLower = textToUnmask.toLowerCase();
          chrome.storage.local.get(['blurshield_rules'], (result) => {
            const allRules = result.blurshield_rules || {};
            const hostRules = allRules[currentHost] || [];
            const initialCount = hostRules.length;

            const updatedRules = hostRules.filter(rule => {
              if (rule.type === 'text' && rule.text && rule.text.trim().toLowerCase() === targetLower) {
                return false;
              }
              return true;
            });

            if (updatedRules.length < initialCount) {
              allRules[currentHost] = updatedRules;
              chrome.storage.local.set({ blurshield_rules: allRules }, () => {
                currentRules = updatedRules;
                applyAllRules();
                notifyBadgeCount();
                showToast(`Unmasked: "${textToUnmask.length > 20 ? textToUnmask.substring(0, 18) + '...' : textToUnmask}"`);
              });
            } else {
              showToast(`No masked rule found for "${textToUnmask.substring(0, 18)}"`, 'info');
            }
          });
        } else {
          showToast('Highlight text or right-click masked text to unmask', 'info');
        }
        sendResponse({ success: true });
        break;
      }

      case 'BLUR_ALL_SENSITIVE': {
        // Scan for email addresses on current page
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
        const pageText = document.body ? document.body.innerText : '';
        const matches = Array.from(new Set(pageText.match(emailRegex) || [])).slice(0, 15);

        if (matches.length > 0) {
          chrome.storage.local.get(['blurshield_rules'], (result) => {
            const allRules = result.blurshield_rules || {};
            if (!allRules[currentHost]) allRules[currentHost] = [];

            let addedCount = 0;
            matches.forEach((email) => {
              const exists = allRules[currentHost].some(r => r.type === 'text' && r.text.toLowerCase() === email.toLowerCase());
              if (!exists) {
                allRules[currentHost].push({
                  id: 'text_' + Math.random().toString(36).substr(2, 9),
                  type: 'text',
                  text: email,
                  label: `Email: ${email.substring(0, 18)}...`,
                  createdAt: Date.now()
                });
                addedCount++;
              }
            });

            if (addedCount > 0) {
              chrome.storage.local.set({ blurshield_rules: allRules }, () => {
                currentRules = allRules[currentHost];
                applyAllRules();
                notifyBadgeCount();
                showToast(`Masked ${addedCount} email(s) on this page`);
              });
            } else {
              showToast(`All detected emails are already masked`, 'info');
            }
          });
        } else {
          showToast(`No unmasked email addresses detected on this page`, 'info');
        }
        sendResponse({ success: true });
        break;
      }

      case 'CLEAR_SITE_RULES': {
        chrome.storage.local.get(['blurshield_rules'], (result) => {
          const allRules = result.blurshield_rules || {};
          const count = (allRules[currentHost] || []).length;
          allRules[currentHost] = [];

          chrome.storage.local.set({ blurshield_rules: allRules }, () => {
            currentRules = [];
            removeAllMasks();
            removePrePaintStyles();
            notifyBadgeCount();
            showToast(`Cleared ${count} blur rule(s) for this site`);
          });
        });
        sendResponse({ success: true });
        break;
      }

      case 'MASTER_TOGGLED': {
        currentSettings.masterEnabled = !!message.masterEnabled;
        loadAndApply();
        showToast(
          currentSettings.masterEnabled ? '🛡️ BlurShield Resumed' : '⏸️ BlurShield Paused',
          currentSettings.masterEnabled ? 'success' : 'info'
        );
        sendResponse({ success: true });
        break;
      }

      case 'TOGGLE_PICKER':
        if (!currentSettings.masterEnabled) {
          showToast('BlurShield is currently paused', 'warning');
          sendResponse({ isPickerActive: false, error: 'MASTER_DISABLED' });
          break;
        }
        if (isPickerActive) {
          stopElementPicker();
        } else {
          startElementPicker();
          showToast('🎯 Element Picker active: Click any element', 'info', 2000);
        }
        sendResponse({ isPickerActive });
        break;

      case 'START_PICKER':
        if (!currentSettings.masterEnabled) {
          showToast('BlurShield is currently paused', 'warning');
          sendResponse({ success: false, error: 'MASTER_DISABLED' });
          break;
        }
        startElementPicker();
        showToast('🎯 Element Picker active: Click any element', 'info', 2000);
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
      if (orig && phraseSpan.textContent !== orig) {
        phraseSpan.textContent = orig;
      }
    }
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (!currentSettings.masterEnabled) return;
    const phraseSpan = e.target && e.target.closest ? e.target.closest('.blurshield-text-phrase') : null;
    if (phraseSpan) {
      if (e.relatedTarget && phraseSpan.contains(e.relatedTarget)) return;
      const orig = phraseSpan.getAttribute('data-original-text');
      const char = currentSettings.phraseChar || '*';
      const masked = maskStringToChar(orig, char);
      if (orig && phraseSpan.textContent !== masked) {
        phraseSpan.textContent = masked;
      }
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

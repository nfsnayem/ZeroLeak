<div align="center">

# 🛡️ BlurShield

**Privacy & Content Masking Extension for Google Chrome**  
*Permanently blur, mask, and redact sensitive elements and text across page refreshes with zero flash of unstyled content (FOUC).*

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-6366f1?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-f7df1e?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge)](LICENSE)
[![Support](https://img.shields.io/badge/Support-Stripe-e11d48?style=for-the-badge&logo=stripe&logoColor=white)](https://donate.stripe.com/4gM6oH9MLcj4g319Mj4gg01)

</div>

---

## 🌟 Overview

**BlurShield** is a lightweight, high-performance Chrome Extension designed for content creators, remote presenters, developers, and privacy-conscious users. It allows you to conceal sensitive client data, account numbers, private balances, names, and proprietary information on any webpage with persistent, reload-proof protection.

---

## ✨ Key Features

### 🔲 1. Element Masking (Gaussian Blur)
- **Interactive Visual Inspector**: Click `Pick Element` or press `Alt+Shift+B` to highlight and select any container, card, table, image, or section on the page.
- **Customizable Blur Radius**: Smooth slider ranging from `3px` to `25px` with an interactive colored progress fill and live page preview.
- **Anti-Dynamic Class Sanitizer**: Intelligently cleans auto-generated framework class hashes (e.g., Tailwind, CSS Modules, styled-components) to generate robust, persistent CSS selectors.

### 🔤 2. Phrase & Text Masking
- **1-to-1 Character Replacement**: Replaces every character of specified words or sentences with your chosen mask character (`*`, `#`, `$`, or custom `?`) while preserving natural word spacing.
  - Example: `"Secret Account"` ➔ `****** *******`
- **Clean Inline Aesthetics**: Seamless inline rendering without awkward background badges or dashed borders.
- **Auto Background-Adaptive Contrast**:
  - Automatically renders dark text on light backgrounds (`#ffffff`) and white text on dark backgrounds (`#000000`).
  - Includes manual color swatches (White, Black) and an interactive **Color Picker**.

### 👁️ 3. Real-Time Hover-to-Reveal
- Reveal masked content while hovering with the cursor.
- Instant live switching without requiring a page refresh.

### ⚡ 4. Zero-FOUC Architecture
- Uses `run_at: document_start` pre-paint style injection. Target elements and phrases are blurred before the browser paints the initial frame, preventing data leakage during screen recordings.

### 🖱️ 5. Clean, Production-Grade Context Menus
- **Intuitive Right-Click Actions**:
  - `Blur This Element`: Blurs the right-clicked container, card, image, or section.
  - `Unblur This Element`: Removes active blur rule from the clicked element.
  - `──────────────`
  - `Mask Selected Text`: Masks highlighted words or phrases with 1-to-1 character replacement.
  - `Unmask Selected Text`: Restores masked text phrases.
  - `──────────────`
  - `Select Element to Blur (Alt+Shift+B)`: Launches the interactive visual inspector.
- **Glassmorphic In-Page Feedback**: Real-time subtle floating toasts confirm actions without breaking page flow.

### 📋 6. Site Rules & Backup Management
- **Dedicated Masks Tab**: View, locate (🔍), or delete (🗑️) active masks per domain.
- **One-Click Clear All**: Wipe all rules for a website with confirmation and automatic page refresh.
- **JSON Export & Import**: Backup, transfer, or restore your privacy configurations across different browsers.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> | Toggle Visual Element Picker mode on the active tab |

---

## 📂 Project Structure

```text
├── manifest.json        # Chrome Extension Manifest (V3)
├── background.js        # Service Worker (Keyboard shortcuts & badge updates)
├── content.js           # Core content script (Pre-paint injection, TreeWalker, mutations)
├── content.css          # Masking styles (Gaussian blur, inline text, hover reveal)
├── popup.html           # 3-Tab popup dashboard (Controls, Masks, Settings)
├── popup.js             # UI controller, state sync, and storage manager
├── popup.css            # Dark theme design system & Inter typography
├── icons/               # Extension icons (16px, 48px, 128px)
└── README.md            # Documentation
```

---

## 🚀 Installation & Local Development

1. Clone or download this repository:
   ```bash
   git clone https://github.com/your-username/blurshield.git
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the root directory of this repository.
5. Click the **BlurShield** icon in your browser toolbar to start masking!

---

## 🔒 Permissions & Security

BlurShield strictly operates on your local machine and never collects, transmits, or logs any personal data:

- **`storage`**: Used to save your masking rules locally using `chrome.storage.local`.
- **`activeTab` & `scripting`**: Required to inspect elements and inject masking styles into open tabs.
- **`<all_urls>`**: Allows masking rules to persist across all websites you choose to protect.

---

## 💖 Support the Project

BlurShield is free and open-source. If this tool helps protect your privacy during presentations or daily work, consider supporting development:

[![Support via Stripe](https://img.shields.io/badge/Donate-Stripe-6366f1?style=for-the-badge&logo=stripe&logoColor=white)](https://donate.stripe.com/4gM6oH9MLcj4g319Mj4gg01)

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

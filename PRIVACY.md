# Privacy Policy for BlurShield

**Effective Date:** August 18, 2026  
**Last Updated:** August 18, 2026  

BlurShield ("we", "our", or "the Extension") is committed to protecting your privacy. This Privacy Policy explains our practices regarding the collection, use, and disclosure of information through the BlurShield Chrome Extension.

---

### 1. Summary of Core Principles
- **No Data Collection:** BlurShield does **NOT** collect, log, transmit, or sell any personal data, browsing history, keystrokes, or page content.
- **100% Local Execution:** All masking, blurring, and rule matching operations occur directly inside your browser on your local device.
- **No Remote Servers or Analytics:** We do not maintain external servers, databases, or third-party tracking scripts (such as Google Analytics).

---

### 2. Information We Handle and Why

BlurShield only handles the minimal data necessary to provide its core functionality:

#### A. User Configuration & Masking Rules (Stored Locally)
- **What:** Blur intensities, custom masked phrases/words, DOM element selectors, and site-specific toggle states.
- **Where:** Stored strictly on your local device using the standard Chrome Storage API (`chrome.storage.local`).
- **Access:** This data is never sent to external servers or accessible to third parties.

#### B. Webpage Content & Interaction
- **What:** When you activate the Visual Element Picker or set up a blur rule, BlurShield identifies DOM elements and text nodes on the currently active tab.
- **Processing:** This processing happens purely in memory within the client-side JavaScript sandbox of the webpage you are viewing. No webpage text, images, or metadata are ever saved or transmitted.

---

### 3. Permissions Used and Justification

- **`storage`**: Used exclusively to save your masking configurations locally on your machine.
- **`activeTab` & `scripting`**: Required to allow you to visually pick and blur elements on the page currently in view.
- **`contextMenus`**: Used to provide convenient right-click options (e.g., "Blur Selected Element").
- **`<all_urls>` (Host Permissions)**: Allows your configured blur and masking rules to persist across all websites you choose to protect and apply immediately at page load (zero-FOUC).

---

### 4. Third-Party Sharing and Tracking
- We do **NOT** sell, rent, trade, or monetize your data under any circumstances.
- We do **NOT** use tracking cookies, tracking pixels, or third-party advertising SDKs.
- We do **NOT** use any remote code or external JavaScript libraries loaded from third-party CDNs.

---

### 5. Data Retention and Deletion
You maintain complete control over all data stored by BlurShield:
- You can delete rules for individual websites or clear all stored data at any time directly through the extension's popup dashboard.
- Uninstalling BlurShield from Google Chrome instantly removes all locally stored rules and configurations.

---

### 6. Changes to This Privacy Policy
We may update this Privacy Policy from time to time to reflect improvements or regulatory changes. Any updates will be posted to this page with an updated "Last Updated" date.

---

### 7. Contact Information
If you have any questions or feedback regarding this Privacy Policy, please reach out via:
- **GitHub Issues / Repository:** [BlurShield on GitHub](https://github.com/nfsnayem/blurShield)

# Keyboard Shortcuts & Help Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a keyboard shortcuts help modal (triggered by `?` or `/`) and new shortcuts (Alt+1–4 tab jump, Esc remove-last-file, Cmd/Ctrl+Esc lock) to TeleDrop, replacing the two existing keydown listeners with a single unified priority-chain handler.

**Architecture:** Everything lives in `index.html` — no new files. CSS is added to the existing `<style>` block, the modal element is added to the page body, and the two existing keydown listeners are consolidated into one document-level handler that evaluates in a strict priority order (PIN overlay → modal open → focused-in-input → idle).

**Tech Stack:** Vanilla HTML/CSS/JS, no build system, deployed on Cloudflare Pages.

---

## File Map

- **Modify:** `index.html`
  - `<style>` block — add ~45 lines of modal CSS + platform symbol rules
  - `<body>` — add `#shortcuts-modal` element before `<script>`
  - JS elements block (~line 705) — add `shortcutsModal` reference
  - JS (~line 737, after elements block) — add `isMac` constant + `document.body` class
  - JS (after `resetTurnstile`, ~line 795) — add `openShortcuts()` / `closeShortcuts()` helpers + backdrop click listener
  - JS (~line 1202–1227) — remove two existing keydown listeners, replace with unified handler

---

## Task 1: Add CSS for the shortcuts modal

**Files:**
- Modify: `index.html` — `<style>` block (insert before the closing `</style>` tag around line 569)

- [ ] **Step 1: Insert modal CSS**

  Find the line `</style>` that closes the main style block (around line 569, just before the Turnstile script tag) and insert the following block immediately before it:

  ```css
    /* ── Shortcuts Modal ─────────────────────────────────────────────── */
    #shortcuts-modal {
      position: fixed;
      inset: 0;
      background: rgba(13,13,13,0.75);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 50;
    }

    #shortcuts-modal[hidden] { display: none; }

    #shortcuts-card {
      background: #161616;
      border: 1px solid #2a2a2a;
      border-radius: 14px;
      padding: 20px 22px;
      width: 280px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    }

    .sc-title {
      font-size: 0.72rem;
      font-weight: 700;
      color: #555;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .sc-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #1e1e1e;
    }

    .sc-row:last-child { border-bottom: none; }

    .sc-desc { font-size: 0.8rem; color: #888; }

    .sc-keys { display: flex; gap: 3px; align-items: center; }

    .kbd {
      background: #0f0f0f;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      font-size: 0.68rem;
      color: #aaa;
      padding: 2px 6px;
      font-family: monospace;
      line-height: 1.5;
    }

    .kbd-sep { font-size: 0.62rem; color: #444; }

    .mac-only { display: none; }
    body.is-mac .mac-only { display: inline; }
    body.is-mac .win-only { display: none; }
  ```

- [ ] **Step 2: Verify no visual regressions**

  Open `index.html` in a browser (or via the dev server). The page should look identical to before — the modal CSS adds no visible elements yet. Unlock the app and confirm all existing UI renders correctly.

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "Add CSS for keyboard shortcuts modal"
  ```

---

## Task 2: Add shortcuts modal HTML + JS element reference

**Files:**
- Modify: `index.html` — add modal element before `<script>` tag; add element reference in JS

- [ ] **Step 1: Add modal HTML**

  Find the closing comment/div of `#send-ctx-menu` (around line 699, just before `<script>`):

  ```html
  </div>

  <script>
  ```

  Insert the following between that closing `</div>` and `<script>`:

  ```html
  <!-- Shortcuts modal -->
  <div id="shortcuts-modal" hidden>
    <div id="shortcuts-card">
      <div class="sc-title">Keyboard Shortcuts</div>
      <div class="sc-row">
        <span class="sc-desc">Send</span>
        <div class="sc-keys">
          <span class="kbd mac-only">⌘</span><span class="kbd win-only">Ctrl</span>
          <span class="kbd-sep">+</span>
          <span class="kbd">↵</span>
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-desc">Open files</span>
        <div class="sc-keys">
          <span class="kbd mac-only">⌘</span><span class="kbd win-only">Ctrl</span>
          <span class="kbd-sep">+</span>
          <span class="kbd">O</span>
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-desc">Switch tab</span>
        <div class="sc-keys">
          <span class="kbd mac-only">⌥</span><span class="kbd win-only">Alt</span>
          <span class="kbd-sep">+</span>
          <span class="kbd">1–4</span>
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-desc">Cycle tabs</span>
        <div class="sc-keys">
          <span class="kbd">←</span>
          <span class="kbd-sep">/</span>
          <span class="kbd">→</span>
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-desc">Remove last file</span>
        <div class="sc-keys">
          <span class="kbd">Esc</span>
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-desc">Lock app</span>
        <div class="sc-keys">
          <span class="kbd mac-only">⌘</span><span class="kbd win-only">Ctrl</span>
          <span class="kbd-sep">+</span>
          <span class="kbd">Esc</span>
        </div>
      </div>
      <div class="sc-row">
        <span class="sc-desc">This help</span>
        <div class="sc-keys">
          <span class="kbd">?</span>
        </div>
      </div>
    </div>
  </div>
  ```

- [ ] **Step 2: Add element reference in JS**

  Find the elements block in the script (the big `const` block starting around line 705). After the last line of that block:

  ```javascript
        const silentToggle    = document.getElementById('silent-toggle');
  ```

  Add:

  ```javascript
        const shortcutsModal  = document.getElementById('shortcuts-modal');
  ```

- [ ] **Step 3: Verify in browser console**

  Open the page, unlock, then in the browser console run:
  ```javascript
  document.getElementById('shortcuts-modal').hidden  // → true
  document.getElementById('shortcuts-modal').hidden = false  // modal should appear
  document.getElementById('shortcuts-modal').hidden = true   // modal should hide
  ```
  Confirm the modal card renders with all 7 rows and correct styling.

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "Add shortcuts modal HTML and element reference"
  ```

---

## Task 3: Platform detection, open/close helpers, backdrop click

**Files:**
- Modify: `index.html` — JS section

- [ ] **Step 1: Add platform detection constant**

  Find the `// ── App state ──` comment (around line 737, after the elements block). Insert the following immediately before it:

  ```javascript
        // ── Platform detection ───────────────────────────────────────────────
        if (/Mac/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent)) {
          document.body.classList.add('is-mac');
        }

  ```

- [ ] **Step 2: Add openShortcuts / closeShortcuts helpers + backdrop click**

  Find the `function showPinOverlay()` function (around line 797). Insert the following block immediately before it:

  ```javascript
        // ── Shortcuts modal ───────────────────────────────────────────────────
        function openShortcuts()  { shortcutsModal.hidden = false; }
        function closeShortcuts() { shortcutsModal.hidden = true; }

        shortcutsModal.addEventListener('click', (e) => {
          if (e.target === shortcutsModal) closeShortcuts();
        });

  ```

- [ ] **Step 3: Verify in browser**

  Reload the page and unlock. In the console:
  ```javascript
  openShortcuts()   // modal appears with blur backdrop
  closeShortcuts()  // modal disappears
  ```
  On a Mac, the modal should show ⌘/⌥. On Windows/Linux it should show Ctrl/Alt. Clicking outside the card (on the dark backdrop) should close it.

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "Add shortcuts modal open/close helpers and platform detection"
  ```

---

## Task 4: Replace keydown listeners with unified priority-chain handler

This task removes the two existing keydown listeners and replaces them with one.

**Files:**
- Modify: `index.html` — JS section (~lines 1202–1227)

- [ ] **Step 1: Remove the textInput keydown listener**

  Find and delete this entire block (around line 1202):

  ```javascript
        // Cmd/Ctrl+Enter to send from the textarea
        textInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!sendBtn.disabled) doSend();
          }
        });
  ```

- [ ] **Step 2: Remove the document keydown listener**

  Find and delete this entire block (around line 1210, immediately after the block you just removed):

  ```javascript
        // Cmd/Ctrl+O to open file picker
        document.addEventListener('keydown', (e) => {
          if (e.key === 'o' && (e.metaKey || e.ctrlKey) && !app.hidden) {
            e.preventDefault();
            if (!dropZone.classList.contains('dimmed')) fileInput.click();
          }

          if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !app.hidden) {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            e.preventDefault();
            const tabs = Array.from(modeTabs.querySelectorAll('.mode-tab'));
            const cur = tabs.findIndex(t => t.classList.contains('active'));
            const next = e.key === 'ArrowRight'
              ? (cur + 1) % tabs.length
              : (cur - 1 + tabs.length) % tabs.length;
            tabs[next].click();
          }
        });
  ```

- [ ] **Step 3: Insert the unified keydown handler in place of the deleted blocks**

  In the gap where those two blocks were, insert:

  ```javascript
        // ── Unified keyboard handler ──────────────────────────────────────────
        document.addEventListener('keydown', (e) => {
          // 1. PIN overlay visible → ignore everything
          if (!pinOverlay.classList.contains('hidden')) return;

          // 2. Modal open → close on dismiss keys, swallow all others
          if (!shortcutsModal.hidden) {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === '?' || e.key === '/') {
              e.preventDefault();
              closeShortcuts();
            }
            return;
          }

          // 3. Focused in pin-input → ignore
          if (document.activeElement === pinInput) return;

          // 4. Focused in text-input → only Cmd/Ctrl+Enter fires
          if (document.activeElement === textInput) {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (!sendBtn.disabled) doSend();
            }
            return;
          }

          // 5. Idle focus → all shortcuts
          const mod = e.metaKey || e.ctrlKey;

          // Cmd/Ctrl+Esc → lock app
          if (e.key === 'Escape' && mod) {
            e.preventDefault();
            clearToken();
            showPinOverlay();
            return;
          }

          // Esc → remove last staged file (no-op if none)
          if (e.key === 'Escape') {
            if (stagedFiles.length) {
              e.preventDefault();
              removeFileAt(stagedFiles.length - 1);
            }
            return;
          }

          // ? or / → open shortcuts modal
          if (e.key === '?' || e.key === '/') {
            e.preventDefault();
            openShortcuts();
            return;
          }

          // Cmd/Ctrl+O → open file picker
          if (e.key === 'o' && mod) {
            e.preventDefault();
            if (!dropZone.classList.contains('dimmed')) fileInput.click();
            return;
          }

          // Alt+1–4 → jump to specific tab
          if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
            e.preventDefault();
            const tabs = Array.from(modeTabs.querySelectorAll('.mode-tab'));
            const idx = parseInt(e.key, 10) - 1;
            if (tabs[idx]) tabs[idx].click();
            return;
          }

          // ←/→ → cycle mode tabs
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const tabs = Array.from(modeTabs.querySelectorAll('.mode-tab'));
            const cur = tabs.findIndex(t => t.classList.contains('active'));
            const next = e.key === 'ArrowRight'
              ? (cur + 1) % tabs.length
              : (cur - 1 + tabs.length) % tabs.length;
            tabs[next].click();
          }
        });
  ```

- [ ] **Step 4: Manual verification checklist**

  Reload and unlock the app. Test each shortcut:

  | Test | Expected |
  |------|----------|
  | Press `?` with no input focused | Shortcuts modal opens |
  | Press `/` with no input focused | Shortcuts modal opens |
  | Press `Esc` while modal is open | Modal closes |
  | Press `Enter` while modal is open | Modal closes |
  | Press `?` while modal is open | Modal closes |
  | Click outside card while modal is open | Modal closes |
  | Click inside textarea, press `?` | `?` is typed in textarea, modal does NOT open |
  | Click inside textarea, press `Cmd/Ctrl+Enter` | Sends (if content present) |
  | Press `Cmd/Ctrl+O` | File picker opens |
  | Press `Alt+1` | Switches to Auto tab |
  | Press `Alt+2` | Switches to File tab |
  | Press `Alt+3` | Switches to Text tab |
  | Press `Alt+4` | Switches to Link tab |
  | Press `←` / `→` | Cycles tabs |
  | Add a file, press `Esc` | Last file removed |
  | Add two files, press `Esc` twice | Both removed one at a time |
  | Press `Esc` with no files | Nothing happens |
  | Press `Cmd/Ctrl+Esc` | App locks, PIN screen appears |
  | On PIN screen, press any shortcut | Nothing fires |

- [ ] **Step 5: Commit**

  ```bash
  git add index.html
  git commit -m "Add keyboard shortcuts modal and unified keydown handler"
  ```

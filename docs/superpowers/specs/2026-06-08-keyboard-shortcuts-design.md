# Keyboard Shortcuts & Help Modal

**Date:** 2026-06-08  
**Status:** Approved

## Overview

Add a keyboard shortcuts help modal and a set of new keyboard shortcuts to TeleDrop. Everything lives in `index.html` — no new files, no build system changes.

## Shortcuts

### New shortcuts

| Key | Condition | Action |
|-----|-----------|--------|
| `?` or `/` | Idle focus (not in any input) | Toggle shortcuts modal |
| `Alt+1` | Idle focus | Jump to Auto tab |
| `Alt+2` | Idle focus | Jump to File tab |
| `Alt+3` | Idle focus | Jump to Text tab |
| `Alt+4` | Idle focus | Jump to Link tab |
| `Esc` | Idle focus, modal closed, files staged | Remove most-recently-added file (LIFO) |
| `Cmd/Ctrl+Esc` | App visible | Lock app (equivalent to clicking Lock button) |

### Existing shortcuts (preserved, documented in modal)

| Key | Condition | Action |
|-----|-----------|--------|
| `Cmd/Ctrl+Enter` | Focused in textarea | Send |
| `Cmd/Ctrl+O` | App visible | Open file picker |
| `←` / `→` | Idle focus | Cycle mode tabs |

## Keyboard Handler

Replace the two existing keydown listeners (`textInput` at line ~1202 and `document` at line ~1210) with a single `document`-level listener that evaluates in this exact priority order:

1. **PIN overlay visible** → ignore all keys, return immediately
2. **Modal open** → `Esc`, `Enter`, `?`, `/` close the modal and stop; all other keys are ignored
3. **Focused in `#pin-input`** → ignore all keys, return immediately
4. **Focused in `#text-input`** → only `Cmd/Ctrl+Enter` fires (send); all other special keys pass through normally so typing works
5. **Idle focus** → run all shortcuts (new + existing)

## Shortcuts Modal

### Appearance
- **Style:** Centered blur overlay (same pattern as the PIN overlay)
- **Backdrop:** `rgba(13,13,13,0.75)` with `backdrop-filter: blur(6px)`
- **Card:** `#161616` background, `1px solid #2a2a2a` border, `border-radius: 14px`, `box-shadow: 0 8px 32px rgba(0,0,0,0.6)`
- **Size:** Fixed width `280px`, auto height
- **Position:** `position: fixed; inset: 0` flex-centered, `z-index: 50` (below PIN overlay at z-index 100)

### Content
Title row: "Keyboard Shortcuts" in small uppercase label style.

Six shortcut rows, each with a description on the left and `<kbd>`-badged keys on the right:

| Description | Mac | Windows/Linux |
|-------------|-----|---------------|
| Send | `⌘` + `↵` | `Ctrl` + `↵` |
| Open files | `⌘` + `O` | `Ctrl` + `O` |
| Switch tab | `⌥` + `1–4` | `Alt` + `1–4` |
| Cycle tabs | `←` / `→` | `←` / `→` |
| Remove last file | `Esc` | `Esc` |
| Lock app | `⌘` + `Esc` | `Ctrl` + `Esc` |
| This help | `?` | `?` |

### Platform detection
At page load, check `navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.toLowerCase().includes('mac')`. If true, add class `is-mac` to `<body>`. CSS uses `.is-mac` to show Mac symbols and hides Windows ones, and vice versa.

### Closing the modal
Any of these closes it: `Esc`, `Enter`, `?`, `/`, or a click outside the card (on the backdrop). No animation required — instant show/hide via a CSS class toggle.

## HTML Structure

Add one element inside `#app`, after the `#send-ctx-menu`:

```html
<div id="shortcuts-modal" hidden>
  <div id="shortcuts-card">
    <div class="sc-title">Keyboard Shortcuts</div>
    <!-- sc-row × 7 -->
  </div>
</div>
```

`hidden` attribute controls visibility. JavaScript toggles it.

## CSS

~40 new lines appended to the existing `<style>` block:
- `#shortcuts-modal` — fixed overlay, flex-centered, backdrop blur
- `#shortcuts-card` — card styles
- `.sc-title` — small uppercase label
- `.sc-row` — flex row, space-between, bottom border
- `.sc-desc` — left side text
- `.sc-keys` — right side key group
- `.kbd` — individual key badge (`#0f0f0f` bg, `#2e2e2e` border, monospace)
- `.is-mac .mac-only`, `.is-mac .win-only` — platform symbol visibility

## JavaScript Changes

1. Remove `textInput.addEventListener('keydown', ...)` (line ~1202) and `document.addEventListener('keydown', ...)` (line ~1210).
2. Add `const shortcutsModal = document.getElementById('shortcuts-modal')` to the elements block.
3. Add platform detection on load: `if (isMac()) document.body.classList.add('is-mac')`.
4. Add `function openShortcuts() / closeShortcuts()` helpers that toggle `hidden` on `#shortcuts-modal`.
5. Add a single `document.addEventListener('keydown', handleKey)` with the priority chain described above.
6. Add a click listener on `#shortcuts-modal` (the backdrop) that closes when `e.target === shortcutsModal`.

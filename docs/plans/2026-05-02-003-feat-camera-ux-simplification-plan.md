---
title: feat: Simplify camera UX — remove modes, replace roulette with pre-capture picker
type: feat
status: completed
date: 2026-05-02
origin: docs/brainstorms/camera-ux-simplification-and-polish.md
---

# feat: Simplify camera UX — remove modes, replace roulette with pre-capture picker

## Summary

Remove Timer, Motion Detection, and Burst modes entirely. Replace the post-capture casino-roulette modal with a pre-capture 3-option preset picker overlaid on the viewfinder. Fix install page defaults, enlarge QR code, strip rabbit references from presets, and audit dead code — 7 implementation units touching `src/main.js`, `src/style.css`, `index.html`, `install.html`, and `public/presets.json`.

---

## Problem Frame

The camera ships with unused capture modes (Timer, Motion Detection, Burst), a casino-themed roulette modal that interrupts capture, an ugly `#NOFILTER` default, a too-small QR code, and rabbit references in AI presets. These add UI clutter and code complexity without user value. Mode toggle DOM elements were already removed from `index.html` in a prior cleanup (confirming prior intent to deprecate) and the toggle functions (`toggleTimerMode`, `toggleMotionDetection`, `toggleBurstMode`) are unreachable dead code. No user has reported using these modes. Mode removal is low-risk deletion. The roulette was an internal-only prototype (never deployed to users); this plan replaces it with a pre-capture picker as a pre-release course correction rather than a shipped-feature reversal. (See origin: `docs/brainstorms/camera-ux-simplification-and-polish.md`)

---

## Requirements

### Install Page & QR Code
- R1. QR code on `install.html` (source file) must be ~40% larger (260→364px)

### Camera Defaults & Status Text
- R2. Camera default: primary slot pre-selected, no `#NOFILTER` hashtag text
- R3. Manually Select Options confirmation text reads cleanly

### Mode Removal
- R4. Remove Timer mode: UI toggle, state, countdown logic, DOM
- R5. Remove Motion Detection mode: UI toggle, state, sensor logic, DOM
- R6. Remove Burst mode: UI toggle, state, burst loop logic, DOM

### Pre-Capture Picker UI
- R7. Camera viewfinder shows 3 preset options: 1 primary (larger, centered) + 2 alternatives (smaller, in a horizontal row below the primary)
- R10. No casino/roulette/gambling theming — clean, playful photo picker

### Scroll Wheel Behavior
- R8. Scroll wheel shuffles all 3 options when camera active; default behavior elsewhere
- R9. Scroll wheel must NOT browse the full preset list

### Rabbit Mitigation
- R11. No rabbit imagery in AI output (best-effort via text surgery: strip rabbit terms from preset prompts, add negative constraints to affected presets). The AI model may independently generate rabbit imagery regardless of prompt text — this mitigation reduces probability but cannot guarantee elimination

### Dead Code Audit
- R12. Remove dead code from mode removal
- R13. Audit and remove unused CSS, HTML, event handlers

**Origin actors:** A1 (R1 user)
**Origin flows:** F1 (Pick preset, then capture), F2 (Scroll wheel shuffle)
**Origin acceptance examples:** AE1–AE7

---

## Scope Boundaries

- Not removing Manually Select Options
- Not changing the WebSocket/photo-sending pipeline
- Not removing Combine, Layer, or Multi-Preset modes
- Not removing the gallery or photo queue system
- Not switching QR libraries or the Vite build pipeline
- Not adding test infrastructure (none exists)

### Deferred to Follow-Up Work

- Touch-based shuffle alternative for broken scroll wheels: future iteration

---

## Context & Research

### Relevant Code and Patterns

- `src/main.js` (14,519 lines) — all camera logic, presets, scroll wheel handlers, capture flow. 49 references to `isTimerMode`/`isBurstMode`/`isMotionDetectionMode`
- `src/style.css` (4,958 lines) — `.roulette-*` (lines 137–168, 4761–4959), `.burst-*` (~70 lines, 1460–1530, 1885–1889), `.timer-*` (~60 lines, 1518–1576, 1891–1895), `.mode-button` active states. No `.motion-*` CSS rules exist
- `index.html` — splash screen, camera container, modals. Roulette modal markup (lines 77–97). Mode toggle buttons already removed
- `install.html` (91 lines) — QR code via `qr-code-styling@1.6.0` CDN, currently 260x260. Subtitle says "Roulette Camera"
- `public/presets.json` (1,069 presets, 2.4MB) — ~10 presets with rabbit references (lines 4727, 5069, 6313, 12144, 13025, 14241, 16384, 20534, 27205, 31191). Duplicate at `src/presets.json`
- `vite.config.js` — outputs to `docs/`, `emptyOutDir: false`, base `./`
- Mode toggle functions (`toggleRandomMode`, `toggleMotionDetection`, `toggleBurstMode`, `toggleTimerMode`) already dead — their target DOM elements were removed from `index.html`
- 16 scroll handler functions; `scrollUp`/`scrollDown` enumerate 14+ UI states with camera preset cycling as fallthrough default
- `capturePhoto()` is `async` with roulette branching on `isRandomMode && !isTimerMode && !isMotionDetectionMode && !isBurstMode`
- `showRouletteModal()` returns a Promise; `generateRouletteOptions()` does Fisher-Yates on 5 picks
- `updatePresetDisplay()` at line 9017 sets status bar text from `currentPreset.name`
- `loadLastUsedStyle()` reads `LAST_USED_PRESET_KEY` from localStorage

### Institutional Learnings

- `docs/solutions/conventions/ai-preset-content-policy-copyright-safety-2026-05-02.md` — established content moderation pattern: strip problematic terms from prompts, add negative constraints. 22 presets already deleted for copyright/safety. This convention is the institutional precedent for R11's rabbit-mitigation approach

---

## Key Technical Decisions

- **Pre-capture picker, not post-capture modal**: Picker overlay lives inside `.camera-container`, always visible. No Promise-based flow interruption. `capturePhoto()` reads the selected preset directly — no `async/await` roulette branching (see origin: Key Decisions "Pick before capture")
- **Scroll wheel insertion before camera fallthrough**: Insert the picker-visibility check between the queue manager handler (~line 8816) and the camera preset cycling fallthrough (~line 8819) in `scrollUp`/`scrollDown`. When the camera is active and the picker is visible, shuffle the 3 options and return. All other UI states (menus, gallery, settings, submenus) scroll normally — only the camera cycling fallthrough is intercepted
- **Reuse roulette layout concepts, strip casino styling**: The tile layout (large primary + smaller alts in a grid) is sound. New `.picker-*` CSS selectors repurpose sizing ratios but drop glow shadows, shuffle animations, 🎰 emoji, and orange-gradient buttons
- **`generatePickerOptions()` replaces `generateRouletteOptions()`**: Same Fisher-Yates logic, 3 picks instead of 5. Called on camera launch and on scroll wheel rotation
- **Default preset via last-used**: Read `LAST_USED_PRESET_KEY` on launch. Fallback to index 0 if missing. The primary picker slot shows the current preset
- **Rabbit mitigation via text surgery on presets.json**: Strip rabbit terms from ~10 presets, add negative prompt constraints. Edit both `public/presets.json` and `src/presets.json` identically
- **Mode removal is deletion-only**: No replacement functionality. Mode toggle buttons already absent from `index.html`. Remove state variables, toggle functions, scroll handlers, core logic functions, CSS, and event wiring

---

## Implementation Units

- U1. **Enlarge QR code and update install page text**

**Goal:** Bump QR code size ~40% and update casino-themed subtitle/description

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `install.html`

**Approach:**
- Change `width: 260, height: 260` to `width: 364, height: 364` in the `QRCodeStyling` constructor
- Update subtitle text from "Roulette Camera for Rabbit R1" to "AI Photo Camera for Rabbit R1"
- Update QR `description` field from "Roulette camera - each photo gets a random AI preset" to "AI photo camera - pick a preset, take a photo"

**Patterns to follow:**
- `install.html` lines 80–87 (QRCodeStyling config), line 48 (subtitle), line 75 (description)

**Test scenarios:**
- Happy path: QRCodeStyling is constructed with `width: 364, height: 364` — opens `install.html` and QR renders visibly larger
- Happy path: Page subtitle no longer contains "Roulette" — reads "AI Photo Camera for Rabbit R1"
- Happy path: QR JSON `description` field does not mention "roulette"

**Verification:**
- `install.html` has `width: 364, height: 364` in QRCodeStyling constructor. Subtitle and description no longer contain "Roulette" or "roulette"

---

- U2. **Fix camera default preset and status bar text**

**Goal:** No `#NOFILTER` on launch; status bar shows clean human-readable preset name; Manually Select confirmation reads cleanly

**Requirements:** R2, R3

**Dependencies:** U1 (independent, but small enough to sequence)

**Files:**
- Modify: `src/main.js`

**Approach:**
- In `updatePresetDisplay()`: change the Manually Select status text from `` `🎯 MANUALLY SELECT | Style: ${currentPreset.name}` `` to use a cleaned display name (strip leading `#`, normalize case)
- `currentPresetIndex` already defaults to 0 (IMPRESSIONISM, first factory preset) — confirm no code sets it to index 1
- Move the `loadLastUsedStyle()` call (currently at line 3515) to after `CAMERA_PRESETS` is populated (~line 3530), so the saved index can be validated against the actual preset list rather than the empty `[]` initial value
- Remove any mode-specific status text setters (Random/Burst/Timer/Motion "ON" text) that bypass `updatePresetDisplay()` — these are deleted with U3

**Patterns to follow:**
- `src/main.js` lines 9017–9040 (`updatePresetDisplay`), line 4018 (`loadLastUsedStyle`), lines 6783, 7305, 7339, 4093 (mode-specific status text)

**Test scenarios:**
- Happy path: First launch with no saved preset → status bar shows "Style: IMPRESSIONISM" (index 0)
- Happy path: Previous session used "VINTAGE POLAROID" → relaunch shows "Style: VINTAGE POLAROID"
- Happy path: Manually Select enabled, preset is "#NOFILTER" → status reads cleanly without raw hashtag identifier
- Edge case: localStorage has invalid `LAST_USED_PRESET_KEY` → falls back to index 0

**Verification:**
- Fresh launch shows a clean preset name (no leading `#`, no all-caps hashtag). Manually Select confirmation text is human-readable. Last-used preset persists across sessions

---

- U3. **Remove Timer, Motion Detection, and Burst modes**

**Goal:** Strip all three modes: state variables, toggle functions, scroll handlers, core logic, CSS, and event wiring

**Requirements:** R4, R5, R6, R12

**Dependencies:** U2 (touches same file, builds on status text changes)

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `index.html`

**Approach:**
- **State variables**: Remove `isTimerMode`, `timerCountdown`, `timerDelay`, `timerRepeatEnabled`, `timerDelayOptions`, `timerRepeatInterval`, `TIMER_REPEAT_INTERVALS`, `isMotionDetectionMode`, `motionDetectionInterval`, `lastFrameData`, `motionPixelThreshold`, `motionContinuousEnabled`, `motionCooldown`, `isMotionCooldownActive`, `motionStartDelay`, `motionStartInterval`, `MOTION_START_DELAYS`, `MOTION_SETTINGS_KEY`, `isBurstMode`, `burstCount`, `burstDelay`, `isBursting`, `BURST_SPEEDS`, `BURST_SETTINGS_KEY`
- **Toggle functions**: Remove `toggleTimerMode()`, `toggleMotionDetection()`, `toggleBurstMode()`, `toggleRandomMode()`
- **Scroll handlers**: Remove `scrollBurstUp/Down`, `scrollTimerUp/Down`, `scrollMotionUp/Down`
- **Core logic**: Remove `startTimerCountdown()`, `detectMotion()`, `startMotionDetection()`, `stopMotionDetection()`, `startBurstCapture()`, `captureBurstPhoto()`
- **Submenu state**: Remove `isTimerSubmenuOpen`, `isMotionSubmenuOpen`, `isBurstSubmenuOpen`
- **scrollUp/scrollDown**: Remove burst/timer/motion submenu branches from the state enumeration
- **capturePhoto()**: Remove the `isRandomMode && !isTimerMode && !isMotionDetectionMode && !isBurstMode` condition — `isRandomMode` alone now gates the picker path. Remove `async` keyword and `await showRouletteModal()`
- **Event wiring**: Remove mode-button event listener wiring (already dead — DOM elements absent)
- **CSS**: Remove `.burst-*` rules (~70 lines), `.timer-*` rules (~60 lines), `.mode-button` active state rules (`.burst-active`, `.timer-active`, `.motion-active`). Remove `.timer-countdown` overlay from `index.html` (lines 52–54)
- Remove mode conflict checks in Combine mode toggles that reference `isTimerMode`/`isBurstMode`/`isMotionDetectionMode`

**Patterns to follow:**
- Existing code structure — variable declarations at lines 170–240, toggle functions at lines 4082, 6777, 7295, 7329, scroll handlers at lines 1608–1678, motion detection at lines 6680–6740, burst at lines 7502–7560, timer at lines 7373–7400
- CSS sections at lines 1460–1576, 1885–1895
- Roulette removal handled separately in U4

**Test scenarios:**
- Happy path: Camera launches with no Timer/Motion/Burst toggles visible — `Covers AE5`
- Happy path: `isTimerMode`, `isBurstMode`, `isMotionDetectionMode` are not referenced anywhere in `src/main.js`
- Happy path: No `.burst-*`, `.timer-*`, `.mode-button[data-mode].*-active` selectors remain in `src/style.css`
- Happy path: No timer countdown overlay in `index.html`
- Edge case: Code paths gated by `!isTimerMode && !isMotionDetectionMode && !isBurstMode` still function correctly after condition removal
- Edge case: Combine/Layer/Multi-Preset toggles still work (they checked for timer/burst/motion conflicts)
- Integration: `capturePhoto()` is no longer `async` — capture flow proceeds synchronously through preset selection

**Verification:**
- 0 references to `isTimerMode`, `isBurstMode`, `isMotionDetectionMode` anywhere in `src/main.js`. CSS audit passes for removed selectors. `index.html` has no timer/mode markup. Camera captures photos successfully

---

- U4. **Build 3-option pre-capture picker UI**

**Goal:** Replace the roulette modal markup and CSS with a clean 3-option picker overlaid on the viewfinder

**Requirements:** R7, R10

**Dependencies:** U3 (removes old roulette modal markup + CSS, clearing space for new picker)

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`

**Approach:**
- **HTML**: Remove roulette modal markup (`#roulette-modal`, lines 77–97). Add new picker overlay inside `.camera-container`, positioned above `<video>`:
  - Container: `.picker-overlay` (absolutely positioned, bottom-aligned, semi-transparent backdrop, participates in the existing tap-to-hide/reveal system — hides and reveals along with carousel buttons)
  - Primary slot: `.picker-primary` (larger tile, centered, shows preset name)
  - Alternatives: `.picker-alts` (two smaller tiles side-by-side below the primary)
  - No timer, no "Spin Again" button, no 🎰 emoji
- **CSS**: Remove `.roulette-*` rules (~200 lines, lines 137–168 + 4761–4959). Add new `.picker-*` selectors:
  - `.picker-overlay` — positioned at bottom of camera container, flex column, subtle dark background with blur, no z-index modal stacking
  - `.picker-primary` — ~50vw wide, ~15vw tall, rounded corners, subtle border, white text, pre-selected state with accent border
  - `.picker-alt` — ~30vw wide, ~10vw tall, slightly muted text
  - `.picker-alt.selected`, `.picker-primary.selected` — solid `#FE5F00` accent border (2px) on `#1a1a1a` background, instant swap with no glow/animation/transition
- Repurpose tile sizing ratios from roulette CSS but strip all casino styling
- **Visual design tokens** (use existing app conventions): overlay background `rgba(0,0,0,0.6)` with `backdrop-filter: blur(8px)`, tile backgrounds `#1a1a1a`, `2vw` border-radius (matching existing app convention), borders `2px solid` (`#333` default, `#FE5F00` for primary/selected), text `#fff` (primary tile) / `#ccc` (alt tiles) in Power Grotesk at vw-based sizing. No gradients, no glow shadows, no emoji

**Patterns to follow:**
- Existing `.camera-container` layout in `style.css`
- Roulette tile sizing (`.roulette-tile.primary` at 60vw, `.roulette-tile.alt` at smaller sizes) — reuse proportions, drop casino theming

**Test scenarios:**
- Happy path: Camera shows 3 preset options overlaid on viewfinder — 1 large primary, 2 smaller alternatives — `Covers AE4`
- Happy path: No 🎰 emoji, no "Spin Again" button, no roulette modal backdrop blur
- Happy path: Tapping a preset tile selects it (visual highlight)
- Edge case: Picker overlay does not block `<video>` or capture button interaction

**Verification:**
- `index.html` has `.picker-overlay` with `.picker-primary` + 2× `.picker-alt` inside `.camera-container`. No `#roulette-modal` markup. `src/style.css` has `.picker-*` selectors and no `.roulette-*` selectors

---

- U5. **Wire picker logic: generation, selection, and scroll wheel**

**Goal:** Pick a preset from the 3 options, shuffle with scroll wheel, and capture with the selected preset

**Requirements:** R8, R9

**Dependencies:** U4 (picker markup and CSS must exist), U3 (old roulette JS removed)

**Files:**
- Modify: `src/main.js`

**Approach:**
- **Generate**: Rename `generateRouletteOptions()` → `generatePickerOptions()`. Pick 3 unique presets from visible sorted list instead of 5. Return `{ primary, alts: [alt1, alt2] }`
- **Render**: New `renderPicker()` function — writes preset names to `.picker-primary` and `.picker-alt` tiles, stores preset objects on elements via `._preset`
- **Select**: Click handlers on picker tiles — marks tile as selected, stores chosen preset in a module-level variable (e.g., `selectedPickerPreset`). No Promise, no timer. Selection is immediate and synchronous
- **Shuffle**: Insert the picker-visibility check between the queue manager handler (~line 8816 return) and the camera preset cycling fallthrough (~line 8819) in `scrollUp`/`scrollDown`. When camera is active and picker is visible: call `generatePickerOptions()`, call `renderPicker()`, return. All other UI states scroll normally — only the camera cycling fallthrough is intercepted
- **capturePhoto()**: Remove `async`. Remove roulette branching. Read `selectedPickerPreset` directly. If no manual selection, use the primary slot preset (pre-selected on launch per R2)
- **Initialize**: Call `generatePickerOptions()` + `renderPicker()` on camera start. Set `selectedPickerPreset` to the primary
- **Loading state**: Before `generatePickerOptions()` completes, tiles show `...` in grey text
- **Empty state**: If fewer than 3 presets are available, show only the available presets centered; unused tile slots remain empty with a muted border
- **Error state**: If preset generation fails entirely, show a single tile reading `No presets available` and disable capture until presets are made visible via the menu
- Remove `showRouletteModal()`, `setupRouletteHandlers()`, `showRouletteToast()`, roulette-related cleanup code
- Update `currentPresetIndex` to track the selected preset for status bar consistency
- **Capture preview**: During capture preview (captured image shown, New Photo button visible), picker tiles dim to 40% opacity and are non-interactive. Tapping New Photo or the side button restores full opacity and interactivity

**Patterns to follow:**
- `generateRouletteOptions()` at line 4059 (Fisher-Yates preset selection)
- `showRouletteModal()` at line 7962 (DOM population pattern, repurposed for `renderPicker`)
- `scrollUp` at line 8700, `scrollDown` at line 8858 (state enumeration with early-return pattern)
- `capturePhoto()` at line 8017 (simplify by removing `async`/`await`)

**Test scenarios:**
- Happy path: Camera launch → 3 options rendered → primary is pre-selected → capture → photo processed with primary preset — `Covers AE4`
- Happy path: User taps an alt preset → visual selection → capture → photo processed with chosen preset
- Happy path: User rotates scroll wheel → all 3 options replaced with new random presets — `Covers F2`
- Happy path: Preset list is NOT browsed/scrolled when camera is active — wheel only shuffles the 3 picker options — `Covers R9`
- Happy path: Switching to gallery → scroll wheel resumes default gallery scrolling behavior — `Covers R8`
- Edge case: Only 3 visible presets exist — picker shows them without error
- Edge case: User scrolls rapidly → debounce does not drop shuffle events

**Verification:**
- Scroll wheel shuffles 3 options when camera is active. Scroll wheel scrolls gallery when in gallery mode. Tapping a tile selects; capture uses the selected preset. No `async`/`await` in `capturePhoto()`. No references to `showRouletteModal` or `setupRouletteHandlers`

---

- U6. **Strip rabbit references from presets**

**Goal:** Remove rabbit terms from preset prompt text and add negative constraints to affected presets

**Requirements:** R11

**Dependencies:** None (pure data change, independent of UI work)

**Files:**
- Modify: `public/presets.json`
- Delete: `src/presets.json`

**Approach:**
- Identify presets with rabbit references (research found ~10 presets across lines 4727, 5069, 6313, 12144, 13025, 14241, 16384, 20534, 27205, 31191 of `public/presets.json`)
- For each affected preset:
  - Strip rabbit-specific terms from option text and message text (e.g., remove "Bugs Bunny", "Usagi Yojimbo", "Energizer Bunny", "rabbit", "bunny", "Easter bunny")
  - Replace removed characters/animals with non-rabbit alternatives (e.g., replace samurai rabbit with samurai fox, Energizer Bunny with generic mascot)
  - Add negative prompt constraint to affected messages: append "no rabbits, no bunny ears, no cartoon animals" to prompt text
- Make identical changes to `src/presets.json` (Vite copies `public/` → `docs/`; `src/presets.json` is a development duplicate)
- Presets with standalone "rabbit" as an option keyword: remove the rabbit option, replace with a non-animal alternative

**Patterns to follow:**
- `docs/solutions/conventions/ai-preset-content-policy-copyright-safety-2026-05-02.md` — established technique of stripping terms and adding negative constraints
- The 22-preset deletion in commit `89a0098` — same content-moderation class of work

**Test scenarios:**
- Happy path: No preset in `public/presets.json` contains the strings "rabbit", "bunny", "Bugs Bunny", "Usagi Yojimbo", "Energizer Bunny", "Easter bunny" — `Covers AE6`
- Happy path: Affected presets include negative constraints in their prompt messages
- Edge case: Chinese Zodiac preset still works for other zodiac animals; only rabbit option is modified
- Edge case: "rabbit ear antennas" (TV antenna reference, not animal imagery) — term is replaced with a non-animal alternative

**Verification:**
- `git diff public/presets.json` shows rabbit terms removed from ~10 presets. `grep -i rabbit public/presets.json` returns 0 matches. `grep -i bunny public/presets.json` returns 0 matches. `src/presets.json` matches `public/presets.json` on all rabbit-related changes

---

- U7. **Audit and remove remaining dead code**

**Goal:** Remove orphaned CSS, unreachable functions, stale conditionals, and dangling event handlers not caught by U3/U4

**Requirements:** R12, R13

**Dependencies:** U3, U4, U5 (prior units do the bulk removal; this is the audit pass)

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `index.html`

**Approach:**
- **CSS audit**: Search `src/style.css` for selectors referencing removed DOM elements. Check for orphaned `.mode-*`, `.settings-*`, any remaining `.timer-*`/`.burst-*` fragments
- **JS audit**: `grep` for references to removed variables and functions. Check for:
  - `SCROLL_DEBOUNCE_MS` — still used by camera preset cycling (which no longer happens when picker is visible); keep if preset cycling remains for non-camera states
  - Removed submenu state references in other functions
  - Event listeners on removed DOM elements
  - Unused imports or helper functions
- **HTML audit — DOM**: Scan `index.html` for orphaned containers, empty wrappers, or stale comments referencing removed features. Remove the roulette toast (`#roulette-toast`) if still present
- **HTML audit — Tutorial text**: Update ~25 stale references in the in-app tutorial/glossary:
  - Remove "Special Modes" section entries for Timer, Burst, and Motion Detection
  - Rewrite Random Mode description to describe the new 3-option pre-capture picker
  - Remove mode-conflict references in Combine/Layer/Multi-Preset sections (e.g., "Cannot be used with Burst, Motion Detection")
  - Update the Getting Started summary that lists "timer and burst" and "motion detection" as features

**Patterns to follow:**
- Search-driven: `grep` for each removed symbol name across the codebase

**Test scenarios:**
- Happy path: No `console.error` about null element references during camera launch, capture, gallery view — `Covers AE7`
- Happy path: `src/style.css` has no selectors targeting IDs or classes that don't exist in `index.html`
- Happy path: `src/main.js` has no functions that call removed functions or reference removed variables

**Verification:**
- `grep` for removed function/variable names returns 0 results. CSS file is ~300 lines smaller than before. App launches and operates without console errors

---

## System-Wide Impact

- **Interaction graph:** `capturePhoto()` no longer `async` — callers that `await` it need updating. Side button handler no longer branches on timer/burst/motion state
- **State lifecycle risks:** Mode state was never persisted (except burst/motion settings in localStorage) — removal is low-risk. Preset data changes are additive (negative constraints), not structural
- **Unchanged invariants:** WebSocket/photo-sending pipeline untouched. Gallery, queue, Combine/Layer/Multi-Preset, and Manually Select Options are untouched. Vite build pipeline untouched. `emptyOutDir: false` preserved

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Scroll wheel insertion order breaks another UI state | Picker-visibility check returns early; all other states are below it and unreachable while camera is active. Test by verifying gallery/menu scrolling still works |
| Preset text surgery breaks JSON parsing | Verify with `python -m json.tool public/presets.json` after edits. Only modify text fields, never JSON structure |
| `capturePhoto()` async→sync breaks callers | Read all call sites of `capturePhoto()` — side button handler (line 8681) already handles async flow; removing `await` is safe. Verify capture still produces photos |
| Removing mode conflict checks breaks Combine/Layer toggles | The conflict checks prevent enabling Combine while in burst/timer/motion. After removal, these checks become dead branches — remove cleanly without touching Combine enable logic |

---

## Sources & References

- **Origin document:** [docs/brainstorms/camera-ux-simplification-and-polish.md](docs/brainstorms/camera-ux-simplification-and-polish.md)
- Related plans: `docs/plans/2026-05-02-001-feat-roulette-camera-ui-plan.md` (the roulette being replaced), `docs/plans/2026-05-02-002-feat-github-pages-install-polish-plan.md` (install page baseline)
- Related conventions: `docs/solutions/conventions/ai-preset-content-policy-copyright-safety-2026-05-02.md`
- Related code: `src/main.js`, `src/style.css`, `index.html`, `install.html`, `public/presets.json`, `src/presets.json`, `vite.config.js`

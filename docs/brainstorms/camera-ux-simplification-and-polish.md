---
date: 2026-05-02
topic: camera-ux-simplification-and-polish
---

# Camera UX Simplification & Polish

## Summary

Strip unused capture modes, replace the casino-roulette modal with a clean pre-capture 3-option preset picker overlaid on the viewfinder, fix install page and default-preset issues, ban rabbit imagery, and audit dead code.

---

## Problem Frame

The app ships with Timer, Motion Detection, and Burst modes that add UI clutter and code complexity without user value. The roulette modal introduced a casino aesthetic that doesn't fit the playful, fun-photo intent. The default preset ("#NOFILTER") puts ugly hashtag text in the status bar on launch, and the manually-select-options confirmation reads poorly. The install page QR is too small to scan comfortably. Rabbit characters appearing in AI-generated output are unwanted.

---

## Actors

- A1. R1 user: Takes photos using the camera app, expects a fun random result with minimal friction.

---

## Key Flows

- F1. **Pick preset, then capture**
  - **Trigger:** User opens camera to take a photo.
  - **Actors:** A1
  - **Steps:**
    1. Camera viewfinder shows 3 preset options overlaid: 1 primary slot (larger, centered) and 2 alternative slots (smaller, adjacent)
    2. User taps an option to select it, or rotates the scroll wheel to shuffle all 3
    3. User presses capture button to take photo
    4. Selected preset is applied and photo is processed
  - **Outcome:** Photo is taken with the user-chosen preset already selected. No post-capture interruption or modal.

- F2. **Scroll wheel shuffle**
  - **Trigger:** User rotates the R1 scroll wheel while the 3-option picker is visible.
  - **Actors:** A1
  - **Steps:**
    1. 3 options are displayed
    2. User rotates scroll wheel
    3. All 3 options are replaced with new random presets
    4. User can repeat until satisfied, then tap to select
  - **Outcome:** Options are refreshed without tapping a button.
  - **Covered by:** R7, R8

---

## Requirements

**Install page**
- R1. QR code on `install.html` (source file, committed to repo) must be ~40% larger than the current 260x260 size (target: ~364x364).

**Camera defaults & display text**
- R2. Camera must not launch with "#nofilter" or any hashtag-prefixed text as the default preset name. The primary slot option is pre-selected by default on launch.
- R3. The manually-select-options confirmation text must read cleanly — no raw preset names like "Manually select: Style #NOFILTER".

**Mode removal**
- R4. Remove Timer mode: UI toggle, state, countdown logic, and related DOM.
- R5. Remove Motion Detection mode: UI toggle, state, sensor logic, and related DOM.
- R6. Remove Burst mode: UI toggle, state, burst loop logic, and related DOM.

**Random picker (replaces roulette modal)**
- R7. The camera viewfinder shows exactly 3 preset options overlaid: 1 primary slot (larger, centered, ~60% of picker area) and 2 alternative slots (smaller, positioned below or beside the primary). The primary slot is pre-selected by default on camera launch.
- R8. Rotating the scroll wheel replaces all 3 options with new random presets. When the camera is active, the wheel always shuffles options; outside the camera (gallery, menus), the wheel resumes default behavior.
- R9. The scroll wheel must NOT browse or scroll through the full preset list — its only job in the camera is to shuffle the 3 picker options.
- R10. No casino, roulette, or gambling theming — no spin animations, no "Spin Again" button, no 🎰 emoji. The UI should feel like a playful photo picker: a clean 3-option chooser overlaid on the viewfinder.

**Content policy (cross-cutting constraint)**
- R11. No rabbit characters, rabbit imagery, or rabbit references may appear in AI-generated photo output. This is a best-effort mitigation enforced through: (a) stripping rabbit-related terms from preset prompt text, (b) adding negative prompt constraints ("no rabbits, no bunny ears, no cartoon animals"), and (c) flagging any preset that produces rabbit output for manual review.

**Codebase cleanup**
- R12. Remove all dead code resulting from mode removal: unreachable functions, orphaned state variables, stale conditionals.
- R13. Audit and remove unused CSS rules, HTML elements, and event handlers across the codebase.

---

## Acceptance Examples

- AE1. **Covers R1.** Opening install.html on any device shows a QR code visibly larger than before, centered and scannable at arm's length.
- AE2. **Covers R2.** Launching the camera shows a clean, human-readable preset name in the status bar — no leading `#`, no all-caps hashtag-style text.
- AE3. **Covers R3.** With Manually Select Options enabled, choosing a preset with options shows a confirmation prompt with clean, readable text rather than a raw internal identifier.
- AE4. **Covers R7, R8, R9, R10.** Opening the camera shows a live viewfinder with 3 preset options overlaid: one larger primary slot and two smaller alternative slots. Rotating the scroll wheel replaces all three with new random presets. Tapping an option selects it. Pressing capture takes the photo with the selected preset. No post-capture modal, no spin animation, no 🎰, no "Spin Again" button.
- AE5. **Covers R4, R5, R6.** The camera UI no longer shows Timer, Motion Detection, or Burst toggles. Attempting to enable them via any path is impossible.
- AE6. **Covers R11.** Taking a photo with any preset never produces output containing rabbit ears, rabbit characters, bunny imagery, or rabbit references.
- AE7. **Covers R12, R13.** The codebase has no unreachable functions, no orphaned CSS, no dangling event listeners referencing removed DOM elements.

---

## Success Criteria

- The camera app does one thing well: take a photo and offer fun random presets with minimal UI.
- A new user can pick up the R1, launch Moire, take a photo, and choose a preset within 10 seconds.
- The codebase is smaller and simpler than before — fewer files touched to make future changes.
- No rabbit appears in any photo, regardless of which preset is selected.

---

## Scope Boundaries

- Not removing the Manually Select Options feature.
- Not changing the WebSocket/photo-sending pipeline.
- Not removing Combine, Layer, or Multi-Preset modes.
- Not removing the gallery or photo queue system.
- Not switching QR libraries or the Vite build pipeline.

---

## Key Decisions

- **Pick before capture**: 3 options are overlaid on the live viewfinder. The user picks a preset, then takes a photo. No post-capture modal or interruption.
- **Scroll wheel dedicated to shuffling**: The wheel's only job in the camera is to randomize options. Preset browsing moves to the existing menu/preset-selector UI.
- **3 options, no timer**: 3 options visible in the camera UI. No auto-select — the user chooses at their own pace.
- **Clean theming**: No gambling/casino language or visuals. The picker is a straightforward photo-style chooser overlaid on the viewfinder.

---

## Deferred / Open Questions

### From 2026-05-02 review

- **Scroll wheel handler insertion point not specified** — Dependencies / Assumptions (P2, feasibility, confidence 75)

  The R1 scroll wheel events are already captured but the document does not specify where in the 14+ state enumeration the picker check should be inserted. This is an implementation detail deferred to planning.

  <!-- dedup-key: section="dependencies / assumptions" title="scroll wheel handler insertion point not specified" evidence="the r1 scroll wheel events are already captured by the app and can be repurposed" -->

---

## Dependencies / Assumptions

- Mode removal (Timer, Motion Detection, Burst) is an assumption: these modes are assumed unused and undesirable. The simplification removes them without waiting for usage data.
- The Rabbit R1 scroll wheel events are already captured by the app and can be repurposed.
- `qr-code-styling` CDN remains available for the install page.
- The existing preset data contains enough non-rabbit-producing presets to fill 3 random slots.

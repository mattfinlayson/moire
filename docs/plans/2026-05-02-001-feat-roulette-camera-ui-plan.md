---
title: feat: Implement Roulette Camera Selection UI
type: feat
status: completed
date: 2026-05-02
origin: docs/brainstorms/roulette-ui-requirements.md
---

# feat: Implement Roulette Camera Selection UI

## Summary

This plan transforms the existing "Random Mode" from a silent auto-selection into an interactive "Roulette" experience. Instead of immediately applying a single random preset upon capture, the system will now pause the flow to present a "Roulette Modal" containing one primary result and four alternatives. The user can then select their preferred filter or "re-roll" the options, adding a layer of agency and gamification to the capture process while respecting the Rabbit R1's constrained screen size.

---

## Problem Frame

Currently, Random Mode is a "black box" surprise. While the surprise is the point, the lack of agency means users often have to take multiple photos or manually switch filters if the random result isn't what they wanted. On the small R1 screen, this friction is amplified. The goal is to maintain the "magic" of randomness but introduce a high-impact, low-friction selection phase.

---

## Requirements

- R1. Present a "Roulette Modal" with 1 primary and 4 alternative random presets upon capture in Random Mode.
- R2. Allow the user to select any of the 5 presented options to lock in the filter.
- R3. Provide a "🎰 Spin Again" button to re-roll the set of 5 options.
- R4. Auto-select the primary option if the user does not interact within 5 seconds.
- R5. Integrate the selection results into the existing capture-to-queue flow.
- R6. Implement a "spin" animation (blur/shuffle) and a selection glow for visual feedback.
- R7. Ensure the modal UI is compact and optimized for the Rabbit R1 screen (240x320).

---

## Scope Boundaries

- **In Scope:**
    - New Roulette Modal HTML/CSS.
    - Logic to generate unique random preset sets.
    - Interruption and resumption logic for the capture flow.
    - Selection and re-roll event handling.
- **Out of Scope:**
    - Changing the underlying preset storage system.
    - Weighted probabilities for "rare" filters.
    - Modifying "No Magic Mode" (it should bypass roulette as usual).

---

## Context & Research

### Relevant Code and Patterns

- `src/main.js`: Contains the core camera logic, random preset selection (`getRandomPresetIndex`), and capture flow.
- `src/style.css`: Central styling file; will be used to implement the high-impact modal.
- Existing Modal Patterns: The `preset-selector` and `gallery-modal` provide patterns for full-screen overlays and centering content.
- `showStyleReveal()`: The final confirmation animation that should trigger after a roulette selection is locked.

---

## Key Technical Decisions

- **Flow Interruption:** Use a Promise-based approach or a state variable to pause the `finalize` logic of the capture process until the Roulette Modal resolves a selection.
- **Option Generation:** Use a `Set` or a shuffle algorithm on `getSortedPresets()` to ensure the 5 options are unique and derived only from visible presets.
- **UI Layout:** Use a 1+4 layout (1 large center piece, 4 small orbiting/grid tiles) to maximize visual impact while keeping text legible on a 240px wide screen.

---

## Open Questions

### Resolved During Planning
- **How to handle the auto-select timer?** A standard `setTimeout` that is cleared if the user taps any option or the re-roll button.

### Deferred to Implementation
- **Exact animation frames for the "shuffle" effect:** Will be tuned during implementation to ensure it doesn't feel sluggish on the device.

---

## Implementation Units

- U1. **Roulette Modal UI & Styling**

**Goal:** Create the visual container and layout for the roulette experience.

**Requirements:** R1, R7

**Dependencies:** None

**Files:**
- Create: `src/css/roulette.css` (or add to `src/style.css`)
- Modify: `index.html` (add modal markup)

**Approach:**
- Implement a centered modal with `backdrop-filter: blur(15px)`.
- Create a "Main" slot and a 2x2 grid for "Alternatives".
- Style the "Spin Again" button with a gold/orange gradient and a distinct highlight.

**Test scenarios:**
- Happy path: Modal renders centered and fills the screen appropriately.
- Edge case: Long preset names are truncated with ellipses (`text-overflow: ellipsis`).

**Verification:**
- Modal appears as a high-impact overlay with clear distinctions between the primary and alternative options.

---

- U2. **Random Option Generation Logic**

**Goal:** Implement the logic to pick 5 unique, visible presets.

**Requirements:** R1

**Dependencies:** U1

**Files:**
- Modify: `src/main.js`

**Approach:**
- Create a helper function `generateRouletteOptions()` that:
    1. Gets all currently visible presets.
    2. Randomly selects 5 unique presets.
    3. Returns them as an object `{ primary: preset, alts: [p1, p2, p3, p4] }`.

**Test scenarios:**
- Happy path: Returns exactly 5 unique presets.
- Edge case: If fewer than 5 visible presets exist, allow duplicates or fill with a default.

**Verification:**
- The function consistently returns a set of 5 presets without duplicates (given sufficient visible presets).

---

- U3. **Roulette Flow Integration**

**Goal:** Hook the roulette process into the capture loop of Random Mode.

**Requirements:** R1, R4, R5

**Dependencies:** U1, U2

**Files:**
- Modify: `src/main.js`

**Approach:**
- Modify the capture sequence in Random Mode to:
    1. Trigger `generateRouletteOptions()`.
    2. Display the Roulette Modal.
    3. Start a 5-second `setTimeout` for auto-selection of the primary preset.
    4. Pause the submission to the queue until a preset is selected.

**Test scenarios:**
- Happy path: Capture in Random Mode triggers the modal instead of an immediate toast.
- Edge case: Modal auto-closes and selects the primary preset after 5 seconds of inactivity.

**Verification:**
- Capture in Random Mode successfully halts at the modal and resumes only after a choice is made.

---

- U4. **Selection and Re-roll Handling**

**Goal:** Implement user interaction for picking filters and spinning again.

**Requirements:** R2, R3, R6

**Dependencies:** U3

**Files:**
- Modify: `src/main.js`

**Approach:**
- Add event listeners to the 5 preset tiles and the "Spin Again" button.
- **Selection:** Clear the auto-select timer, apply a brief "selection glow" CSS class to the tile, and close the modal.
- **Re-roll:** Call `generateRouletteOptions()` again, trigger the "shuffle" animation on the tiles, and reset the auto-select timer.

**Test scenarios:**
- Happy path: Tapping an alternative preset locks it in and closes the modal.
- Happy path: Tapping "Spin Again" updates all 5 slots with new random presets and restarts the timer.
- Integration: The selected preset is passed to the existing `photoQueue` and `syncQueuedPhotos()` logic.

**Verification:**
- User can successfully change their mind via re-roll and eventually lock in a specific filter.

---

- U5. **Visual Polish & Final Reveal**

**Goal:** Add animations and link the selection to the final style reveal.

**Requirements:** R6

**Dependencies:** U4

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css`

**Approach:**
- Implement the CSS `@keyframes` for the "shuffle" effect (rapidly changing opacity/scale of tiles).
- Ensure that upon modal close, `showStyleReveal(selectedPresetName)` is called to provide the final satisfying confirmation.

**Test scenarios:**
- Happy path: "Spin Again" triggers a visible shuffle of the tiles.
- Happy path: Selection leads directly into the standard Style Reveal animation.

**Verification:**
- The transition from selection to reveal is seamless and feels "magical".

---

## System-Wide Impact

- **Interaction graph:** The capture flow now has a synchronous-feeling diversion (the modal) before the asynchronous queue processing.
- **State lifecycle risks:** Must ensure that if the user closes the app or resets the camera while the modal is open, the pending capture state is cleaned up.
- **Unchanged invariants:** The logic for `No Magic Mode` remains untouched; captures in that mode bypass the roulette modal entirely.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Modal obscures the captured image too much | Use a semi-transparent blur for the background so the user can still see the photo they just took. |
| Re-rolling indefinitely prevents capture | The re-roll button is a manual action; the 5s timer only applies to the *current* set of results. |
| Performance lag during "shuffle" animation | Use CSS transforms and opacity instead of JS-driven DOM manipulation for the animation. |

---

## Sources & References

- **Origin document:** [docs/brainstorms/roulette-ui-requirements.md](docs/brainstorms/roulette-ui-requirements.md)
- Related code: `src/main.js` (capture and random logic)
- Related code: `src/style.css` (UI components)

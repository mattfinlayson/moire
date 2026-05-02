# Roulette Camera UI Improvement

**Current Date:** 2026-05-02

## Problem Statement
The current "Random Mode" (roulette) provides a surprise filter, but the user has no agency to influence the outcome without switching modes or manually browsing presets. The "surprise" is high, but the "gameplay" is low. On a small screen (Rabbit R1), we need a way to maintain the excitement of randomness while allowing a quick "re-roll" or selection from a small set of immediate alternatives.

## Goals
- Transform "Random Mode" from a simple random selector into a "roulette" experience.
- Provide the user with a set of options (the "spin" results) before the final filter is locked in.
- Maintain high visual impact and low friction, respecting the constrained screen real estate.
- Align with the "Magic" aesthetic of the product.

## User Experience (The "Spin" Flow)
Instead of immediately applying one random preset, the system will:
1. **Trigger Spin:** When the user takes a photo in Random Mode.
2. **Present Options:** Instead of a simple toast, a "Roulette Modal" appears.
3. **The Stakes:** The modal shows one "Main" selection (the default random result) and 4 "Alternative" options.
4. **The Choice:** The user can tap any of the 5 options to lock it in, or tap a "Re-roll" button to spin again.
5. **Confirmation:** Once selected, the chosen preset is applied, and the "Style Reveal" animation triggers as usual.

## Functional Requirements

### 1. The Roulette Modal
- **Visuals:** A centered, high-impact modal (blur background, gold/orange accents).
- **Main Option:** A large, prominent display of the "primary" random result.
- **Alt Options:** A grid of 4 smaller tiles representing the other possibilities.
- **Re-roll Button:** A prominent "🎰 Spin Again" button.
- **Screen Constraints:** Since the screen is very small, we use a compact grid layout. Text should be truncated with ellipses if too long.

### 2. Logic & Selection
- **Generation:** When the spin is triggered, generate 5 unique random presets from the visible presets list.
- **Selection:** If the user doesn't interact within a short window (e.g., 5 seconds), the "Main" option is auto-selected.
- **State Management:** The modal must pause the usual capture-to-queue flow until a choice is made.

### 3. Visual Transitions
- **Spin Animation:** A brief "blur/shuffle" effect on the tiles to simulate a roulette wheel spinning.
- **Selection Glow:** When an option is tapped, it should flash or glow before the modal closes.

## Scope Boundaries
- **In Scope:**
    - New Roulette Modal UI and CSS.
    - Logic for generating 5 random options.
    - Integration into the `Random Mode` capture flow.
- **Out of Scope:**
    - Changing how presets are stored or imported.
    - Adding complex "weighted" odds to the roulette.
    - Modifying the `No Magic Mode` behavior.

## Success Criteria
- User can successfully re-roll and pick a filter they prefer without leaving the camera flow.
- The UI feels "game-like" and satisfying on the R1 screen.
- No significant regression in the timing of the capture-to-submit loop.

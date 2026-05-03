---
title: feat: Polish GitHub Pages install page and project documentation
type: feat
status: completed
date: 2026-05-02
origin: docs/brainstorms/github-pages-install-qr-requirements.md
---

# feat: Polish GitHub Pages install page and project documentation

## Summary

Enhance Moire's GitHub Pages presence to match the shakedown standard: add install instructions and dynamic URL handling to `install.html`, create an app icon (`icon.svg`), and write a `README.md` with links to the live app and install page.

---

## Problem Frame

Moire is deployed to GitHub Pages with a working `install.html` that renders a styled QR code, but the page lacks install instructions, uses a hardcoded URL, and has an empty `iconUrl`. The repo has no README and no app icon. The shakedown project established a clean pattern for all of this that Moire should match.

---

## Requirements

- R1. Install page must include step-by-step install instructions matching shakedown's clarity.
- R2. Keep `qr-code-styling` library for QR generation with Moire orange (`#FE5000`).
- R3. QR JSON payload must include a valid `iconUrl` pointing to the deployed icon.
- R4. An `icon.svg` must exist and be deployed alongside the app.
- R5. A `README.md` must exist at the repo root with links to the live app and install page.
- R6. The deploy workflow must include the icon and install page in the deployed output.

**Origin acceptance examples:** AE1 (covers R1, R2), AE2 (covers R3, R4), AE3 (covers R5)

---

## Scope Boundaries

- Not switching QR libraries (`qr-code-styling` stays).
- Not removing the Vite build step.
- Not creating a separate interactive QR generator tool.

---

## Context & Research

### Relevant Code and Patterns

- `install.html` — existing QR install page using `qr-code-styling` from CDN. Hardcoded URL, no instructions, empty `iconUrl`.
- `vite.config.js` — two entry points (`index.html`, `install.html`), output to `docs/`. Vite's `public/` directory auto-copies static files to output root.
- `.github/workflows/deploy.yml` — builds with Vite, deploys `./docs` via `upload-pages-artifact@v3` + `deploy-pages@v4`.
- `/home/matt/src/shakedown/qr.html` — reference pattern: dynamic URL derivation, install instructions section, styled "How to install" box.
- `/home/matt/src/shakedown/icon.svg` — reference pattern: 100x100 SVG, dark rounded rect, single emoji character.

### Institutional Learnings

- `docs/solutions/conventions/ai-preset-content-policy-copyright-safety-2026-05-02.md` — only existing learning; not relevant to this task.

---

## Key Technical Decisions

- **Place icon in `public/icon.svg`**: Vite auto-copies `public/` contents to the output root (`docs/`), so no workflow changes are needed. The deploy workflow already deploys everything in `docs/`.
- **Dynamic URL derivation**: Derive the creation URL from `window.location.href` (like shakedown) instead of hardcoding. More portable, self-healing if the Pages URL changes.
- **Keep `qr-code-styling` via CDN**: User's explicit choice. Stays as-is in `install.html`, not bundled through Vite.
- **Camera emoji (📷) for icon**: Directly communicates the app's purpose on the R1 drawer.
- **`install.html` stays a Vite entry point**: No reason to remove it. Vite processes it identically (it has only inline styles and CDN scripts, so processing is a no-op) and places it in `docs/` reliably.

---

## Implementation Units

- U1. **Create app icon**

**Goal:** Create `public/icon.svg` so the R1 app drawer shows an icon instead of a blank placeholder.

**Requirements:** R3, R4

**Dependencies:** None

**Files:**
- Create: `public/icon.svg`

**Approach:**
- Follow the shakedown pattern: 100x100 SVG viewBox, dark rounded rectangle background, single centered emoji.
- Use `#1a1a1a` background, `rx="20"` rounded corners, camera emoji (📷) at center.
- Placed in `public/` so Vite auto-copies it to `docs/icon.svg` on build. No workflow changes needed.

**Patterns to follow:**
- `/home/matt/src/shakedown/icon.svg`

**Test scenarios:**
- Happy path: `public/icon.svg` exists and is valid SVG. After Vite build, `docs/icon.svg` exists with identical content.
- Happy path: SVG renders at 100x100 with a visible camera icon on a dark rounded background.

**Verification:**
- `public/icon.svg` exists. Running `npm run build` produces `docs/icon.svg`. The icon URL `https://mattfinlayson.github.io/moire/icon.svg` resolves after deploy.

---

- U2. **Enhance install.html**

**Goal:** Add install instructions, make the URL dynamic, and wire up the icon URL in the QR payload.

**Requirements:** R1, R2, R3

**Dependencies:** U1 (for iconUrl value)

**Files:**
- Modify: `install.html`

**Approach:**
- Add a styled "How to install" instructions section following shakedown's format (numbered steps: open Creations scanner, point at QR code, creation installs, find in app drawer).
- Replace hardcoded URL with dynamic derivation from `window.location.href` (strip `/install.html` to get base).
- Set `iconUrl` in the QR payload to `base + 'icon.svg'` instead of `""`.
- Keep all existing `qr-code-styling` configuration and styling.
- Update the page title to "Moire — R1 Creation QR Code" (matching shakedown's format).

**Patterns to follow:**
- `/home/matt/src/shakedown/qr.html` (instructions section layout and wording)

**Test scenarios:**
- Happy path: Visiting `install.html` shows a styled QR code, app title, subtitle, and a clearly separated "How to install" section with 4 numbered steps. **Covers AE1.**
- Happy path: The QR JSON payload contains `iconUrl` set to the resolved icon URL and `themeColor: "#FE5000"`. **Covers AE2.**
- Happy path: The creation URL is derived from the page's own location, not hardcoded.
- Edge case: When served from a path ending in `/`, the base URL is correctly resolved without double slashes.

**Verification:**
- Opening `install.html` locally or on Pages shows a polished page with instructions. The QR code encodes the correct JSON with a non-empty `iconUrl`.

---

- U3. **Create README.md**

**Goal:** Give the repo a clear README that tells visitors what Moire is and how to install it.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Create: `README.md`

**Approach:**
- Follow shakedown's README format exactly: project name + one-line description, "What It Does" section, "Installing on R1" linking to the install page, "Running Locally" with server commands, "Deployment" noting GitHub Pages auto-deploy, "Tech" stack list, "License" (MIT).
- Include badges: live app link and install link at top (matching shakedown's format).
- Reference the `docs/brainstorms/` and `docs/plans/` conventions for contributors.

**Patterns to follow:**
- `/home/matt/src/shakedown/README.md`

**Test scenarios:**
- Happy path: README contains clickable links to the live app and install page. **Covers AE3.**
- Happy path: A new visitor can understand what Moire does and how to install it within 15 seconds of reading.

**Verification:**
- `README.md` exists at repo root. Links are correct and will resolve after merge to main triggers deploy.

---

## System-Wide Impact

- **Unchanged invariants:** The app itself (`index.html`, `src/main.js`, `src/style.css`) is untouched. The Vite build pipeline is unchanged. The deploy workflow trigger and deployment target are unchanged. New files (`icon.svg`, updated `install.html` in the app; `README.md` at repo root) are additive only.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `icon.svg` not found at runtime if deploy misses it | Vite's `public/` dir behavior is well-established; verify with `npm run build` before merge |
| CDN for `qr-code-styling` deprecated | Already a pre-existing dependency; not introduced by this plan |

---

## Sources & References

- **Origin document:** [docs/brainstorms/github-pages-install-qr-requirements.md](docs/brainstorms/github-pages-install-qr-requirements.md)
- Reference project: `/home/matt/src/shakedown/` (`qr.html`, `icon.svg`, `README.md`)
- Related code: `install.html`, `vite.config.js`, `.github/workflows/deploy.yml`

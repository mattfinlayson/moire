---
date: 2026-05-02
topic: github-pages-install-qr
---

# GitHub Pages Install Page & Project Polish

## Summary

Bring Moire's GitHub Pages presence up to the shakedown standard: a polished QR install page with instructions, an app icon for the R1 drawer, and a README linking both the live app and install page.

---

## Problem Frame

Moire is deployed to GitHub Pages and has a working `install.html` with a styled QR code, but the surrounding presentation is bare: no install instructions, no app icon, no README. The shakedown project established a clean pattern for this — a self-contained install page that tells the user what to do, plus a README that links everything together. Moire should match that bar.

---

## Requirements

**Install page**
- R1. The install page must include step-by-step instructions for scanning the QR code with the R1, matching the clarity of shakedown's `qr.html`.
- R2. The install page must retain Moire's current `qr-code-styling` library for QR generation with rounded dots, themed corners, and the Moire orange (`#FE5000`).
- R3. The QR JSON payload must include a valid `iconUrl` pointing to the deployed icon.

**Icon**
- R4. An `icon.svg` must exist in the repo and be deployed alongside the app, so the R1 app drawer shows an icon.

**README**
- R5. A `README.md` must exist at the repo root with links to both the live app and the install/QR page, following shakedown's format (description, install instructions, running locally, deployment, tech stack, license).

**Deploy workflow**
- R6. The GitHub Pages deploy workflow must include the icon and install page in the deployed output.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Visiting the install page on GitHub Pages shows a styled QR code, a title, a subtitle, and numbered install instructions.
- AE2. **Covers R3, R4.** Scanning the QR code with an R1 installs a creation whose JSON payload includes a non-empty `iconUrl` and `themeColor: "#FE5000"`.
- AE3. **Covers R5.** The README contains a clickable link to the live app and a clickable link to the install page.

---

## Success Criteria

- A visitor to the repo can find and scan the install QR code without reading source files.
- The R1 app drawer shows an icon for Moire rather than a blank placeholder.
- The repo README tells a new visitor what Moire is and how to install it within 15 seconds of scanning.

---

## Scope Boundaries

- Not switching QR libraries (`qr-code-styling` stays; `api.qrserver.com` is not used).
- Not removing the Vite build step. Moire needs module bundling.
- Not creating a separate interactive QR generator tool (the official SDK's pattern).

---

## Key Decisions

- **Keep `qr-code-styling`**: Already in use, produces better-looking QR codes, and matches what the official Rabbit SDK uses.
- **Install page stays self-contained**: Loads `qr-code-styling` from CDN rather than bundling it through Vite. Simpler and matches the shakedown pattern.

---

## Dependencies / Assumptions

- GitHub Pages is already configured and deploying from the `docs/` directory via the existing workflow.
- The `qr-code-styling` CDN URL will remain available on unpkg.

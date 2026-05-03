# Moire

A roulette camera creation for the Rabbit R1. Each photo gets a random AI-powered preset filter — point, shoot, and let the roulette decide.

**[Live app](https://mattfinlayson.github.io/moire/) · [Install on R1](https://mattfinlayson.github.io/moire/install.html)**

## What It Does

Moire is a camera app that applies random AI-generated visual presets to each photo you take. Features include:

- Random preset roulette with interactive selection modal
- Burst, timer, and motion detection capture modes
- Combine mode for blending two effects
- In-app gallery with photo queue and sync
- All presets run locally — no server-side processing

## Installing on R1

Scan the QR code at [install.html](https://mattfinlayson.github.io/moire/install.html) using your R1's Creations scanner. The code encodes all the metadata the R1 needs to install it directly.

## Running Locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via the workflow in `.github/workflows/deploy.yml`. The Vite build outputs to `docs/`.

## Tech

- Vanilla HTML/CSS/JS
- [Vite](https://vitejs.dev) for building
- [qr-code-styling](https://www.npmjs.com/package/qr-code-styling) for QR code generation
- GitHub Pages for hosting

## License

[MIT](LICENSE)

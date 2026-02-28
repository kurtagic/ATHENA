# Athena

A frameless, always-on-top Electron overlay for **Foxhole** that displays the live war map with tactical tools.

## Controls

| Input | Action |
|-------|--------|
| **Backtick (`)** | Toggle overlay visibility (hides window and passes clicks through to game) |
| **Double-click hex** | Enter detail view |
| **Escape** | Exit detail view (or cancel artillery placement first) |
| **Right-click + drag** | Draw freehand strokes (detail view) |
| **Eraser button + right-click + drag** | Erase strokes touched by the cursor circle |
| **Ctrl+Z** | Undo last action |
| **Color swatches / picker** | Change draw color |

## Prerequisites

- Node.js 16+
- The `assets/` folder containing:
  - `tiles/` — world map tiles
  - `icons/` — structure icon sprites
  - `hexmaps/` — per-hex detail images

## Setup

```bash
# Install dependencies
npm install

# Fetch static location labels from the API (one-time)
npm run fetch-static

# Run in development with HMR
npm start
```

## Build

```bash
# Build installer (Windows Squirrel .exe)
npm run make
```

Output goes to `out/make/`.
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Proof-of-concept nutrition tracker powered by the Edamam Food Database API. Supports text search, barcode lookup (UPC/EAN/PLU), photo-based food recognition, and per-meal nutrient totaling. No framework — vanilla JS frontend, zero-dependency Node backend.

## Running Locally

```bash
node server.js        # starts on http://localhost:3000
```

Requires `.env` with `EDAMAM_APP_ID` and `EDAMAM_APP_KEY` (copy from `.env.example`). No `npm install` needed — the project has no runtime dependencies.

## Deployment

Deployed to Vercel. The `api/` directory contains Vercel serverless function handlers that mirror the routes in `server.js`. On Vercel, env vars come from the Vercel dashboard; locally, they are read from `.env`.

## Architecture

**Dual-runtime design:** The app runs two ways from the same codebase:

- **Local dev** — `server.js` is a plain `http.createServer` that serves `public/` as static files and routes `/api/*` requests to functions in `lib/edamam.js`.
- **Vercel** — Each file in `api/` is an independent serverless function (`api/search.js`, `api/barcode.js`, etc.) that also calls into `lib/edamam.js`. Static files in `public/` are served automatically.

**Key consequence:** All Edamam logic (API calls, response normalization, error handling) lives in `lib/edamam.js`. Both `server.js` and the `api/` handlers are thin wrappers around it. When changing backend behavior, edit `lib/edamam.js`; when changing routing or adding a new endpoint, update both `server.js` and add a corresponding `api/*.js` handler.

**Frontend** — `public/app.js` is a single-file vanilla JS app. `public/index.html` and `public/styles.css` complete the UI. All state (meals, daily totals) is managed client-side in memory.

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Credential check |
| GET | `/api/search?q=` | Text food search |
| GET | `/api/barcode?upc=` | Barcode lookup |
| GET | `/api/autocomplete?q=` | Search suggestions |
| POST | `/api/nutrition` | Full nutrition for a food+measure+quantity |
| POST | `/api/analyze-image` | Photo-based food recognition (beta) |

## Tracked Nutrients

Defined in `TRACKED_NUTRIENTS` in `lib/edamam.js`: Calories, Protein, Carbs, Fat, Fiber, Sugar, Sodium. This list drives both backend normalization and frontend display.

## ESM

The project uses ES modules (`"type": "module"` in package.json). All imports use `.js` extensions.

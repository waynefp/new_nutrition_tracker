# Nutrition Tracker — Handoff Document

**Date:** July 6, 2026 (originally April 8, 2026)
**Repo:** https://github.com/waynefp/new_nutrition_tracker
**Live:** https://nutrition-tracker-cdx.vercel.app (auto-deploys from `main` branch)

## Current Status (July 6, 2026)

The barcode-from-photo fixes (`barcode-photo-fixes.patch`, described in the
`New Nutrition/Four changes.txt` doc) were applied, committed as `4380d78`
("Fix barcode detection from photo uploads"), pushed, and verified live in
production. See "Barcode photo fixes (July 6)" below for details.

**The one open item:** the Photo tab (food photo analysis) has not been tested
against the deployed fixes. The barcode test proved the Edamam credentials and
UPC access work, but `/api/analyze-image` hits Edamam's Vision endpoint
(nutrients-from-image), which is a separately gated feature on Edamam plans.

**Next action:** open https://nutrition-tracker-cdx.vercel.app on a phone or
desktop, go to Add → Photo tab with DevTools open (F12 → Network), upload a
food photo, and watch the `/api/analyze-image` request:
- If it returns results — done, close this out.
- If it returns 403 or a "not available on your plan" message, that is a plan
  limitation no code can fix. Options: Edamam's Basic Vision tier ($14/mo), or
  swap that route to call Claude's vision API instead (same pattern as the
  grocery inventory app; the serverless function change would be small).

## Project Summary

Proof-of-concept nutrition tracker built on the Edamam Food Database API. Vanilla JS frontend, zero-dependency Node backend. The goal is to validate the core food-logging flows (search, barcode, photo) before deciding on a production stack.

## What's Built and Working

### Food input methods
- **Text search** — type a food name, get results from Edamam's parser endpoint. Working.
- **Manual barcode entry** — type a UPC/EAN/PLU code, look it up via Edamam. Working.
- **Live barcode scanner** — uses html5-qrcode (v2.3.8, loaded from unpkg CDN) to scan barcodes through the device camera. Works well on flat barcodes; curved surfaces are harder for the live scanner to lock onto.
- **Barcode from photo** — detection chain is `BarcodeDetector` → ZXing → html5-qrcode `scanFile`. Uploads are normalized to JPEG first so HEIC photos from an iPhone library work. See "Barcode photo fixes (July 6)".
- **Food photo analysis** — uploads a photo to Edamam's image-based nutrition endpoint (beta). Photos are resized and JPEG-compressed client-side; the payload check measures the encoded wire size (base64 string length) with headroom under Vercel's 4.5 MB body limit. **Untested against the live Vision endpoint — see Current Status.**

### Meal tracking
- Four meal buckets: Breakfast, Lunch, Dinner, Snacks.
- Per-meal nutrient totals and a daily overview with calorie ring and macro progress bars.
- Day navigation (previous/next/today) with per-day history.
- Frequent foods shortcut list built from logged entries.
- All state is stored in `localStorage` — no backend persistence.

### Nutrients tracked
Calories, Protein, Carbs, Fat, Fiber, Sugar, Sodium. Defined in `TRACKED_NUTRIENTS` in `lib/edamam.js` and mirrored in the frontend's `NUTRIENTS` object. Daily goals default to 2200 kcal / 140g protein / 240g carbs / 75g fat / 28g fiber.

## Deployment

- **Vercel** — auto-deploys from `main`. Env vars (`EDAMAM_APP_ID`, `EDAMAM_APP_KEY`) are set in the Vercel dashboard.
- **Local** — `node server.js` (default port 3000, override with `PORT` env var). Reads credentials from `.env`. No `npm install` needed.
- The codebase has a dual-runtime design: `server.js` for local dev, `api/*.js` serverless handlers for Vercel. Both call into `lib/edamam.js` for all Edamam logic.

## Key Decisions and Fixes

### Mobile file input fix (March 30)
The original CSS used `display: none` on hidden file inputs. Mobile browsers silently refuse to activate `display: none` inputs, which broke all camera and photo picker flows on phones. Fixed by:
1. Switching to a sr-only clip pattern (visually hidden but still activatable).
2. Replacing the `button` + `.click()` relay with native `<label>` wrappers around the file inputs — the most reliable cross-browser pattern for mobile file picking.

### Barcode scanning from photos (March 30)
The html5-qrcode `scanFile` method uses a software decoder that produces "No MultiFormat Readers" errors on typical phone photos (curved surfaces, slight angles, compression artifacts). Fixed by adding the browser-native `BarcodeDetector` API as the primary decoder. It handles real-world photos significantly better. html5-qrcode remains as a fallback for browsers that don't support `BarcodeDetector`.

### Photo preprocessing
Phone camera photos can be 5+ MB, which exceeds Vercel's 4.5 MB request body limit when base64-encoded in JSON. The client progressively resizes (1600px → 1280px → 1024px max dimension) and compresses (0.82 → 0.74 → 0.66 JPEG quality) until the encoded payload is under 3.9 MB.

### Barcode photo fixes (July 6) — commit `4380d78`
Four frontend-only changes (backend was already proven working), applied from `barcode-photo-fixes.patch`:
1. **JPEG conversion actually used** — `handleBarcodeImageSelection` now runs uploads through `buildScannerReadyImageFile()` before detection, so HEIC photos from an iPhone library get normalized instead of silently failing.
2. **ZXing added as the detection workhorse** — chain is now `BarcodeDetector` → ZXing → html5-qrcode. ZXing's `TRY_HARDER` mode with UPC/EAN format hints is dramatically better at reading 1D barcodes from still photos, and covers Safari/Firefox where `BarcodeDetector` doesn't exist. Loaded via one script tag (`@zxing/library@0.21.3` from unpkg) in `index.html`.
3. **Payload check fixed** — it was measuring decoded image bytes, so a "passing" 3.5 MB image actually produced a ~4.7 MB JSON body, over Vercel's 4.5 MB limit → 413 before the function ever ran. Now it measures the encoded wire size (the data-URL string length) with headroom (3.9 MB cap).
4. **Comments explaining why** — so a future edit doesn't "fix" these back.

Deployed and verified: the production deployment for `4380d78` is READY and the live site serves the ZXing script tag.

## What's Not Built / Known Gaps

- **No backend persistence** — all data lives in `localStorage`. Closing the browser or clearing data loses everything.
- **No authentication** — single-user, no accounts.
- **Edamam image endpoint is beta and possibly plan-gated** — results can be unreliable or empty for some foods, and the Vision endpoint may not be enabled on the current plan at all (see Current Status).
- **Curved barcode scanning** — the live scanner still struggles with barcodes on curved surfaces (cans, bottles). The "scan from photo" workaround with `BarcodeDetector` handles this better.
- **No offline support** — requires network for all Edamam API calls.
- **No tests** — this is a POC with no test suite.

## Recommended Next Steps (from README)

- Move to a React or Next.js frontend
- FastAPI or Node/Express backend with proper API layer
- SQLite for local/dev, Postgres for production
- Authentication and saved history
- Optional AI assistant for natural-language food logging

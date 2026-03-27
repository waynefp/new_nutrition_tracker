# Nutrition Tracker POC

This is a lightweight proof of concept for a nutrition tracking app that uses the Edamam Food Database API.

## What it does

- Searches for food by typed text
- Looks up a packaged item by barcode (`UPC`, `EAN`, or `PLU`)
- Analyzes a food photo with Edamam's image endpoint
- Pulls nutritional info for the selected food item
- Lets the user add the item to a meal
- Totals nutrients per meal and across the full day

## Why this setup

For the application itself, the best production shape is:

1. Frontend app for search / barcode / photo flows
2. Small backend that hides Edamam credentials and normalizes responses
3. Persistent storage for users, meals, and history

I would not use `n8n` as the primary app runtime for this. It is useful for background workflows, notifications, exports, or admin automation, but the user-facing search / scan / meal-tracking loop will be cleaner and faster in a dedicated app.

If you want AI-assisted orchestration later, Edamam's MCP layer is interesting for agent workflows. For the core app, the direct Food Database API is the better base because the behavior is explicit and predictable.

## Endpoints used

This POC uses these Edamam endpoints:

- `GET /api/food-database/v2/parser` for text search and barcode lookup
- `POST /api/food-database/v2/nutrients` for full nutrition on a selected item
- `POST /api/food-database/nutrients-from-image?beta=true` for image-based analysis
- `GET /auto-complete` for future search suggestions

## Local setup

1. Copy `.env.example` to `.env`
2. Add your Edamam credentials
3. Start the server:

```bash
node server.js
```

4. Open [http://localhost:3000](http://localhost:3000)

## Recommended next step after the POC

After validating the Edamam flows, I would move to:

- `Next.js` or `React` frontend
- `FastAPI` or `Node/Express` backend
- `SQLite` for local/dev storage, then `Postgres`
- authentication and saved history
- optional OpenAI or Edamam MCP assistant for "log my lunch" style natural-language flows

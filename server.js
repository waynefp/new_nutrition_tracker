import { createReadStream, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeImage,
  assertEdamamConfig,
  autocompleteFoods,
  fetchNutrition,
  getEdamamConfig,
  handleApiError,
  httpError,
  loadEnvFile,
  lookupBarcode,
  parseJsonBody,
  requireQuery,
  searchFoods,
  sendJson
} from "./lib/edamam.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const fileEnv = loadLocalEnv(path.join(__dirname, ".env"));
const env = {
  ...fileEnv,
  ...process.env
};

const PORT = Number(env.PORT || 3000);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const config = getEdamamConfig(env);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        hasEdamamCredentials: Boolean(config.appId && config.appKey)
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, res, url, config);
    }

    return serveStatic(res, url.pathname);
  } catch (error) {
    return handleApiError(res, error);
  }
});

server.listen(PORT, () => {
  console.log(`Nutrition Tracker running at http://localhost:${PORT}`);
});

async function handleApi(req, res, url, config) {
  assertEdamamConfig(config);

  if (req.method === "GET" && url.pathname === "/api/autocomplete") {
    const query = requireQuery(url, "q");
    const payload = await autocompleteFoods(config, query, url.searchParams.get("limit") || "6");
    return sendJson(res, 200, payload);
  }

  if (req.method === "GET" && url.pathname === "/api/search") {
    const query = requireQuery(url, "q");
    const payload = await searchFoods(config, query);
    return sendJson(res, 200, payload);
  }

  if (req.method === "GET" && url.pathname === "/api/barcode") {
    const upc = requireQuery(url, "upc");
    const payload = await lookupBarcode(config, upc);
    return sendJson(res, 200, payload);
  }

  if (req.method === "POST" && url.pathname === "/api/nutrition") {
    const body = await parseJsonBody(req);
    const payload = await fetchNutrition(config, body);
    return sendJson(res, 200, payload);
  }

  if (req.method === "POST" && url.pathname === "/api/analyze-image") {
    const body = await parseJsonBody(req);
    const payload = await analyzeImage(config, body);
    return sendJson(res, 200, payload);
  }

  throw httpError(404, "Not found");
}

async function serveStatic(res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = path
    .normalize(requestedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(publicDir, normalizedPath);

  try {
    await access(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function loadLocalEnv(filePath) {
  try {
    const file = readFileSync(filePath, "utf-8");
    return loadEnvFile(file);
  } catch {
    return {};
  }
}

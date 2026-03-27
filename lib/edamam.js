export const TRACKED_NUTRIENTS = [
  ["ENERC_KCAL", "Calories"],
  ["PROCNT", "Protein"],
  ["CHOCDF", "Carbs"],
  ["FAT", "Fat"],
  ["FIBTG", "Fiber"],
  ["SUGAR", "Sugar"],
  ["NA", "Sodium"]
];

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function loadEnvFile(fileContent) {
  return Object.fromEntries(
    fileContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        return [key, value];
      })
  );
}

export function getEdamamConfig(env) {
  return {
    appId: env.EDAMAM_APP_ID || "",
    appKey: env.EDAMAM_APP_KEY || ""
  };
}

export function assertEdamamConfig(config) {
  if (!config.appId || !config.appKey) {
    throw httpError(
      500,
      "Missing Edamam credentials. Copy .env.example to .env and add EDAMAM_APP_ID and EDAMAM_APP_KEY."
    );
  }
}

export function required(value, key) {
  if (value === undefined || value === null || value === "") {
    throw httpError(400, `"${key}" is required.`);
  }

  return value;
}

export function requireQuery(url, key) {
  return required(url.searchParams.get(key)?.trim(), key);
}

export async function searchFoods(config, query) {
  const data = await edamamGet(config, "/api/food-database/v2/parser", {
    ingr: query,
    "nutrition-type": "logging"
  });

  return {
    source: "text",
    items: normalizeParserResponse(data)
  };
}

export async function lookupBarcode(config, upc) {
  const data = await edamamGet(config, "/api/food-database/v2/parser", { upc });

  return {
    source: "barcode",
    items: normalizeParserResponse(data)
  };
}

export async function autocompleteFoods(config, query, limit = "6") {
  const suggestions = await edamamGet(config, "/auto-complete", {
    q: query,
    limit
  });

  return { suggestions };
}

export async function fetchNutrition(config, body) {
  const foodId = required(body.foodId, "foodId");
  const measureURI = required(body.measureURI, "measureURI");
  const quantity = Number(required(body.quantity, "quantity"));

  const data = await edamamPost(config, "/api/food-database/v2/nutrients", {
    ingredients: [
      {
        quantity,
        measureURI,
        foodId
      }
    ]
  });

  return {
    item: normalizeNutritionResponse(data, {
      foodId,
      label: body.label,
      brand: body.brand,
      image: body.image,
      quantity,
      measureLabel: body.measureLabel
    })
  };
}

export async function analyzeImage(config, body) {
  const image = required(body.image, "image");

  const data = await edamamPost(
    config,
    "/api/food-database/nutrients-from-image",
    { image },
    { beta: "true" }
  );

  return {
    item: normalizeVisionResponse(data)
  };
}

export async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw httpError(400, "Invalid JSON body.");
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    throw httpError(400, "Invalid JSON body.");
  }
}

export function sendJson(res, statusCode, payload) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(statusCode).json(payload);
  }

  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export function handleApiError(res, error) {
  return sendJson(res, error.statusCode || 500, {
    error: error.message || "Unexpected server error"
  });
}

export function round1(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

async function edamamGet(config, endpoint, params = {}) {
  const searchParams = new URLSearchParams({
    app_id: config.appId,
    app_key: config.appKey,
    ...params
  });

  const response = await fetch(`https://api.edamam.com${endpoint}?${searchParams}`);
  return parseEdamamResponse(response);
}

async function edamamPost(config, endpoint, payload, extraParams = {}) {
  const searchParams = new URLSearchParams({
    app_id: config.appId,
    app_key: config.appKey,
    ...extraParams
  });

  const response = await fetch(`https://api.edamam.com${endpoint}?${searchParams}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseEdamamResponse(response);
}

async function parseEdamamResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "string"
        ? data
        : data?.message || data?.[0]?.message || "Edamam request failed.";
    throw httpError(response.status, message);
  }

  return data;
}

function normalizeParserResponse(data) {
  const parsedItems = (data.parsed || []).map((entry) =>
    normalizeFoodCandidate(entry.food || {}, entry.measure ? [entry.measure] : [])
  );
  const hintItems = (data.hints || []).map((entry) =>
    normalizeFoodCandidate(entry.food || {}, entry.measures || [])
  );

  const deduped = new Map();
  for (const item of [...parsedItems, ...hintItems]) {
    if (!item.foodId || deduped.has(item.foodId)) {
      continue;
    }
    deduped.set(item.foodId, item);
  }

  return [...deduped.values()].slice(0, 12);
}

function normalizeFoodCandidate(food, measures) {
  const normalizedMeasures = (measures || []).map((measure) => ({
    label: measure.label,
    uri: measure.uri,
    weight: measure.weight || null
  }));

  const defaultMeasure =
    normalizedMeasures.find((measure) => measure.label?.toLowerCase() === "gram") ||
    normalizedMeasures[0] || {
      label: "Serving",
      uri: "http://www.edamam.com/ontologies/edamam.owl#Measure_serving",
      weight: null
    };

  return {
    foodId: food.foodId || "",
    label: food.label || food.knownAs || "Food item",
    knownAs: food.knownAs || "",
    brand: food.brand || "",
    category: food.categoryLabel || food.category || "",
    image: food.image || "",
    nutrientsPer100g: summarizeNutrients(food.nutrients || {}),
    measures: normalizedMeasures,
    defaultMeasure
  };
}

function normalizeNutritionResponse(data, context) {
  return {
    foodId: context.foodId,
    label: context.label || data.label || "Food item",
    brand: context.brand || "",
    image: context.image || "",
    quantity: context.quantity,
    measureLabel: context.measureLabel || "serving",
    calories: Math.round(data.calories || 0),
    totalWeight: round1(data.totalWeight || 0),
    dietLabels: data.dietLabels || [],
    healthLabels: data.healthLabels || [],
    nutrients: summarizeNutrients(data.totalNutrients || {})
  };
}

function normalizeVisionResponse(data) {
  const parsed = data.parsed || {};
  const food = parsed.food || {};
  const recipe = data.recipe || {};

  return {
    isResolved: true,
    foodId: food.foodId || "",
    label: recipe.label || food.label || "Recognized food",
    brand: food.brand || "",
    image: food.image || "",
    quantity: parsed.quantity || 1,
    measureLabel: parsed.measure?.label || "estimated serving",
    calories: Math.round(recipe.calories || 0),
    totalWeight: round1(recipe.totalWeight || parsed.measure?.weight || 0),
    dietLabels: recipe.dietLabels || [],
    healthLabels: recipe.healthLabels || [],
    nutrients: summarizeNutrients(recipe.totalNutrients || food.nutrients || {})
  };
}

function summarizeNutrients(nutrients) {
  const summary = {};

  for (const [key, label] of TRACKED_NUTRIENTS) {
    const nutrient = nutrients[key];
    const quantity =
      typeof nutrient === "number" ? nutrient : Number(nutrient?.quantity || 0);

    summary[key] = {
      key,
      label,
      quantity: round1(quantity),
      unit: typeof nutrient === "number" ? inferUnit(key) : nutrient?.unit || inferUnit(key)
    };
  }

  return summary;
}

function inferUnit(key) {
  if (key === "ENERC_KCAL") {
    return "kcal";
  }
  if (key === "NA") {
    return "mg";
  }
  return "g";
}

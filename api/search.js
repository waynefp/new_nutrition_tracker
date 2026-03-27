import {
  assertEdamamConfig,
  getEdamamConfig,
  handleApiError,
  requireQuery,
  searchFoods,
  sendJson
} from "../lib/edamam.js";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const config = getEdamamConfig(process.env);
    assertEdamamConfig(config);

    const query = requireQuery(url, "q");
    const payload = await searchFoods(config, query);
    return sendJson(res, 200, payload);
  } catch (error) {
    return handleApiError(res, error);
  }
}


import {
  assertEdamamConfig,
  autocompleteFoods,
  getEdamamConfig,
  handleApiError,
  requireQuery,
  sendJson
} from "../lib/edamam.js";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const config = getEdamamConfig(process.env);
    assertEdamamConfig(config);

    const query = requireQuery(url, "q");
    const payload = await autocompleteFoods(config, query, url.searchParams.get("limit") || "6");
    return sendJson(res, 200, payload);
  } catch (error) {
    return handleApiError(res, error);
  }
}

import {
  assertEdamamConfig,
  getEdamamConfig,
  handleApiError,
  lookupBarcode,
  requireQuery,
  sendJson
} from "../lib/edamam.js";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const config = getEdamamConfig(process.env);
    assertEdamamConfig(config);

    const upc = requireQuery(url, "upc");
    const payload = await lookupBarcode(config, upc);
    return sendJson(res, 200, payload);
  } catch (error) {
    return handleApiError(res, error);
  }
}


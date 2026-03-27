import {
  analyzeImage,
  assertEdamamConfig,
  getEdamamConfig,
  handleApiError,
  parseJsonBody,
  sendJson
} from "../lib/edamam.js";

export default async function handler(req, res) {
  try {
    const config = getEdamamConfig(process.env);
    assertEdamamConfig(config);

    const body = await parseJsonBody(req);
    const payload = await analyzeImage(config, body);
    return sendJson(res, 200, payload);
  } catch (error) {
    return handleApiError(res, error);
  }
}


import { getEdamamConfig, sendJson } from "../lib/edamam.js";

export default function handler(_req, res) {
  const config = getEdamamConfig(process.env);

  return sendJson(res, 200, {
    ok: true,
    hasEdamamCredentials: Boolean(config.appId && config.appKey)
  });
}


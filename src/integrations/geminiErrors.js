/**
 * Parse Gemini API errors for retries and user-facing messages.
 */

/**
 * @param {unknown} err
 */
export function isGeminiRateLimitError(err) {
  const status = err?.status ?? err?.statusCode;
  const msg = err?.message ?? String(err);
  return status === 429 || /429|quota|rate.?limit|resourceexhausted/i.test(msg);
}

/**
 * @param {unknown} err
 */
export function isGeminiQuotaZeroError(err) {
  const msg = err?.message ?? String(err);
  return /limit:\s*0/i.test(msg) || /free_tier.*limit: 0/i.test(msg);
}

/**
 * @param {unknown} err
 * @returns {number | null} milliseconds
 */
export function getGeminiRetryDelayMs(err) {
  const details = err?.errorDetails ?? [];
  for (const d of details) {
    if (d?.["@type"]?.includes?.("RetryInfo") && d.retryDelay) {
      const sec = parseFloat(String(d.retryDelay).replace(/s$/, ""));
      if (Number.isFinite(sec)) {
        return Math.ceil(sec * 1000) + 500;
      }
    }
  }
  const match = (err?.message ?? "").match(/retry in (\d+(?:\.\d+)?)s/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  }
  return 20_000;
}

/**
 * @param {unknown} err
 * @param {string} [model]
 */
export function formatGeminiErrorForUser(err, model) {
  if (isGeminiRateLimitError(err)) {
    if (isGeminiQuotaZeroError(err)) {
      return [
        "Gemini free quota is not available for this model on your API key.",
        "",
        "Try in .env:",
        "  GEMINI_MODEL=gemini-2.5-flash",
        "Or enable billing in Google AI Studio (free tier quotas often need a billing account linked):",
        "  https://aistudio.google.com/",
        "",
        model ? `(failed model: ${model})` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    return "Gemini rate limit hit. Wait ~30 seconds and try again.";
  }
  const msg = err?.message ?? String(err);
  if (/API key/i.test(msg)) {
    return "Invalid GEMINI_API_KEY. Create one at https://aistudio.google.com/apikey";
  }
  return `AI error: ${msg.slice(0, 200)}`;
}

/**
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

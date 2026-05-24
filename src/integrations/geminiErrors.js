/**
 * Parse Gemini API errors for retries and user-facing messages.
 */

/**
 * @param {unknown} err
 * @returns {number | null}
 */
export function getGeminiHttpStatus(err) {
  const direct = err?.status ?? err?.statusCode;
  if (direct) return Number(direct);
  const match = (err?.message ?? String(err)).match(/\[(\d{3})\s*\]/);
  return match ? Number(match[1]) : null;
}

/**
 * @param {unknown} err
 */
export function isGeminiRateLimitError(err) {
  const status = getGeminiHttpStatus(err);
  const msg = err?.message ?? String(err);
  return status === 429 || /429|quota|rate.?limit|resourceexhausted/i.test(msg);
}

/**
 * @param {unknown} err
 */
export function isGeminiOverloadError(err) {
  const status = getGeminiHttpStatus(err);
  const msg = err?.message ?? String(err);
  return (
    status === 503 ||
    status === 502 ||
    /high demand|overloaded|temporarily unavailable/i.test(msg)
  );
}

/**
 * @param {unknown} err
 */
export function isGeminiModelNotFoundError(err) {
  const status = getGeminiHttpStatus(err);
  const msg = err?.message ?? String(err);
  return status === 404 || /is not found for API/i.test(msg);
}

/**
 * @param {unknown} err
 */
export function isGeminiDailyQuotaExceeded(err) {
  const msg = err?.message ?? String(err);
  return (
    /GenerateRequestsPerDay|PerDayPerProjectPerModel|PerDay/i.test(msg) ||
    (/FreeTier/i.test(msg) && /quotaValue.*20/i.test(msg))
  );
}

/**
 * Per-minute / burst 429 — safe to retry after a short wait.
 * @param {unknown} err
 */
export function isGeminiTransientRateLimit(err) {
  return (
    isGeminiRateLimitError(err) &&
    !isGeminiDailyQuotaExceeded(err) &&
    !isGeminiQuotaZeroError(err)
  );
}

/**
 * @param {unknown} err
 */
export function shouldTryNextGeminiModel(err) {
  if (isGeminiModelNotFoundError(err) || isGeminiOverloadError(err)) {
    return true;
  }
  if (isGeminiQuotaZeroError(err) || isGeminiDailyQuotaExceeded(err)) {
    return true;
  }
  return isGeminiTransientRateLimit(err);
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
  if (isGeminiOverloadError(err)) {
    return "Gemini is busy (high demand). Wait ~30 seconds and try again.";
  }
  if (isGeminiModelNotFoundError(err)) {
    return [
      `Gemini model not found${model ? `: ${model}` : ""}.`,
      "Update Render env: GEMINI_FALLBACK_MODELS=gemini-2.5-flash",
      "(Remove gemini-1.5-flash — retired from the API.)",
    ].join("\n");
  }
  if (isGeminiRateLimitError(err)) {
    if (isGeminiDailyQuotaExceeded(err)) {
      return [
        "Gemini free tier daily limit reached (~20 requests per model per day).",
        "",
        "Wait until tomorrow (resets UTC), or enable billing:",
        "https://aistudio.google.com/",
        "",
        "Use AGENT_FAST_REPLY=1 on Render to use fewer API calls per message.",
        model ? `(model: ${model})` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
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
    return "Gemini rate limit (per minute). Wait ~30 seconds and try again.";
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

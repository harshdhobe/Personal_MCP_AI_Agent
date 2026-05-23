/**
 * Telegram Bot API client (send messages).
 */

const TELEGRAM_TEXT_LIMIT = 4096;
const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 4;

/**
 * Remove invisible chars Gmail snippets often include (cleaner + smaller payload).
 * @param {string} text
 */
export function sanitizeTelegramText(text) {
  return String(text)
    .replace(/[\u034F\u200B-\u200D\uFEFF\u00AD\u2060-\u2064]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param {unknown} err
 */
function formatFetchError(err) {
  const parts = [err?.message ?? String(err)];
  const cause = err?.cause;
  if (cause) {
    parts.push(`cause: ${cause.message ?? cause}`);
    if (cause.code) parts.push(`code: ${cause.code}`);
  }
  return parts.join(" | ");
}

/**
 * @param {string} url
 * @param {RequestInit} init
 */
async function fetchWithRetry(url, init = {}) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      });
      return res;
    } catch (err) {
      lastErr = err;
      const delay = Math.min(1000 * 2 ** attempt, 8000);
      console.warn(
        `[telegram] fetch attempt ${attempt + 1}/${MAX_RETRIES} failed: ${formatFetchError(err)}`
      );
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/**
 * @param {string} botToken
 * @param {string} method
 * @param {Record<string, unknown>} [body]
 */
async function telegramApi(botToken, method, body) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const init =
    body !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { method: "GET" };

  const res = await fetchWithRetry(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const desc = data.description ?? res.statusText;
    throw new Error(`Telegram API ${method} failed (${res.status}): ${desc}`);
  }
  return data;
}

/**
 * Long-poll getUpdates (used by scripts/telegram-poll.js).
 * @param {URL} url full URL including bot token and query params
 */
export async function telegramGetUpdates(url) {
  const res = await fetchWithRetry(url.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const desc = data.description ?? res.statusText;
    throw new Error(`Telegram getUpdates failed (${res.status}): ${desc}`);
  }
  return data;
}

/**
 * Split text into chunks at or below Telegram's message limit.
 * @param {string} text
 * @param {number} [limit]
 */
export function chunkTelegramText(text, limit = TELEGRAM_TEXT_LIMIT) {
  if (text.length <= limit) {
    return [text];
  }
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let splitAt = rest.lastIndexOf("\n", limit);
    if (splitAt < limit * 0.5) {
      splitAt = limit;
    }
    chunks.push(rest.slice(0, splitAt));
    rest = rest.slice(splitAt).trimStart();
  }
  if (rest.length > 0) {
    chunks.push(rest);
  }
  return chunks;
}

/**
 * @param {{ botToken: string; chatId: string | number; text: string }} params
 */
export async function sendTelegramText({ botToken, chatId, text }) {
  const clean = sanitizeTelegramText(text);
  const chunks = chunkTelegramText(clean);
  let lastResult;
  for (const chunk of chunks) {
    lastResult = await telegramApi(botToken, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    });
  }
  return lastResult;
}

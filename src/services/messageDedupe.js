/**
 * In-memory deduplication for inbound message IDs (WhatsApp, Telegram, etc.).
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, number>} */
const seen = new Map();

function prune(now) {
  for (const [key, expiresAt] of seen) {
    if (expiresAt <= now) {
      seen.delete(key);
    }
  }
}

/**
 * @param {string} channel e.g. "whatsapp" | "telegram"
 * @param {string} messageId
 * @param {number} [ttlMs]
 * @returns {boolean} true if this id was already processed (duplicate)
 */
export function isDuplicateMessage(channel, messageId, ttlMs = DEFAULT_TTL_MS) {
  if (!messageId) {
    return false;
  }
  const key = `${channel}:${messageId}`;
  const now = Date.now();
  prune(now);
  const expiresAt = seen.get(key);
  if (expiresAt !== undefined && expiresAt > now) {
    return true;
  }
  seen.set(key, now + ttlMs);
  return false;
}

/**
 * Gmail + agent performance helpers (env-tunable).
 */

export const READ_GMAIL_TOOLS = new Set([
  "list_unread",
  "search_emails",
  "summarize_inbox",
]);

/**
 * @param {string | undefined} value
 */
export function parseEnvFlag(value) {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @param {string | undefined} value
 * @param {number} fallback
 */
export function parseGmailMaxResults(value, fallback = 3) {
  const n = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 10);
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 * @param {number} defaultMax
 */
export function applyGmailListDefaults(toolName, args, defaultMax) {
  if (toolName !== "list_unread" && toolName !== "search_emails") {
    return args;
  }
  const max = args.max_results ?? defaultMax;
  return { ...args, max_results: Math.min(Number(max) || defaultMax, 10) };
}

/**
 * Smaller JSON for Gemini (faster second turn). Full payload kept for direct format.
 * @param {string} toolName
 * @param {unknown} payload
 */
export function slimGmailPayloadForModel(toolName, payload) {
  if (!payload || typeof payload !== "object" || payload.error) {
    return payload;
  }

  if (toolName === "list_unread" || toolName === "search_emails") {
    const messages = /** @type {{ messages?: object[] }} */ (payload).messages ?? [];
    return {
      messages: messages.map((m) => {
        const row = /** @type {{ id?: string; from?: string; subject?: string; date?: string }} */ (
          m
        );
        return {
          id: row.id,
          from: row.from,
          subject: row.subject,
          date: row.date,
        };
      }),
    };
  }

  if (toolName === "summarize_inbox") {
    const p = /** @type {{ messagesUnread?: number; messagesTotal?: number; recent?: object[] }} */ (
      payload
    );
    const recent = (p.recent ?? []).map((m) => {
      const row = /** @type {{ from?: string; subject?: string; date?: string }} */ (m);
      return { from: row.from, subject: row.subject, date: row.date };
    });
    return {
      messagesUnread: p.messagesUnread,
      messagesTotal: p.messagesTotal,
      recent,
    };
  }

  return payload;
}

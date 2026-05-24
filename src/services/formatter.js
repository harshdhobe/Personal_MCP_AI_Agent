/**
 * @param {unknown} payload
 */
function asMessagesArray(payload) {
  if (!payload || typeof payload !== "object") return null;
  const messages = /** @type {{ messages?: unknown[] }} */ (payload).messages;
  if (!Array.isArray(messages)) return null;
  return messages;
}

/**
 * Fallback when Gemini returns no text but Gmail tools succeeded.
 * @param {string} toolName
 * @param {unknown} payload
 */
export function formatGmailToolResultForChat(toolName, payload) {
  if (payload && typeof payload === "object" && payload.error) {
    const msg = payload.message ?? "Gmail tool failed.";
    return `Gmail error: ${msg}`;
  }

  const messages = asMessagesArray(payload);
  if (messages) {
    if (messages.length === 0) {
      return toolName === "search_emails"
        ? "No emails matched that search."
        : "No unread emails in your inbox.";
    }
    const lines = messages.map((m, i) => {
      const row = /** @type {{ from?: string; subject?: string; date?: string; snippet?: string }} */ (
        m
      );
      const snippet = row.snippet
        ? `\n   ${String(row.snippet).slice(0, 120)}`
        : "";
      return `${i + 1}. ${row.from ?? "Unknown"}\n   ${row.subject ?? "(no subject)"}\n   ${row.date ?? ""}${snippet}`;
    });
    const header =
      toolName === "search_emails" ? "Search results:" : "Unread emails:";
    return [header, "", ...lines].join("\n");
  }

  if (toolName === "summarize_inbox" && payload && typeof payload === "object") {
    const p = /** @type {{ messagesUnread?: number; messagesTotal?: number; recent?: unknown[] }} */ (
      payload
    );
    const recent = asMessagesArray({ messages: p.recent }) ?? [];
    const parts = [
      `Inbox: ${p.messagesUnread ?? "?"} unread of ${p.messagesTotal ?? "?"} total.`,
    ];
    if (recent.length > 0) {
      parts.push("", "Recent:");
      for (const m of recent.slice(0, 5)) {
        const row = /** @type {{ from?: string; subject?: string }} */ (m);
        parts.push(`• ${row.from ?? "?"} — ${row.subject ?? "(no subject)"}`);
      }
    }
    return parts.join("\n");
  }

  if (toolName === "get_email" && payload && typeof payload === "object") {
    const e = /** @type {{ from?: string; subject?: string; date?: string; body?: string }} */ (
      payload
    );
    const body = e.body ? `\n\n${e.body.slice(0, 1500)}` : "";
    return [`From: ${e.from ?? "?"}`, `Subject: ${e.subject ?? "?"}`, `Date: ${e.date ?? "?"}`, body]
      .filter(Boolean)
      .join("\n");
  }

  return "Done — but I could not format the Gmail result. Try asking again.";
}

/**
 * Format pending send confirmation for chat.
 * @param {{ to: string; subject: string; body: string; thread_id?: string }} draft
 */
export function formatSendConfirmation(draft) {
  const bodyPreview =
    draft.body.length > 500 ? `${draft.body.slice(0, 500)}…` : draft.body;
  return [
    "Ready to send this email:",
    "",
    `To: ${draft.to}`,
    `Subject: ${draft.subject}`,
    "",
    bodyPreview,
    "",
    "Reply YES to send, or NO to cancel.",
  ].join("\n");
}

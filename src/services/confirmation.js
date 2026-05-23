/**
 * Human-in-the-loop confirmation for send_email (Phase 4 core).
 */

import { invokeGmailTool } from "../integrations/mcpPool.js";
import { parseCallToolResult } from "../integrations/mcpClient.js";
import { formatSendConfirmation } from "./formatter.js";

const YES_PATTERN = /^(yes|y|confirm|send|ok)$/i;
const NO_PATTERN = /^(no|n|cancel|stop|abort)$/i;

/**
 * @param {string} text
 */
export function isYes(text) {
  return YES_PATTERN.test(text.trim());
}

/**
 * @param {string} text
 */
export function isNo(text) {
  return NO_PATTERN.test(text.trim());
}

/**
 * @param {ReturnType<import('./sessionManager.js').createSessionManager>} sessions
 * @param {string} sessionId
 * @param {string} userText
 */
export async function handleConfirmation(sessions, sessionId, userText) {
  const pending = sessions.getPending(sessionId);
  if (!pending || pending.type !== "send_email") {
    return { handled: false };
  }

  const text = userText.trim();

  if (isNo(text)) {
    sessions.clearPending(sessionId);
    return { handled: true, reply: "Cancelled. The email was not sent." };
  }

  if (!isYes(text)) {
    return {
      handled: true,
      reply: `${formatSendConfirmation(pending)}\n\n(Please reply YES or NO.)`,
    };
  }

  try {
    const raw = await invokeGmailTool("send_email", {
      to: pending.to,
      subject: pending.subject,
      body: pending.body,
      ...(pending.thread_id ? { thread_id: pending.thread_id } : {}),
    });
    const parsed = parseCallToolResult(raw);
    sessions.clearPending(sessionId);

    if (parsed.isError) {
      return {
        handled: true,
        reply: `Send failed: ${parsed.text ?? "Unknown error"}`,
      };
    }

    const id = parsed.structured?.id ?? "unknown";
    return {
      handled: true,
      reply: `Email sent successfully. (message id: ${id})`,
    };
  } catch (err) {
    return {
      handled: true,
      reply: err?.message ?? "Failed to send email.",
    };
  }
}

/**
 * Process Telegram Bot API updates (webhook or long polling).
 */

import { isDuplicateMessage } from "./messageDedupe.js";
import { sendTelegramText } from "./telegram.js";
import { getSessionManager } from "./sessionManager.js";
import { handleConfirmation } from "./confirmation.js";
import { runAgent } from "./agent.js";

/**
 * @param {{ botToken: string; chatId: string | number; text: string }} params
 */
async function safeSendTelegram(params) {
  try {
    await sendTelegramText(params);
    return true;
  } catch (err) {
    console.error("[telegram] send failed:", err?.message ?? err);
    if (err?.cause) {
      console.error("[telegram] send cause:", err.cause?.message ?? err.cause);
    }
    return false;
  }
}

/**
 * @param {import("../config/env.js").AppConfig} config
 * @param {object} update Telegram Update object
 */
export async function handleTelegramUpdate(config, update) {
  const telegram = config.channels.telegram;
  if (!telegram?.enabled) {
    return { handled: false, reason: "telegram_disabled" };
  }

  const message = update.message ?? update.edited_message;
  if (!message) {
    return { handled: false, reason: "no_message" };
  }

  const chatId = message.chat?.id;
  if (chatId === undefined || chatId === null) {
    return { handled: false, reason: "no_chat_id" };
  }

  const chatIdStr = String(chatId);
  if (chatIdStr !== telegram.allowedChatId) {
    console.warn(`[telegram] Ignored message from non-allowlisted chat_id=${chatIdStr}`);
    return { handled: false, reason: "not_allowlisted" };
  }

  const dedupeId = message.message_id
    ? String(message.message_id)
    : `update:${update.update_id}`;
  if (isDuplicateMessage("telegram", dedupeId)) {
    return { handled: true, reason: "duplicate" };
  }

  const text = message.text?.trim();
  if (!text) {
    await safeSendTelegram({
      botToken: telegram.botToken,
      chatId,
      text: "I only handle text messages for now. Send a plain text message.",
    });
    return { handled: true, reason: "unsupported_type" };
  }

  const sessionId = `telegram:${chatIdStr}`;
  const sessions = getSessionManager(config.session.ttlHours);

  try {
    let reply;

    if (sessions.isAwaitingConfirm(sessionId)) {
      const confirmed = await handleConfirmation(sessions, sessionId, text);
      reply = confirmed.reply ?? "Please reply YES or NO.";
    } else {
      const agentResult = await runAgent(config, sessionId, text);
      reply = agentResult.reply;
    }

    const sent = await safeSendTelegram({
      botToken: telegram.botToken,
      chatId,
      text: reply,
    });

    if (!sent) {
      await safeSendTelegram({
        botToken: telegram.botToken,
        chatId,
        text:
          "I processed your request but could not reach Telegram to deliver the reply. Check WSL internet or run: curl https://api.telegram.org/bot<token>/getMe",
      });
      return { handled: true, reason: "send_failed", inbound: text };
    }

    return { handled: true, reason: "agent_reply", inbound: text };
  } catch (err) {
    console.error("[telegram] Agent error:", err?.message ?? err);
    const safe =
      err?.message?.includes("API key") || /gemini|generative/i.test(err?.message ?? "")
        ? "AI service error. Check GEMINI_API_KEY in .env."
        : err?.message?.slice(0, 400) ||
          "Something went wrong. Please try again in a moment.";

    await safeSendTelegram({
      botToken: telegram.botToken,
      chatId,
      text: safe,
    });
    return { handled: true, reason: "agent_error", inbound: text };
  }
}

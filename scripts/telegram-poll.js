/**
 * Long-polling Telegram updates (local dev without ngrok).
 *
 * Usage: npm run telegram:poll
 * Requires: MESSAGING_CHANNELS includes telegram, TELEGRAM_* in .env
 */

import dotenv from "dotenv";
import "../src/utils/network.js";
import { loadConfig } from "../src/config/env.js";
import { handleTelegramUpdate } from "../src/services/telegramUpdateHandler.js";
import { telegramGetUpdates } from "../src/services/telegram.js";
import { warmupGmailMcp } from "../src/integrations/mcpPool.js";

dotenv.config();

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}

if (!config.channels.telegram?.enabled) {
  console.error("Telegram is not enabled. Set MESSAGING_CHANNELS=telegram in .env");
  process.exit(1);
}

const token = config.channels.telegram.botToken;
let offset = 0;
let running = true;

process.on("SIGINT", () => {
  running = false;
  console.log("\nStopping Telegram polling…");
});

console.log("Telegram long polling started. Message your bot to use the Gmail assistant.");
console.log(`Allowlisted chat_id: ${config.channels.telegram.allowedChatId}`);
if (config.performance?.agentFastReply) {
  console.log("Fast reply: ON (skips 2nd Gemini call for list/search/summarize)");
}
console.log("Press Ctrl+C to stop.\n");

try {
  await warmupGmailMcp();
} catch (err) {
  console.warn("[telegram] Gmail warmup failed:", err?.message ?? err);
}

while (running) {
  try {
    const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
    url.searchParams.set("timeout", "25");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("allowed_updates", JSON.stringify(["message", "edited_message"]));

    const data = await telegramGetUpdates(url);

    for (const update of data.result ?? []) {
      offset = update.update_id + 1;
      try {
        const result = await handleTelegramUpdate(config, update);
        if (result.handled && (result.reason === "agent_reply" || result.reason === "echo_pong")) {
          console.log(`[telegram] reply (${result.reason}) ← ${result.inbound?.slice(0, 50) ?? ""}`);
        } else if (result.reason === "not_allowlisted") {
          console.warn(`[telegram] ignored (not allowlisted)`);
        } else if (result.reason === "duplicate") {
          console.log(`[telegram] duplicate update skipped`);
        }
      } catch (err) {
        console.error("[telegram] handler error:", err?.message ?? err);
      }
    }
  } catch (err) {
    console.error("[telegram] poll error:", err?.message ?? err);
    if (err?.cause) {
      console.error("[telegram] poll cause:", err.cause?.message ?? err.cause);
    }
    await sleep(3000);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

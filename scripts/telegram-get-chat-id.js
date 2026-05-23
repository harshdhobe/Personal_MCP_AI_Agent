/**
 * Print Telegram updates so you can copy your chat_id into TELEGRAM_ALLOWED_CHAT_ID.
 *
 * 1. Message your bot once in Telegram.
 * 2. Run: npm run telegram:chat-id
 * 3. Copy the chat id into .env
 */

import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN in .env first.");
  process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/getUpdates?limit=10`;

const res = await fetch(url);
const data = await res.json();

if (!data.ok) {
  console.error("Telegram API error:", data.description ?? res.statusText);
  process.exit(1);
}

const updates = data.result ?? [];
if (updates.length === 0) {
  console.log("No updates yet. Open Telegram, send any message to your bot, then run this again.");
  process.exit(0);
}

console.log("\nRecent chats (use the id for TELEGRAM_ALLOWED_CHAT_ID):\n");
const seen = new Set();
for (const u of updates) {
  const msg = u.message ?? u.edited_message;
  if (!msg?.chat) continue;
  const { id, type, username, first_name, last_name } = msg.chat;
  if (seen.has(id)) continue;
  seen.add(id);
  const name = [first_name, last_name].filter(Boolean).join(" ") || username || "(no name)";
  console.log(`  chat_id=${id}  type=${type}  name=${name}`);
}
console.log("\nAdd to .env:\n  TELEGRAM_ALLOWED_CHAT_ID=<your chat_id>\n");

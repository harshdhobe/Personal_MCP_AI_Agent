/**
 * Register Telegram webhook after deploy.
 *
 * Usage:
 *   npm run telegram:set-webhook -- https://your-app.onrender.com
 *
 * Requires TELEGRAM_BOT_TOKEN in .env (or env).
 * Optional TELEGRAM_WEBHOOK_SECRET (must match Render env + setWebhook secret_token).
 */

import dotenv from "dotenv";

dotenv.config();

const baseUrl = process.argv[2]?.replace(/\/$/, "");
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
  console.error("Usage: npm run telegram:set-webhook -- https://your-app.onrender.com");
  process.exit(1);
}

const webhookUrl = `${baseUrl}/telegram/webhook`;
const params = new URLSearchParams({ url: webhookUrl });
if (secret) {
  params.set("secret_token", secret);
}

const apiUrl = `https://api.telegram.org/bot${token}/setWebhook?${params}`;

console.log(`Setting webhook → ${webhookUrl}`);
if (secret) {
  console.log("Using TELEGRAM_WEBHOOK_SECRET");
}

const res = await fetch(apiUrl);
const data = await res.json();

if (!data.ok) {
  console.error("setWebhook failed:", data.description ?? res.statusText);
  process.exit(1);
}

console.log("Webhook registered:", data.description ?? "OK");

const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const info = await infoRes.json();
if (info.ok) {
  console.log("Current webhook URL:", info.result?.url ?? "(none)");
  console.log("Pending updates:", info.result?.pending_update_count ?? 0);
}

console.log("\nStop local polling if running: npm run telegram:poll (Ctrl+C)");

import { Router } from "express";
import { config } from "../config/env.js";
import { verifyTelegramWebhook } from "../middleware/verifyTelegramWebhook.js";
import { handleTelegramUpdate } from "../services/telegramUpdateHandler.js";

/**
 * Telegram Bot API webhook (Phase 2T).
 * JSON body — no raw-body HMAC (unlike Meta WhatsApp).
 */
export const telegramRouter = Router();

telegramRouter.use(verifyTelegramWebhook(config));

telegramRouter.post("/", async (req, res) => {
  if (!config.channels.telegram?.enabled) {
    res.status(503).json({
      error: "Telegram not configured",
      message: "Set MESSAGING_CHANNELS=telegram and TELEGRAM_* in .env",
    });
    return;
  }

  const update = req.body;
  if (!update || typeof update !== "object") {
    res.status(400).json({ error: "Invalid update payload" });
    return;
  }

  // Ack quickly so Telegram does not retry while we reply.
  res.status(200).json({ ok: true });

  try {
    await handleTelegramUpdate(config, update);
  } catch (err) {
    console.error("[telegram] Webhook handler error:", err?.message ?? err);
  }
});

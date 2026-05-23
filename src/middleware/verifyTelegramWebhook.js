/**
 * Optional Telegram webhook secret validation.
 * @see https://core.telegram.org/bots/api#setwebhook
 */

/**
 * @param {import("../config/env.js").AppConfig} config
 */
export function verifyTelegramWebhook(config) {
  const secret = config.channels.telegram?.webhookSecret;
  if (!secret) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const header = req.get("X-Telegram-Bot-Api-Secret-Token");
    if (header !== secret) {
      res.status(403).json({ error: "Forbidden", message: "Invalid Telegram webhook secret" });
      return;
    }
    next();
  };
}

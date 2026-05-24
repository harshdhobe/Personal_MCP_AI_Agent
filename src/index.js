import express from "express";
import { fileURLToPath } from "node:url";
import "./utils/network.js";
import { config } from "./config/env.js";
import { webhookRouter } from "./routes/webhook.js";
import { telegramRouter } from "./routes/telegram.js";

/**
 * Parse JSON body for all routes except /webhook (needs raw body for HMAC).
 */
function jsonParserExceptWebhook() {
  const json = express.json({ limit: "1mb" });
  return (req, res, next) => {
    if (req.path.startsWith("/webhook")) {
      return next();
    }
    return json(req, res, next);
  };
}

/**
 * Capture raw body on /webhook for X-Hub-Signature-256 verification (Phase 2).
 */
function webhookRawBodyParser() {
  const raw = express.raw({ type: "application/json", limit: "1mb" });
  return (req, res, next) => {
    if (!req.path.startsWith("/webhook")) {
      return next();
    }
    return raw(req, res, (err) => {
      if (err) return next(err);
      req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
      if (req.rawBody.length > 0) {
        try {
          req.body = JSON.parse(req.rawBody.toString("utf8"));
        } catch {
          req.body = {};
        }
      } else {
        req.body = {};
      }
      return next();
    });
  };
}

function activeChannelNames() {
  const names = [];
  if (config.channels.whatsapp?.enabled) names.push("whatsapp");
  if (config.channels.telegram?.enabled) names.push("telegram");
  return names;
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      channels: activeChannelNames(),
    });
  });

  app.use(webhookRawBodyParser());
  app.use(jsonParserExceptWebhook());

  if (config.channels.whatsapp?.enabled) {
    app.use("/webhook", webhookRouter);
  }

  if (config.channels.telegram?.enabled) {
    app.use("/telegram/webhook", telegramRouter);
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

export function startServer() {
  const app = createApp();
  const channels = activeChannelNames();
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Server listening on port ${config.port}`);
    console.log(`Health check: /health`);
    console.log(`Messaging channels: ${channels.join(", ") || "none"}`);
    if (config.channels.whatsapp?.enabled) {
      console.log(`WhatsApp webhook: http://localhost:${config.port}/webhook (Phase 2 — stub)`);
    }
    if (config.channels.telegram?.enabled) {
      console.log(`Telegram webhook: http://localhost:${config.port}/telegram/webhook`);
      console.log(`Telegram polling: npm run telegram:poll (no ngrok required)`);
    }
  });
  return server;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    startServer();
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
}

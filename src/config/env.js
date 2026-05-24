import dotenv from "dotenv";
import { parseEnvFlag, parseGmailMaxResults } from "../utils/gmailPerf.js";

dotenv.config();

const WHATSAPP_VARS = [
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_ALLOWED_WA_ID",
];

const TELEGRAM_VARS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_CHAT_ID"];

const GMAIL_VARS = [
  "GMAIL_OAUTH_CLIENT_ID",
  "GMAIL_OAUTH_CLIENT_SECRET",
  "GMAIL_OAUTH_REDIRECT_URI",
  "GMAIL_REFRESH_TOKEN",
];

const ALWAYS_REQUIRED = ["GEMINI_API_KEY", ...GMAIL_VARS];

function requireNonEmpty(name) {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === "") {
    return name;
  }
  return null;
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return parsed;
}

function parsePositiveInt(value, fallback, name) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

/**
 * @param {string | undefined} value
 * @returns {{ whatsapp: boolean; telegram: boolean }}
 */
export function parseMessagingChannels(value) {
  const raw = (value ?? "whatsapp").trim();
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error(
      "MESSAGING_CHANNELS must include at least one of: whatsapp, telegram (e.g. telegram or whatsapp,telegram)"
    );
  }

  const valid = new Set(["whatsapp", "telegram"]);
  const invalid = parts.filter((p) => !valid.has(p));
  if (invalid.length > 0) {
    throw new Error(`Invalid MESSAGING_CHANNELS entries: ${invalid.join(", ")}`);
  }

  return {
    whatsapp: parts.includes("whatsapp"),
    telegram: parts.includes("telegram"),
  };
}

/**
 * Validates required environment variables and returns typed config.
 * Fails fast at startup with a clear error listing missing keys.
 */
export function loadConfig() {
  const channelFlags = parseMessagingChannels(process.env.MESSAGING_CHANNELS);

  const missing = ALWAYS_REQUIRED.map(requireNonEmpty).filter(Boolean);

  if (channelFlags.whatsapp) {
    missing.push(...WHATSAPP_VARS.map(requireNonEmpty).filter(Boolean));
  }
  if (channelFlags.telegram) {
    missing.push(...TELEGRAM_VARS.map(requireNonEmpty).filter(Boolean));
  }

  if (!channelFlags.whatsapp && !channelFlags.telegram) {
    missing.push("MESSAGING_CHANNELS (enable whatsapp and/or telegram)");
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Missing required environment variables:",
        ...missing.map((key) => `  - ${key}`),
        "",
        "Copy .env.example to .env and fill in values.",
        "Gemini API key: https://aistudio.google.com/apikey",
      ].join("\n")
    );
  }

  const result = {
    port: parsePort(process.env.PORT, 3000),
    messagingChannels: channelFlags,
    channels: {
      whatsapp: channelFlags.whatsapp
        ? {
            enabled: true,
            verifyToken: process.env.WHATSAPP_VERIFY_TOKEN.trim(),
            accessToken: process.env.WHATSAPP_ACCESS_TOKEN.trim(),
            phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID.trim(),
            appSecret: process.env.WHATSAPP_APP_SECRET.trim(),
            allowedWaId: process.env.WHATSAPP_ALLOWED_WA_ID.trim(),
          }
        : { enabled: false },
      telegram: channelFlags.telegram
        ? {
            enabled: true,
            botToken: process.env.TELEGRAM_BOT_TOKEN.trim(),
            allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID.trim(),
            webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null,
          }
        : { enabled: false },
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY.trim(),
      model: (process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite").trim(),
      fallbackModels: (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-2.5-flash")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    performance: {
      gmailMaxResults: parseGmailMaxResults(process.env.GMAIL_MAX_RESULTS, 3),
      agentFastReply: parseEnvFlag(process.env.AGENT_FAST_REPLY),
      skipSynthesis: parseEnvFlag(process.env.AGENT_SKIP_SYNTHESIS),
    },
    gmail: {
      clientId: process.env.GMAIL_OAUTH_CLIENT_ID.trim(),
      clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET.trim(),
      redirectUri: process.env.GMAIL_OAUTH_REDIRECT_URI.trim(),
      refreshToken: process.env.GMAIL_REFRESH_TOKEN.trim(),
    },
    mcp: {
      gmailCommand: process.env.MCP_GMAIL_COMMAND?.trim() || null,
    },
    session: {
      ttlHours: parsePositiveInt(process.env.SESSION_TTL_HOURS, 24, "SESSION_TTL_HOURS"),
    },
  };

  return result;
}

/**
 * @typedef {object} AppConfig
 * @property {number} port
 * @property {{ whatsapp: boolean; telegram: boolean }} messagingChannels
 * @property {object} channels
 * @property {{ apiKey: string; model: string }} gemini
 * @property {object} gmail
 * @property {object} mcp
 * @property {object} session
 */

export const config = loadConfig();

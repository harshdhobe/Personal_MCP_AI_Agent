/**
 * Gemini agent loop with Gmail MCP tools.
 */

import { parseCallToolResult } from "../integrations/mcpClient.js";
import {
  createGeminiModel,
  resolveGeminiModelChain,
} from "../integrations/geminiClient.js";
import {
  formatGeminiErrorForUser,
  getGeminiRetryDelayMs,
  isGeminiOverloadError,
  isGeminiQuotaZeroError,
  isGeminiRateLimitError,
  shouldTryNextGeminiModel,
  sleep,
} from "../integrations/geminiErrors.js";
import { invokeGmailTool, warmupGmailMcp } from "../integrations/mcpPool.js";
import { extractGeminiReplyText } from "../integrations/geminiResponse.js";
import {
  formatGmailToolResultForChat,
  formatSendConfirmation,
} from "./formatter.js";
import { getSessionManager } from "./sessionManager.js";
import {
  applyGmailListDefaults,
  READ_GMAIL_TOOLS,
  slimGmailPayloadForModel,
} from "../utils/gmailPerf.js";

const MAX_ITERATIONS = 8;
const MAX_GEMINI_SEND_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 12_000;

const SEND_TOOL = "send_email";

/**
 * @param {import("@google/generative-ai").ChatSession} chat
 * @param {string | object[]} message
 */
async function sendChatMessageWithRetry(chat, message) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_GEMINI_SEND_RETRIES; attempt += 1) {
    try {
      return await chat.sendMessage(message);
    } catch (err) {
      lastErr = err;
      if (
        (isGeminiRateLimitError(err) || isGeminiOverloadError(err)) &&
        !isGeminiQuotaZeroError(err) &&
        attempt < MAX_GEMINI_SEND_RETRIES - 1
      ) {
        const delay = isGeminiOverloadError(err)
          ? Math.min(2500 * (attempt + 1), 8000)
          : Math.min(getGeminiRetryDelayMs(err), MAX_RATE_LIMIT_WAIT_MS);
        console.warn(
          `[agent] Gemini ${isGeminiOverloadError(err) ? "overload" : "rate limit"} on sendMessage, waiting ${delay}ms (attempt ${attempt + 1}/${MAX_GEMINI_SEND_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * @param {import("../config/env.js").AppConfig} config
 * @param {string} modelName
 * @param {string} sessionId
 * @param {string} userText
 */
async function runAgentWithModel(config, modelName, sessionId, userText) {
  const started = Date.now();
  const sessions = getSessionManager(config.session.ttlHours);
  const model = createGeminiModel(config.gemini.apiKey, modelName);
  const chat = model.startChat({ history: sessions.getHistory(sessionId) });

  let iterations = 0;
  /** @type {string | object[] | undefined} */
  let nextMessage = userText;
  let lastResponse;
  /** @type {string | null} */
  let lastToolName = null;
  /** @type {unknown} */
  let lastToolPayload = null;

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;

    const result = await sendChatMessageWithRetry(chat, nextMessage);
    lastResponse = result.response;
    nextMessage = undefined;

    const functionCalls = lastResponse.functionCalls?.() ?? [];
    if (functionCalls.length === 0) {
      break;
    }

    const perf = config.performance;
    const gmailMax = perf.gmailMaxResults;

    for (const call of functionCalls) {
      if (call.name !== SEND_TOOL) continue;
      const args = call.args ?? {};
      const pending = {
        type: "send_email",
        to: String(args.to ?? ""),
        subject: String(args.subject ?? ""),
        body: String(args.body ?? ""),
        thread_id: args.thread_id ? String(args.thread_id) : undefined,
      };
      sessions.setPendingSend(sessionId, pending);
      const confirmText = formatSendConfirmation(pending);
      const durationMs = Date.now() - started;
      console.log(
        `[agent] session=${sessionId} model=${modelName} iterations=${iterations} durationMs=${durationMs} action=send_confirm`
      );
      try {
        const h = await chat.getHistory();
        sessions.replaceHistory(sessionId, h);
      } catch {
        /* ignore */
      }
      return { reply: confirmText, durationMs, model: modelName };
    }

    const readCalls = functionCalls.filter((c) => c.name !== SEND_TOOL);

    const settled = await Promise.all(
      readCalls.map(async (call) => {
        const name = call.name;
        const args = applyGmailListDefaults(name, call.args ?? {}, gmailMax);
        let toolPayload;
        try {
          const raw = await invokeGmailTool(name, args);
          const parsed = parseCallToolResult(raw);
          if (parsed.isError) {
            toolPayload = { error: true, message: parsed.text ?? "Tool error" };
          } else {
            toolPayload = parsed.structured ?? { raw: parsed.text };
          }
        } catch (err) {
          toolPayload = { error: true, message: err?.message ?? String(err) };
        }
        return { name, toolPayload };
      })
    );

    /** @type {object[]} */
    const functionResponses = [];

    for (const { name, toolPayload } of settled) {
      if (!toolPayload?.error) {
        lastToolName = name;
        lastToolPayload = toolPayload;
      }
      functionResponses.push({
        functionResponse: {
          name,
          response: slimGmailPayloadForModel(name, toolPayload),
        },
      });
    }

    if (
      perf.agentFastReply &&
      readCalls.length === 1 &&
      lastToolName &&
      READ_GMAIL_TOOLS.has(lastToolName) &&
      lastToolPayload &&
      !lastToolPayload.error
    ) {
      const reply = formatGmailToolResultForChat(lastToolName, lastToolPayload);
      const durationMs = Date.now() - started;
      console.log(
        `[agent] session=${sessionId} model=${modelName} iterations=${iterations} durationMs=${durationMs} fast_reply=${lastToolName}`
      );
      sessions.appendHistory(sessionId, {
        role: "user",
        parts: [{ text: userText }],
      });
      sessions.appendHistory(sessionId, {
        role: "model",
        parts: [{ text: reply }],
      });
      return { reply, durationMs, model: modelName };
    }

    nextMessage = functionResponses;
  }

  let reply = extractGeminiReplyText(lastResponse);

  if (
    !reply &&
    lastToolName &&
    lastToolPayload &&
    !config.performance.skipSynthesis
  ) {
    try {
      const synth = await sendChatMessageWithRetry(
        chat,
        "Write a concise plain-text reply for the user based only on the Gmail tool results above. Do not call any more tools."
      );
      reply = extractGeminiReplyText(synth.response);
    } catch (err) {
      console.warn(
        `[agent] synthesis pass failed: ${err?.message ?? err}`
      );
    }
  }

  if (!reply && lastToolName && lastToolPayload) {
    reply = formatGmailToolResultForChat(lastToolName, lastToolPayload);
    console.log(`[agent] used Gmail formatter fallback for ${lastToolName}`);
  }

  if (!reply) {
    reply =
      "I couldn't finish a reply (Gemini returned empty text). Wait ~30s and try again, or set GEMINI_MODEL=gemini-2.5-flash-lite in .env.";
  }

  try {
    const h = await chat.getHistory();
    sessions.replaceHistory(sessionId, h);
  } catch {
    sessions.appendHistory(sessionId, {
      role: "user",
      parts: [{ text: userText }],
    });
    sessions.appendHistory(sessionId, {
      role: "model",
      parts: [{ text: reply }],
    });
  }

  const durationMs = Date.now() - started;
  console.log(
    `[agent] session=${sessionId} model=${modelName} iterations=${iterations} durationMs=${durationMs}`
  );

  return { reply, durationMs, model: modelName };
}

/**
 * @param {import("../config/env.js").AppConfig} config
 * @param {string} sessionId
 * @param {string} userText
 */
export async function runAgent(config, sessionId, userText) {
  await warmupGmailMcp();

  const modelChain = resolveGeminiModelChain(config.gemini);
  let lastErr;
  let lastModel = modelChain[0];

  for (const modelName of modelChain) {
    lastModel = modelName;
    try {
      return await runAgentWithModel(config, modelName, sessionId, userText);
    } catch (err) {
      lastErr = err;
      if (shouldTryNextGeminiModel(err) && modelName !== modelChain[modelChain.length - 1]) {
        const status = err?.status ?? err?.message?.match(/\[(\d{3})/)?.[1] ?? "error";
        console.warn(
          `[agent] Model ${modelName} failed (${status}), trying next model…`
        );
        continue;
      }
      break;
    }
  }

  const message = formatGeminiErrorForUser(lastErr, lastModel);
  const wrapped = new Error(message);
  wrapped.cause = lastErr;
  throw wrapped;
}

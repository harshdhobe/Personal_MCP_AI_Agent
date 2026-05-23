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
  isGeminiQuotaZeroError,
  isGeminiRateLimitError,
  sleep,
} from "../integrations/geminiErrors.js";
import { invokeGmailTool, warmupGmailMcp } from "../integrations/mcpPool.js";
import { formatSendConfirmation } from "./formatter.js";
import { getSessionManager } from "./sessionManager.js";

const MAX_ITERATIONS = 8;

const SEND_TOOL = "send_email";

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

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;

    let result;
    try {
      result = await chat.sendMessage(nextMessage);
    } catch (err) {
      if (isGeminiRateLimitError(err) && !isGeminiQuotaZeroError(err)) {
        const delay = getGeminiRetryDelayMs(err);
        console.warn(`[agent] Rate limit on sendMessage, waiting ${delay}ms`);
        await sleep(delay);
        result = await chat.sendMessage(nextMessage);
      } else {
        throw err;
      }
    }

    lastResponse = result.response;
    nextMessage = undefined;

    const functionCalls = lastResponse.functionCalls?.() ?? [];
    if (functionCalls.length === 0) {
      break;
    }

    /** @type {object[]} */
    const functionResponses = [];

    for (const call of functionCalls) {
      const name = call.name;
      const args = call.args ?? {};

      if (name === SEND_TOOL) {
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

      functionResponses.push({
        functionResponse: {
          name,
          response: toolPayload,
        },
      });
    }

    nextMessage = functionResponses;
  }

  const reply =
    lastResponse?.text?.()?.trim() ||
    "I couldn't generate a reply. Please try again.";

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
      const tryNext =
        isGeminiQuotaZeroError(err) || isGeminiRateLimitError(err);
      if (tryNext && modelName !== modelChain[modelChain.length - 1]) {
        console.warn(
          `[agent] Model ${modelName} failed (${err?.status ?? "quota"}), trying next model…`
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

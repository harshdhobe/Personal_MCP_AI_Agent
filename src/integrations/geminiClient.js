/**
 * Google Gemini client for chat + function calling.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GMAIL_FUNCTION_DECLARATIONS } from "../agent/tools.js";
import { SYSTEM_PROMPT } from "../agent/systemPrompt.js";

/** Models that usually still have free-tier quota (2026). */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const DEFAULT_GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash",
];

/**
 * @param {string} apiKey
 * @param {string} model
 */
export function createGeminiModel(apiKey, model) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model,
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: GMAIL_FUNCTION_DECLARATIONS }],
  });
}

/**
 * @param {{ apiKey: string; model: string; fallbackModels?: string[] }} config
 * @returns {string[]}
 */
export function resolveGeminiModelChain(config) {
  const primary = config.model?.trim() || DEFAULT_GEMINI_MODEL;
  const fallbacks = config.fallbackModels?.length
    ? config.fallbackModels
    : DEFAULT_GEMINI_FALLBACK_MODELS;
  const chain = [primary, ...fallbacks.filter((m) => m && m !== primary)];
  return [...new Set(chain)];
}

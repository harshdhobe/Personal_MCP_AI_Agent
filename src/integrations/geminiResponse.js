/**
 * Extract user-visible text from Gemini generateContent responses.
 */

/**
 * @param {import("@google/generative-ai").GenerateContentResponse | undefined} response
 * @returns {string | null}
 */
export function extractGeminiReplyText(response) {
  if (!response) return null;

  try {
    const direct = response.text?.();
    if (direct?.trim()) return direct.trim();
  } catch {
    /* text() throws when no text parts — fall through */
  }

  const candidates = response.candidates ?? [];
  for (const c of candidates) {
    const parts = c?.content?.parts ?? [];
    const texts = parts
      .filter((p) => typeof p.text === "string" && p.text.trim())
      .map((p) => p.text.trim());
    if (texts.length > 0) {
      return texts.join("\n");
    }
  }

  const finish = candidates[0]?.finishReason;
  if (finish === "SAFETY") {
    return "The reply was blocked by safety filters. Try rephrasing your request.";
  }
  if (finish === "MAX_TOKENS") {
    return "The reply was cut off (too long). Ask for fewer emails or a shorter summary.";
  }

  return null;
}

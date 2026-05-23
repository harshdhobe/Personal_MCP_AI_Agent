/**
 * Call Gmail tools in the same Node process (no MCP stdio subprocess).
 * Use on WSL when the project lives under /mnt/... — spawning MCP is very slow.
 */

import {
  createGmailClient,
  invokeGmailToolByName,
  mapGmailError,
} from "../../mcp-gmail/gmailTools.js";

/** @type {ReturnType<typeof createGmailClient> | null} */
let gmail = null;

/**
 * Use in-process Gmail when GMAIL_INPROCESS=1, or auto on WSL /mnt/ paths.
 */
export function shouldUseInProcessGmail() {
  const flag = process.env.GMAIL_INPROCESS?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return process.platform === "linux" && /\/mnt\//i.test(process.cwd());
}

export async function warmupInProcessGmail() {
  if (!gmail) {
    const started = Date.now();
    gmail = createGmailClient();
    console.log(`[gmail] in-process client ready in ${Date.now() - started}ms`);
  }
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} [args]
 */
export async function invokeGmailToolInProcess(toolName, args = {}) {
  await warmupInProcessGmail();
  try {
    return await invokeGmailToolByName(gmail, toolName, args);
  } catch (err) {
    return mapGmailError(err);
  }
}

export function resetInProcessGmail() {
  gmail = null;
}

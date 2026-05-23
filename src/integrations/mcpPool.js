/**
 * Gmail tool access: in-process (fast on WSL) or MCP stdio subprocess.
 */

import {
  createGmailMcpClient,
  mapMcpTransportError,
  getMcpTimeoutMs,
} from "./mcpClient.js";
import {
  shouldUseInProcessGmail,
  warmupInProcessGmail,
  invokeGmailToolInProcess,
  resetInProcessGmail,
} from "./gmailInProcess.js";

/** @type {import("./mcpClient.js").GmailMcpClient | null} */
let client = null;
/** @type {Promise<import("./mcpClient.js").GmailMcpClient> | null} */
let connectPromise = null;

export { shouldUseInProcessGmail };

export async function getGmailMcpClient() {
  if (client) {
    return client;
  }
  if (!connectPromise) {
    const connectStarted = Date.now();
    connectPromise = createGmailMcpClient()
      .then((c) => {
        client = c;
        console.log(`[mcp] connected in ${Date.now() - connectStarted}ms`);
        return c;
      })
      .catch((err) => {
        connectPromise = null;
        throw err;
      });
  }
  return connectPromise;
}

export async function resetGmailMcpClient() {
  resetInProcessGmail();
  if (client) {
    try {
      await client.close();
    } catch {
      /* ignore EPIPE / already closed */
    }
  }
  client = null;
  connectPromise = null;
}

export async function warmupGmailMcp() {
  if (shouldUseInProcessGmail()) {
    await warmupInProcessGmail();
    return;
  }
  const started = Date.now();
  const mcp = await getGmailMcpClient();
  await mcp.listTools({ timeout: getMcpTimeoutMs() });
  console.log(`[mcp] warmup ready in ${Date.now() - started}ms`);
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} [args]
 */
export async function invokeGmailTool(toolName, args = {}) {
  const started = Date.now();
  const mode = shouldUseInProcessGmail() ? "in-process" : "mcp";

  try {
    let result;
    if (shouldUseInProcessGmail()) {
      result = await invokeGmailToolInProcess(toolName, args);
    } else {
      const mcp = await getGmailMcpClient();
      result = await mcp.callTool(toolName, args);
    }
    console.log(`[gmail:${mode}] ${toolName} ok in ${Date.now() - started}ms`);
    return result;
  } catch (err) {
    console.warn(`[gmail:${mode}] ${toolName} failed after ${Date.now() - started}ms`);
    if (!shouldUseInProcessGmail()) {
      await resetGmailMcpClient();
    }
    const msg = mapMcpTransportError(err);
    if (/timeout|timed out/i.test(msg)) {
      throw new Error(
        `${msg} (limit ${getMcpTimeoutMs()}ms). On WSL, use GMAIL_INPROCESS=1 or move the repo off /mnt/d/.`
      );
    }
    throw new Error(msg);
  }
}

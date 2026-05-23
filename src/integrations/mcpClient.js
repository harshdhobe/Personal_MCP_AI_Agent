/**
 * MCP stdio client for the bundled Gmail MCP server (Phase 1).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * MCP tool call timeout (stdio spawn + Gmail can be slow on WSL / first run).
 */
export function getMcpTimeoutMs() {
  const parsed = Number.parseInt(process.env.MCP_GMAIL_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 15_000) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Parse MCP_GMAIL_COMMAND: optional JSON array ["exe","arg1",...] or shell-like string.
 * @param {string | null | undefined} commandEnv
 * @param {{ command: string; args: string[] }} defaults
 */
export function parseMcpGmailCommand(commandEnv, defaults) {
  const raw = commandEnv?.trim();
  if (!raw) {
    return defaults;
  }
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length < 1) {
        throw new Error("MCP_GMAIL_COMMAND JSON must be a non-empty array");
      }
      const [cmd, ...args] = parsed.map(String);
      return { command: cmd, args };
    } catch (e) {
      throw new Error(`Invalid MCP_GMAIL_COMMAND JSON: ${e.message}`);
    }
  }
  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g);
  if (!parts?.length) {
    return defaults;
  }
  const unquote = (s) => s.replace(/^"(.*)"$/, "$1");
  const command = unquote(parts[0]);
  const args = parts.slice(1).map(unquote);
  return { command, args };
}

/**
 * Default: spawn current Node with mcp-gmail/index.js (works on Windows without shell).
 */
export function defaultGmailMcpSpawnOptions() {
  const scriptPath = join(__dirname, "..", "..", "mcp-gmail", "index.js");
  return {
    command: process.execPath,
    args: [scriptPath],
    env: { ...process.env },
  };
}

export function resolveGmailMcpSpawnOptions() {
  const defaults = defaultGmailMcpSpawnOptions();
  const merged = parseMcpGmailCommand(process.env.MCP_GMAIL_COMMAND, {
    command: defaults.command,
    args: defaults.args,
  });
  return {
    ...merged,
    env: defaults.env,
  };
}

/**
 * @typedef {object} CallToolParsed
 * @property {boolean} [isError]
 * @property {unknown} [structured]
 * @property {string} [text]
 */

/**
 * Extract JSON or text from MCP callTool result for logging / agent use.
 * @param {object} result
 * @returns {CallToolParsed}
 */
export function parseCallToolResult(result) {
  const isError = Boolean(result?.isError);
  const blocks = result?.content ?? [];
  const textParts = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .filter(Boolean);
  const text = textParts.join("\n");
  let structured;
  try {
    structured = text ? JSON.parse(text) : undefined;
  } catch {
    structured = undefined;
  }
  return { isError, structured, text };
}

/**
 * User-safe message for Gmail/MCP failures (Phase 3+ can reuse).
 * @param {Error} err
 */
export function mapMcpTransportError(err) {
  const msg = err?.message ?? String(err);
  if (/401|unauthorized/i.test(msg)) {
    return "Gmail authorization failed. Check GMAIL_REFRESH_TOKEN and re-run scripts/gmail-oauth-setup.js.";
  }
  if (/timeout|timed out|RequestTimeout/i.test(msg)) {
    return "Gmail is taking too long. Try again in a moment.";
  }
  return `Something went wrong talking to Gmail (${msg.slice(0, 120)})`;
}

export class GmailMcpClient {
  /**
   * @param {Client} client
   * @param {{ timeoutMs?: number }} [options]
   */
  constructor(client, options = {}) {
    this.client = client;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * @param {{ timeout?: number }} [options]
   */
  async listTools(options = {}) {
    const timeout = options.timeout ?? this.timeoutMs;
    return this.client.listTools(undefined, { timeout });
  }

  /**
   * @param {string} name
   * @param {Record<string, unknown>} [args]
   */
  async callTool(name, args = {}) {
    return this.client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: this.timeoutMs }
    );
  }

  async close() {
    try {
      await this.client.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Connect to Gmail MCP over stdio.
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<GmailMcpClient>}
 */
export async function createGmailMcpClient(options = {}) {
  const { command, args, env } = resolveGmailMcpSpawnOptions();
  const timeoutMs = options.timeoutMs ?? getMcpTimeoutMs();

  const transport = new StdioClientTransport({
    command,
    args,
    env,
    stderr: "inherit",
  });

  const client = new Client({
    name: "whatsapp-ai-gmail-assistant",
    version: "0.1.0",
  });

  await client.connect(transport);
  return new GmailMcpClient(client, { timeoutMs });
}

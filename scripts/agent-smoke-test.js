/**
 * Smoke test: run agent once with a message (no Telegram).
 *
 * Usage: node scripts/agent-smoke-test.js "List my unread emails"
 */

import dotenv from "dotenv";
import { loadConfig } from "../src/config/env.js";
import { runAgent } from "../src/services/agent.js";
import { resetGmailMcpClient } from "../src/integrations/mcpPool.js";

dotenv.config();

const message = process.argv.slice(2).join(" ") || "List my 3 most recent unread emails briefly.";

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}

try {
  console.log("User:", message);
  const { reply, durationMs } = await runAgent(config, "smoke:test", message);
  console.log(`\n--- Reply (${durationMs}ms) ---\n`);
  console.log(reply);
} catch (err) {
  console.error(err?.message ?? err);
  process.exit(1);
} finally {
  try {
    await resetGmailMcpClient();
  } catch {
    /* ignore EPIPE on shutdown */
  }
}

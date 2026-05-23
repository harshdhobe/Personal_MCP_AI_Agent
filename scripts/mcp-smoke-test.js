/**
 * Smoke test: connect MCP client, list tools, call list_unread and search_emails.
 *
 * Requires valid Gmail OAuth in .env (real GMAIL_REFRESH_TOKEN).
 *
 * Usage: npm run mcp:smoke
 */

import dotenv from "dotenv";
import {
  createGmailMcpClient,
  parseCallToolResult,
  mapMcpTransportError,
} from "../src/integrations/mcpClient.js";

dotenv.config();

async function main() {
  let mcp = null;
  try {
    mcp = await createGmailMcpClient();
    const tools = await mcp.listTools();
    console.log("Tools:", tools.tools?.map((t) => t.name).join(", "));

    const unread = parseCallToolResult(
      await mcp.callTool("list_unread", { max_results: 5 })
    );
    console.log("\n--- list_unread ---");
    if (unread.isError) {
      console.warn("Tool error:", unread.text);
    } else {
      console.log(JSON.stringify(unread.structured ?? unread.text, null, 2));
    }

    const search = parseCallToolResult(
      await mcp.callTool("search_emails", {
        query: "newer_than:30d",
        max_results: 5,
      })
    );
    console.log("\n--- search_emails newer_than:30d ---");
    if (search.isError) {
      console.warn("Tool error:", search.text);
    } else {
      console.log(JSON.stringify(search.structured ?? search.text, null, 2));
    }
  } catch (err) {
    console.error(mapMcpTransportError(err));
    console.error(err);
    process.exit(1);
  } finally {
    if (mcp) await mcp.close();
  }
}

main();

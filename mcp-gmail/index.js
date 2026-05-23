/**
 * Minimal Gmail MCP server (stdio) for MVP tools.
 */

import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createGmailClient,
  invokeGmailToolByName,
  mapGmailError,
  requireGmailEnv,
} from "./gmailTools.js";

function ignorePipeErrors() {
  const handler = (err) => {
    if (err?.code === "EPIPE") {
      process.exit(0);
    }
  };
  process.stdout.on("error", handler);
  process.stdin.on("error", handler);
}

async function main() {
  ignorePipeErrors();
  requireGmailEnv();
  const gmail = createGmailClient();

  const mcpServer = new McpServer({
    name: "gmail-mcp",
    version: "0.1.0",
  });

  const wrap =
    (name, handler) =>
    async (args) => {
      try {
        return await handler(args);
      } catch (err) {
        return mapGmailError(err);
      }
    };

  mcpServer.registerTool(
    "list_unread",
    {
      description: "List unread messages in the inbox.",
      inputSchema: {
        max_results: z.number().int().min(1).max(50).optional(),
      },
    },
    wrap("list_unread", (args) => invokeGmailToolByName(gmail, "list_unread", args))
  );

  mcpServer.registerTool(
    "search_emails",
    {
      description: "Search messages using Gmail search syntax.",
      inputSchema: {
        query: z.string().min(1),
        max_results: z.number().int().min(1).max(50).optional(),
      },
    },
    wrap("search_emails", (args) => invokeGmailToolByName(gmail, "search_emails", args))
  );

  mcpServer.registerTool(
    "summarize_inbox",
    {
      description: "Inbox stats plus recent snippets.",
      inputSchema: {
        recent_max: z.number().int().min(1).max(30).optional(),
      },
    },
    wrap("summarize_inbox", (args) => invokeGmailToolByName(gmail, "summarize_inbox", args))
  );

  mcpServer.registerTool(
    "get_email",
    {
      description: "Fetch one message by ID.",
      inputSchema: {
        message_id: z.string().min(1),
        body_max_chars: z.number().int().min(100).max(50000).optional(),
      },
    },
    wrap("get_email", (args) => invokeGmailToolByName(gmail, "get_email", args))
  );

  mcpServer.registerTool(
    "create_draft",
    {
      description: "Create a draft email.",
      inputSchema: {
        to: z.string().min(1),
        subject: z.string().min(1),
        body: z.string().min(1),
        thread_id: z.string().optional(),
      },
    },
    wrap("create_draft", (args) => invokeGmailToolByName(gmail, "create_draft", args))
  );

  mcpServer.registerTool(
    "send_email",
    {
      description: "Send a plain text email.",
      inputSchema: {
        to: z.string().min(1),
        subject: z.string().min(1),
        body: z.string().min(1),
        thread_id: z.string().optional(),
      },
    },
    wrap("send_email", (args) => invokeGmailToolByName(gmail, "send_email", args))
  );

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

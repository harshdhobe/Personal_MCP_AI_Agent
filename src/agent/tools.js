import { SchemaType } from "@google/generative-ai";

/**
 * Gemini function declarations mirroring Gmail MCP tools.
 */
export const GMAIL_FUNCTION_DECLARATIONS = [
  {
    name: "list_unread",
    description: "List unread messages in the inbox (id, threadId, snippet, metadata).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        max_results: {
          type: SchemaType.INTEGER,
          description: "Max messages to return (1-50, default 10).",
        },
      },
    },
  },
  {
    name: "search_emails",
    description: "Search messages using Gmail search syntax (same as Gmail search box).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: "Gmail search query, e.g. from:alice subject:invoice newer_than:7d",
        },
        max_results: {
          type: SchemaType.INTEGER,
          description: "Max results (1-50, default 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "summarize_inbox",
    description: "Inbox label stats plus recent inbox message snippets for summarization.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        recent_max: {
          type: SchemaType.INTEGER,
          description: "Recent inbox messages to include (1-30, default 10).",
        },
      },
    },
  },
  {
    name: "get_email",
    description: "Fetch one message by ID (headers + plain text body preview).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        message_id: {
          type: SchemaType.STRING,
          description: "Gmail message id",
        },
        body_max_chars: {
          type: SchemaType.INTEGER,
          description: "Truncate body (100-50000, default 8000).",
        },
      },
      required: ["message_id"],
    },
  },
  {
    name: "create_draft",
    description: "Create a draft email (plain text). Does not send.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        to: { type: SchemaType.STRING, description: "Recipient email" },
        subject: { type: SchemaType.STRING, description: "Subject line" },
        body: { type: SchemaType.STRING, description: "Plain text body" },
        thread_id: {
          type: SchemaType.STRING,
          description: "Optional thread id for reply drafts",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "send_email",
    description:
      "Send a plain text email. Only use after user explicitly confirmed YES in chat. Host blocks direct send until confirmed.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        to: { type: SchemaType.STRING, description: "Recipient email" },
        subject: { type: SchemaType.STRING, description: "Subject line" },
        body: { type: SchemaType.STRING, description: "Plain text body" },
        thread_id: {
          type: SchemaType.STRING,
          description: "Optional thread id",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
];

/**
 * Gmail tool implementations (shared by MCP stdio server and in-process agent).
 */

import { google } from "googleapis";

export function requireGmailEnv() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  const missing = [];
  if (!clientId) missing.push("GMAIL_OAUTH_CLIENT_ID");
  if (!clientSecret) missing.push("GMAIL_OAUTH_CLIENT_SECRET");
  if (!redirectUri) missing.push("GMAIL_OAUTH_REDIRECT_URI");
  if (!refreshToken) missing.push("GMAIL_REFRESH_TOKEN");
  if (missing.length) {
    throw new Error(`Missing Gmail env: ${missing.join(", ")}`);
  }
  return { clientId, clientSecret, redirectUri, refreshToken };
}

export function createGmailClient() {
  const { clientId, clientSecret, redirectUri, refreshToken } = requireGmailEnv();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

function getHeader(headers, name) {
  if (!headers) return "";
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function decodeBase64Url(data) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractPlainTextFromPayload(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.body?.data && !payload.parts) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts || []) {
    const t = extractPlainTextFromPayload(part);
    if (t) return t;
  }
  return "";
}

function encodeRawRfc822({ to, subject, body }) {
  const normalizedBody = String(body).replace(/\r?\n/g, "\r\n");
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    normalizedBody,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export function toolJson(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function mapGmailError(err) {
  const code = err?.code ?? err?.response?.status;
  const msg = err?.message ?? String(err);
  if (code === 401 || code === "401") {
    return toolError(
      "Gmail authentication failed (401). Refresh token may be revoked — re-run scripts/gmail-oauth-setup.js."
    );
  }
  return toolError(`Gmail API error: ${msg}`);
}

const METADATA_HEADERS = ["From", "To", "Subject", "Date"];

async function fetchMessagesMetadata(gmail, refs, headerNames = METADATA_HEADERS) {
  const concurrency = 4;
  const out = [];
  for (let i = 0; i < refs.length; i += concurrency) {
    const chunk = refs.slice(i, i + concurrency);
    const rows = await Promise.all(
      chunk.map(async (m) => {
        const meta = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "metadata",
          metadataHeaders: headerNames,
        });
        const headers = meta.data.payload?.headers ?? [];
        return {
          id: m.id,
          threadId: m.threadId,
          snippet: meta.data.snippet ?? "",
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          subject: getHeader(headers, "Subject"),
          date: getHeader(headers, "Date"),
        };
      })
    );
    out.push(...rows);
  }
  return out;
}

/**
 * @param {ReturnType<typeof createGmailClient>} gmail
 * @param {string} name
 * @param {Record<string, unknown>} args
 */
export async function invokeGmailToolByName(gmail, name, args = {}) {
  switch (name) {
    case "list_unread": {
      const max = args.max_results ?? 5;
      const res = await gmail.users.messages.list({
        userId: "me",
        q: "in:inbox is:unread",
        maxResults: max,
      });
      const list = res.data.messages ?? [];
      const detailed = await fetchMessagesMetadata(gmail, list);
      return toolJson({ messages: detailed });
    }
    case "search_emails": {
      const max = args.max_results ?? 5;
      const res = await gmail.users.messages.list({
        userId: "me",
        q: String(args.query ?? ""),
        maxResults: max,
      });
      const list = res.data.messages ?? [];
      const detailed = await fetchMessagesMetadata(gmail, list, ["From", "Subject", "Date"]);
      return toolJson({ messages: detailed });
    }
    case "summarize_inbox": {
      const recentMax = args.recent_max ?? 10;
      const label = await gmail.users.labels.get({ userId: "me", id: "INBOX" });
      const recent = await gmail.users.messages.list({
        userId: "me",
        q: "in:inbox",
        maxResults: recentMax,
      });
      const list = recent.data.messages ?? [];
      const snippets = await fetchMessagesMetadata(gmail, list, ["From", "Subject", "Date"]);
      return toolJson({
        label: "INBOX",
        messagesTotal: label.data.messagesTotal ?? null,
        messagesUnread: label.data.messagesUnread ?? null,
        threadsUnread: label.data.threadsUnread ?? null,
        recent: snippets,
      });
    }
    case "get_email": {
      const maxChars = args.body_max_chars ?? 8000;
      const meta = await gmail.users.messages.get({
        userId: "me",
        id: String(args.message_id),
        format: "full",
      });
      const headers = meta.data.payload?.headers ?? [];
      let body = extractPlainTextFromPayload(meta.data.payload);
      if (body.length > maxChars) {
        body = `${body.slice(0, maxChars)}…`;
      }
      return toolJson({
        id: meta.data.id,
        threadId: meta.data.threadId,
        snippet: meta.data.snippet ?? "",
        from: getHeader(headers, "From"),
        to: getHeader(headers, "To"),
        subject: getHeader(headers, "Subject"),
        date: getHeader(headers, "Date"),
        body,
      });
    }
    case "create_draft": {
      const raw = encodeRawRfc822({
        to: String(args.to),
        subject: String(args.subject),
        body: String(args.body),
      });
      const requestBody = { message: { raw } };
      if (args.thread_id) {
        requestBody.message.threadId = String(args.thread_id);
      }
      const draft = await gmail.users.drafts.create({ userId: "me", requestBody });
      return toolJson({
        draftId: draft.data.id,
        messageId: draft.data.message?.id,
        threadId: draft.data.message?.threadId,
      });
    }
    case "send_email": {
      const raw = encodeRawRfc822({
        to: String(args.to),
        subject: String(args.subject),
        body: String(args.body),
      });
      const requestBody = { raw };
      if (args.thread_id) {
        requestBody.threadId = String(args.thread_id);
      }
      const sent = await gmail.users.messages.send({ userId: "me", requestBody });
      return toolJson({
        id: sent.data.id,
        threadId: sent.data.threadId,
        labelIds: sent.data.labelIds,
      });
    }
    default:
      return toolError(`Unknown tool: ${name}`);
  }
}

export const GMAIL_TOOL_NAMES = [
  "list_unread",
  "search_emails",
  "summarize_inbox",
  "get_email",
  "create_draft",
  "send_email",
];

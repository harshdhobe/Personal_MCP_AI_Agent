# WhatsApp / Telegram AI Gmail Assistant

A personal assistant that lets you read, search, summarize, and reply to Gmail via natural-language messages on **WhatsApp** or **Telegram**.

## Status

- **Phase 0** — Scaffolding, env validation, health check, webhook route shell
- **Phase 1** — Gmail OAuth, bundled `mcp-gmail` MCP server, `mcpClient.js`
- **Phase 2T** — **Telegram** webhook + long polling (implemented)
- **Phase 3** — **Gemini** agent + Gmail MCP over Telegram (implemented)
- **Phase 2** — WhatsApp webhook + outbound (stub; Meta setup still required)

## Prerequisites

- Node.js 20+
- **Gmail:** [Google Cloud](https://console.cloud.google.com/) (Gmail API + OAuth)
- **Gemini:** [Google AI Studio API key](https://aistudio.google.com/apikey) (free tier)
- **Messaging (pick one or both):**
  - **Telegram (recommended for local dev):** [@BotFather](https://t.me/BotFather)
  - **WhatsApp:** [Meta Developer](https://developers.facebook.com/) (WhatsApp Cloud API)

## Quick start

```bash
cd whatsapp_ai_assistant
npm install
cp .env.example .env
# Edit .env — see Telegram or WhatsApp section below
npm start
```

Health check:

```bash
curl http://localhost:3000/health
# {"status":"ok","channels":["telegram"]}
```

## Telegram setup (easiest path)

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → copy the **bot token**.
2. In `.env`:

```env
MESSAGING_CHANNELS=telegram
TELEGRAM_BOT_TOKEN=123456:ABC...
```

3. Message your bot once in Telegram, then:

```bash
npm run telegram:chat-id
```

4. Set `TELEGRAM_ALLOWED_CHAT_ID` in `.env` to the printed numeric id.

5. **Local dev (no ngrok):** long polling:

```bash
npm run telegram:poll
```

Send e.g. **"What are my unread emails?"** → Gemini will call Gmail tools and reply.

6. **Webhook mode (production):** run `npm start`, expose HTTPS (e.g. ngrok), then:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-host>/telegram/webhook"
```

Optional: add `&secret_token=<TELEGRAM_WEBHOOK_SECRET>` and set the same value in `.env`.

## Deploy on Render (free)

See **[Docs/RENDER_DEPLOY.md](./Docs/RENDER_DEPLOY.md)** for step-by-step hosting with Telegram webhook.

Quick flow: Render Web Service → paste env vars → `npm run telegram:set-webhook -- https://your-app.onrender.com` → stop local poll.

## WhatsApp setup

Set `MESSAGING_CHANNELS=whatsapp` (default) and fill all `WHATSAPP_*` variables. See [Docs/implementationPlan.md](./Docs/implementationPlan.md) Phase 2 for Meta webhook steps. WhatsApp routes remain at `/webhook` (Phase 2 stub until implemented).

## Both channels

```env
MESSAGING_CHANNELS=whatsapp,telegram
```

Provide credentials for each enabled channel.

## Gemini API key (Phase 3)

1. Open [Google AI Studio](https://aistudio.google.com/apikey) → **Create API key**.
2. Add to `.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
```

3. Test without Telegram:

```bash
npm run agent:smoke -- "List my unread emails"
```

## Phase 1 — Gmail OAuth and MCP

1. Enable **Gmail API** and create OAuth **Web application** credentials in Google Cloud.
2. Redirect URI: `http://127.0.0.1:8844/oauth/callback` (see `.env.example`).
3. `npm run gmail-oauth` → paste `GMAIL_REFRESH_TOKEN` into `.env`.
4. `npm run mcp:smoke` — should return real email JSON.

## Environment variables

See [`.env.example`](./.env.example).

| Always required | Gmail + `GEMINI_API_KEY` |
|-----------------|--------------------------|
| If `MESSAGING_CHANNELS` includes `whatsapp` | All `WHATSAPP_*` vars |
| If includes `telegram` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID` |

Default `MESSAGING_CHANNELS=whatsapp` preserves previous behavior.

## Project structure

```
whatsapp_ai_assistant/
├── Docs/
├── mcp-gmail/
├── src/
│   ├── index.js
│   ├── config/env.js
│   ├── routes/
│   │   ├── webhook.js      # WhatsApp (Meta)
│   │   └── telegram.js     # Telegram
│   ├── middleware/
│   │   └── verifyTelegramWebhook.js
│   ├── services/
│   │   ├── telegram.js
│   │   ├── telegramUpdateHandler.js
│   │   └── messageDedupe.js
│   └── integrations/mcpClient.js
├── scripts/
│   ├── gmail-oauth-setup.js
│   ├── mcp-smoke-test.js
│   ├── telegram-get-chat-id.js
│   └── telegram-poll.js
└── package.json
```

## Documentation

| Document | Description |
|----------|-------------|
| [Docs/architecture.md](./Docs/architecture.md) | System design (WhatsApp + Telegram) |
| [Docs/implementationPlan.md](./Docs/implementationPlan.md) | Phased build guide |
| [Docs/edgeCases.md](./Docs/edgeCases.md) | Edge cases and QA |
| [Docs/problem_statement.md](./Docs/problem_statement.md) | Product problem statement |

## Implementation phases

1. **Phase 0** — Scaffolding  
2. **Phase 1** — Gmail OAuth + MCP  
3. **Phase 2T** — Telegram messaging (done)  
4. **Phase 2** — WhatsApp messaging  
5. **Phase 4+** — Confirmation polish, deploy  

## License

MIT

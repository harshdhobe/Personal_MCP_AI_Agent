# Personal MCP AI Agent

**A personal Gmail assistant powered by Google Gemini and MCP-style tools, reachable on Telegram.**

Ask in plain language — *“What are my unread emails?”*, *“Search emails from Alice”*, *“Draft a reply to Bob”* — and get answers in chat. Email **sends** require explicit **YES/NO** confirmation.


|            |                                                                                         |
| ---------- | --------------------------------------------------------------------------------------- |
| **GitHub** | [harshdhobe/Personal_MCP_AI_Agent](https://github.com/harshdhobe/Personal_MCP_AI_Agent) |
|            |                                                                                         |
| **Stack**  | Node.js · Express · Gemini · Gmail API · Telegram · MCP                                 |


> Local folder name is still `whatsapp_ai_assistant/`; the repo and product name is **Personal MCP AI Agent**.

---

## Quick start

### 1. Clone and install

```bash
git clone git@github.com:harshdhobe/Personal_MCP_AI_Agent.git
cd Personal_MCP_AI_Agent   # or whatsapp_ai_assistant if cloned locally
npm install
cp .env.example .env
```

### 2. Gmail (Google Cloud)

1. [Google Cloud Console](https://console.cloud.google.com/) → enable **Gmail API**.
2. OAuth consent screen (Testing) → add your Gmail as test user.
3. Create **OAuth Web client** → redirect URI: `http://127.0.0.1:8844/oauth/callback`.
4. Put client ID/secret in `.env`, then run:

```bash
npm run gmail-oauth
```

Copy the printed `GMAIL_REFRESH_TOKEN` into `.env`.

Verify Gmail tools:

```bash
npm run mcp:smoke
```

### 3. Gemini (Google AI Studio)

1. [Create API key](https://aistudio.google.com/apikey).
2. Add to `.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_FALLBACK_MODELS=gemini-2.5-flash
AGENT_FAST_REPLY=1
GMAIL_INPROCESS=1
```

Test agent without Telegram:

```bash
npm run agent:smoke -- "List my unread emails"
```

### 4. Telegram ([@BotFather](https://t.me/BotFather))

1. `/newbot` → copy **bot token**.
2. In `.env`:

```env
MESSAGING_CHANNELS=telegram
TELEGRAM_BOT_TOKEN=your_token
```

1. Message your bot once, then:

```bash
npm run telegram:chat-id
```

1. Set `TELEGRAM_ALLOWED_CHAT_ID` in `.env` to the printed numeric id.

### 5. Run locally

**Option A — Long polling (easiest on WSL, no ngrok):**

```bash
npm run telegram:poll
```

Message your bot: *“What are my unread emails?”*

**Option B — Webhook (same as production):**

```bash
npm start
curl http://localhost:3000/health
# {"status":"ok","channels":["telegram"]}
```

---

## Deploy to Render (production)

1. Connect repo on [Render](https://render.com) → **Web Service** → free tier.
2. Build: `npm install` · Start: `npm start` · Health: `/health`.
3. Paste **all** `.env` values into Render **Environment** (Render does not use your local `.env`).
4. After deploy:

```bash
npm run telegram:set-webhook -- https://personal-mcp-ai-agent.onrender.com
```

1. Stop local `telegram:poll` if running (use webhook **or** poll, not both).

Full guide: **[Docs/RENDER_DEPLOY.md](./Docs/RENDER_DEPLOY.md)**

---

## Status


| Phase                       | Status       |
| --------------------------- | ------------ |
| Gmail OAuth + MCP tools     | ✅ Done       |
| Telegram (poll + webhook)   | ✅ Done       |
| Gemini agent + tool calling | ✅ Done       |
| Send confirmation (YES/NO)  | 🟡 Code done |
| Render deployment           | ✅ Live       |
| WhatsApp                    | ⏸ Stub only  |


---

## Environment variables

See `[.env.example](./.env.example)`. Minimum for Telegram MVP:


| Variable                                         | Required                         |
| ------------------------------------------------ | -------------------------------- |
| `MESSAGING_CHANNELS=telegram`                    | Yes                              |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID` | Yes                              |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                 | Yes                              |
| `GMAIL_OAUTH_`*, `GMAIL_REFRESH_TOKEN`           | Yes                              |
| `GMAIL_INPROCESS=1`                              | Recommended (WSL + Render)       |
| `AGENT_FAST_REPLY=1`                             | Recommended (fewer Gemini calls) |


---

## Scripts


| Command                                        | Purpose                       |
| ---------------------------------------------- | ----------------------------- |
| `npm start`                                    | Express server (webhook mode) |
| `npm run dev`                                  | Nodemon dev server            |
| `npm run telegram:poll`                        | Local Telegram long polling   |
| `npm run telegram:set-webhook -- https://host` | Register production webhook   |
| `npm run telegram:chat-id`                     | Get your Telegram chat id     |
| `npm run gmail-oauth`                          | One-time Gmail OAuth          |
| `npm run mcp:smoke`                            | Test Gmail tools              |
| `npm run agent:smoke -- "query"`               | Test Gemini + Gmail           |


---

## Project structure

```
Personal_MCP_AI_Agent/
├── Docs/
│   ├── architecture.md
│   ├── RENDER_DEPLOY.md
│   └── ...
├── mcp-gmail/                     ← Gmail MCP tool implementations
├── src/
│   ├── index.js
│   ├── routes/telegram.js
│   ├── services/agent.js          ← Gemini agent loop
│   └── integrations/              ← Gemini, Gmail, MCP pool
├── scripts/
└── render.yaml
```

---

## Documentation


| Document                                                             | Description                                       |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| **[Docs/full-flow-explanation.md](./Docs/full-flow-explanation.md)** | End-to-end build story, challenges, interview Q&A |
| [Docs/architecture.md](./Docs/architecture.md)                       | System design                                     |
| [Docs/implementationPlan.md](./Docs/implementationPlan.md)           | Phased build guide                                |
| [Docs/RENDER_DEPLOY.md](./Docs/RENDER_DEPLOY.md)                     | Render deployment                                 |
| [Docs/GITHUB_SETUP.md](./Docs/GITHUB_SETUP.md)                       | Git + SSH setup                                   |
| [Docs/edgeCases.md](./Docs/edgeCases.md)                             | Edge cases and QA                                 |
| [Docs/problem_statement.md](./Docs/problem_statement.md)             | Product scope                                     |


---

## WhatsApp (optional, not implemented)

WhatsApp routes exist as a stub. To use later, set `MESSAGING_CHANNELS=whatsapp` and Meta Cloud API vars — see [Docs/implementationPlan.md](./Docs/implementationPlan.md) Phase 2.

---

## License

MIT
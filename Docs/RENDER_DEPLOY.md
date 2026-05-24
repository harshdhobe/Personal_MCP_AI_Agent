# Deploy on Render (free tier)

Host the Telegram Gmail assistant with **HTTPS webhook** on [Render](https://render.com).

## Before you start

- GitHub repo pushed: `harshdhobe/Personal_MCP_AI_Agent`
- Local `.env` working (Telegram + Gemini + Gmail OAuth refresh token)
- **Do not** commit `.env`

## 1. Create Render Web Service

1. Sign in at [dashboard.render.com](https://dashboard.render.com) (GitHub login).
2. **New +** → **Web Service**.
3. Connect repo **Personal_MCP_AI_Agent**.
4. Settings:

| Field | Value |
|-------|--------|
| **Name** | `personal-mcp-ai-agent` (or any name) |
| **Region** | Oregon (or nearest) |
| **Branch** | `main` |
| **Root Directory** | leave blank if repo root *is* the app; if the app lives in a subfolder, set `whatsapp_ai_assistant` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

5. **Advanced** → **Health Check Path**: `/health`

> If your GitHub repo root is `AI Project - Portfolio` and the app is in `whatsapp_ai_assistant/`, set **Root Directory** to `whatsapp_ai_assistant`.

## 2. Environment variables

In Render → your service → **Environment**, add (copy from local `.env`):

| Key | Required | Notes |
|-----|----------|--------|
| `MESSAGING_CHANNELS` | Yes | `telegram` |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `TELEGRAM_ALLOWED_CHAT_ID` | Yes | Your numeric chat id |
| `TELEGRAM_WEBHOOK_SECRET` | Recommended | Random string (e.g. `openssl rand -hex 16`) |
| `GEMINI_API_KEY` | Yes | Paste from [AI Studio](https://aistudio.google.com/apikey) — **no quotes**, no spaces |
| `GEMINI_MODEL` | Yes | `gemini-2.5-flash-lite` (avoid `2.0-flash`) |
| `GEMINI_FALLBACK_MODELS` | Optional | `gemini-2.5-flash,gemini-1.5-flash` |
| `GMAIL_OAUTH_CLIENT_ID` | Yes | |
| `GMAIL_OAUTH_CLIENT_SECRET` | Yes | |
| `GMAIL_OAUTH_REDIRECT_URI` | Yes | Keep your local OAuth URI (refresh token already issued) |
| `GMAIL_REFRESH_TOKEN` | Yes | From `npm run gmail-oauth` |
| `GMAIL_INPROCESS` | Yes | `1` (fast Gmail on Linux) |
| `AGENT_FAST_REPLY` | Optional | `1` (faster replies) |
| `GMAIL_MAX_RESULTS` | Optional | `3` |

**Do not set `PORT`** — Render injects it automatically.

Mark secrets as **Secret** in the dashboard.

## 3. Deploy

Click **Create Web Service** (or **Manual Deploy** → Deploy latest commit).

Wait until status is **Live**. Note your URL:

```text
https://personal-mcp-ai-agent.onrender.com
```

Test:

```bash
curl https://YOUR-APP.onrender.com/health
# {"status":"ok","channels":["telegram"]}
```

## 4. Register Telegram webhook

From your laptop (WSL), with the same `.env`:

```bash
cd whatsapp_ai_assistant
npm run telegram:set-webhook -- https://YOUR-APP.onrender.com
```

Or manually:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR-APP.onrender.com/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## 5. Stop local polling

If `npm run telegram:poll` is running, **Ctrl+C** it. Only webhook **or** poll should be active.

## 6. Test in Telegram

Message your bot: **"What are my unread emails?"**

Check Render **Logs** for lines like `[agent] session=telegram:... durationMs=...`.

---

## Free tier limitations

| Limit | What it means |
|-------|----------------|
| **Spin down** | After ~15 min idle, service sleeps. First message may take **30–60s** to wake. |
| **750 hrs/month** | Enough for one personal bot. |
| **Cold start** | Telegram may retry; second message is usually fast. |

To avoid sleep: upgrade to Render **Starter ($7/mo)** or ping `/health` every 10 min (external cron — optional).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Deploy fails: missing env | Add all required vars in Render Environment |
| `503 Telegram not configured` | `MESSAGING_CHANNELS=telegram` + token vars |
| Webhook 403 | `TELEGRAM_WEBHOOK_SECRET` must match in Render and `setWebhook` |
| Bot silent after deploy | Run `telegram:set-webhook`; stop local poll |
| `AI service error` / Gemini fails | Render **Environment** → set `GEMINI_API_KEY` + `GEMINI_MODEL=gemini-2.5-flash-lite` → **Manual Deploy** |
| Gemini rate limit | Wait 30s; use `flash-lite`; check Render Logs for real error |
| Gmail 401 | Re-run `npm run gmail-oauth` locally; update `GMAIL_REFRESH_TOKEN` on Render |
| Slow first reply | Free tier cold start — wait and retry |

---

## Optional: Blueprint deploy

Repo includes `render.yaml`. In Render: **New +** → **Blueprint** → select repo → fill secret env vars when prompted.

---

## Rollback

Render → **Deploys** → select previous deploy → **Rollback**.

Re-run `telegram:set-webhook` if the public URL changed.

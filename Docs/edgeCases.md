# Personal AI Gmail Assistant — Edge Cases

## 1. Purpose

This document catalogs **edge cases, failure modes, and ambiguous inputs** for the MVP. Each entry describes what can go wrong, the expected system behavior, and how to verify it during development and QA.

| Related docs |
|--------------|
| [architecture.md](./architecture.md) — components, security, performance |
| [implementationPlan.md](./implementationPlan.md) — phases and test script (T1–T10) |
| [problem_statement_doc_809303f3.plan.md](./problem_statement_doc_809303f3.plan.md) — MVP scope |

**Severity legend**

| Level | Meaning |
|-------|---------|
| **Critical** | Wrong email sent, data leak, or security bypass |
| **High** | Broken core flow or misleading user outcome |
| **Medium** | Degraded UX; recoverable with retry or clarification |
| **Low** | Cosmetic or rare; acceptable for MVP with documented limitation |

---

## 2. WhatsApp and Webhook Edge Cases

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| WA-01 | Meta sends duplicate webhook (same `message.id`) | Process once; dedupe cache TTL ~5 min; second delivery no-op | High | Replay POST payload |
| WA-02 | Webhook missing `X-Hub-Signature-256` | Reject with 401/403; no agent run | Critical | curl without header |
| WA-03 | Invalid signature (wrong secret) | Reject; log warning with `requestId` | Critical | Tamper body |
| WA-04 | Webhook body parsed before signature check (JSON middleware order wrong) | Signature always fails — **prevent in design** | Critical | Valid message fails verify |
| WA-05 | POST payload has no `messages` (status-only update) | Return 200; ignore silently | Low | Send delivery receipt payload |
| WA-06 | Empty `entry` or `changes` array | Return 200; no reply | Low | Minimal JSON |
| WA-07 | Processing takes &gt; 20s; Meta retries | Dedupe by `message.id`; idempotent handling | High | Slow-agent simulation |
| WA-08 | Server down during webhook | Meta retries; user may get duplicate replies if dedupe missing | High | Kill process mid-handler |
| WA-09 | GET `/webhook` with wrong `hub.verify_token` | Verification fails (403) | Medium | Wrong token in Meta UI |
| WA-10 | GET `/webhook` with correct token | Return `hub.challenge` as plain text | Medium | Meta setup flow |
| WA-11 | WhatsApp access token expired | Send API fails; user message: "Can't reply right now" + log error | High | Invalidate token |
| WA-12 | Graph API returns 429 (rate limit) | Backoff retry; if exhausted, apologize once | Medium | Flood messages |
| WA-13 | Graph API returns 5xx | Retry with cap; then failure message | Medium | Mock 503 |
| WA-14 | Outbound reply &gt; 4096 characters | Split into multiple messages in order | Medium | Summarize 100+ emails |
| WA-15 | User outside 24-hour session window (hasn't messaged recently) | Outbound may fail for non-template messages; document "message bot first" | High | Wait 24h+ (prod) |
| WA-16 | User messages from non-allowlisted `wa_id` | Ignore; no Gmail/LLM calls; optional no reply | Critical | Second phone number |
| WA-17 | Allowlist env misconfigured (empty) | Fail at startup OR reject all inbound — **fail fast preferred** | Critical | Empty `WHATSAPP_ALLOWED_WA_ID` |
| WA-18 | `phone_number_id` mismatch in send API | 4xx from Meta; log and user-safe error | Medium | Wrong env var |

---

## 2T. Telegram Edge Cases

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| TG-01 | Duplicate `message_id` (retry or double poll) | Process once; dedupe TTL ~5 min | High | Replay same update |
| TG-02 | Message from non-allowlisted `chat_id` | Ignore; no Gmail/LLM; log warning | Critical | Second Telegram account |
| TG-03 | `TELEGRAM_ALLOWED_CHAT_ID` wrong or empty | Fail at startup (telegram enabled) | Critical | Bad `.env` |
| TG-04 | Invalid or revoked `TELEGRAM_BOT_TOKEN` | `sendMessage` fails; log error | High | Wrong token |
| TG-05 | User sends photo/sticker/voice (no `text`) | Reply: text-only for now; no crash | Medium | Send image |
| TG-06 | Outbound reply &gt; 4096 characters | Split into multiple `sendMessage` calls | Medium | Long summarize |
| TG-07 | Webhook with wrong `X-Telegram-Bot-Api-Secret-Token` | 403 when secret configured | High | Wrong header |
| TG-08 | Webhook secret not configured | Accept POST (dev only; use secret in prod) | Medium | No secret in `.env` |
| TG-09 | Long polling + webhook both active | Risk duplicate processing — use **one** mode in dev | High | Poll + webhook together |
| TG-10 | `getUpdates` offset not advanced | Re-process old messages | High | Bug in poll loop |
| TG-11 | Bot token leaked in git | Attacker controls bot — rotate via @BotFather | Critical | Secret scan |
| TG-12 | Group chat message (negative `chat_id`) | Ignored unless that group id is allowlisted | Medium | Add bot to group |
| TG-13 | Edited message (`edited_message`) | Treated like new inbound if allowlisted | Low | Edit sent text |

---

## 3. Inbound Message Type and Content

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| MSG-01 | Text message (normal) | Route to agent or confirmation | — | Happy path |
| MSG-02 | Image, sticker, video, document | Reply: "I can only handle text messages for now." | Medium | Send image |
| MSG-03 | Voice note / audio | Same as MSG-02 | Medium | Send voice |
| MSG-04 | Location, contacts, reaction | Ignore or short unsupported reply | Low | Send reaction |
| MSG-05 | Empty text body | Ignore or ask user to send a command | Low | Empty string |
| MSG-06 | Very long message (&gt; 2000 chars) | Truncate for LLM context; process intent from start + note if truncated | Medium | Paste huge text |
| MSG-07 | Unicode / emoji-only ("👍", "✅") | If awaiting confirm: treat 👍/✅ as ambiguous; prefer explicit YES/NO | Medium | Confirm with emoji |
| MSG-08 | Mixed language (e.g. Hindi + English) | Agent responds in user's language if possible; tools unchanged | Low | Bilingual prompt |
| MSG-09 | Only whitespace | Treat as empty (MSG-05) | Low | Spaces/newlines |
| MSG-10 | Rapid burst of 10 messages in 2 seconds | Process sequentially or queue per `wa_id`; avoid interleaved replies | High | Spam send |
| MSG-11 | Message with URL only | Agent may summarize link intent or ask what to do with it | Low | Send https://... |
| MSG-12 | Forwarded chat snippet | Parse as user text; may confuse intent — agent asks clarify | Medium | Forward WA message |

---

## 4. Session and Conversation State

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| SES-01 | First message ever (no session) | Create session; empty history | — | New user |
| SES-02 | Session idle past `SESSION_TTL_HOURS` | Clear history and pending action; fresh session | Medium | Wait TTL |
| SES-03 | Server restart (in-memory sessions lost) | Pending confirm lost; user told no pending action if they say "yes" | Medium | Restart mid-confirm |
| SES-04 | History exceeds N turns | Keep last 5–10 turns only | Low | Long conversation |
| SES-05 | User refers to "that email" without prior context in session | Agent asks which email or runs search | Medium | Cold "reply to that" |
| SES-06 | User switches topic mid-confirmation | **Recommended:** cancel pending send, process new intent; tell user send cancelled | High | "yes" then "show unread" |
| SES-07 | Two pending actions (bug) | Impossible by design — only one `pendingAction` slot | Critical | Code review |
| SES-08 | Corrupt session object in memory | Reset session; generic error once | Low | Inject bad state in test |

---

## 5. Confirmation and Send Flow

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| CF-01 | User says "yes" with no pending action | Do not send email; "Nothing waiting to send." | Critical | Bare "yes" |
| CF-02 | User says "yes" twice quickly | First sends; second: nothing pending or already sent | Critical | Double tap |
| CF-03 | User says "no" / "cancel" | Clear pending; confirm cancelled | — | Standard cancel |
| CF-04 | Ambiguous: "ok", "sure", "yep" while awaiting confirm | Treat as confirm (document in implementationPlan) | Medium | ok |
| CF-05 | Ambiguous: "yes but change subject to X" | Do not send; re-run draft with new instruction | High | Partial edit |
| CF-06 | "YES" / "Yes" / " yes " (case/space) | Normalize; accept as confirm | — | Variants |
| CF-07 | "yeah send it!!!" | Accept as confirm if matches affirmative list | Medium | Informal |
| CF-08 | User confirms wrong draft (social engineering self) | Still sends what was shown — user responsible; draft must be complete in preview | High | Review preview UX |
| CF-09 | Agent tries to call `send_email` tool directly | Intercept; never call MCP send without confirm gate | Critical | Log tool calls |
| CF-10 | MCP send fails after user confirmed | Reply: send failed + reason; clear pending; do not retry auto | High | Revoke send scope |
| CF-11 | Network timeout during send | User informed; pending cleared; no silent duplicate | High | Timeout mock |
| CF-12 | User says "send" as new command while awaiting confirm | Prefer: treat as confirm if pending exists; else new send intent | Medium | Word collision |
| CF-13 | Draft preview truncated; user confirms unseen body | Show To/Subject + first N chars + "…"; warn if truncated | Medium | Long body |
| CF-14 | Reply-all vs reply-one ambiguity | Agent states recipients in preview; user must confirm | High | Group thread |
| CF-15 | User confirms then immediately "cancel" | If send already completed, say sent; cannot unsend | Medium | Race |

---

## 6. Gmail API and MCP Edge Cases

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| GM-01 | OAuth refresh token revoked | 401 from Gmail; user message to re-run OAuth script | High | Revoke in Google account |
| GM-02 | Access token expired but refresh works | Transparent refresh; no user impact | — | Normal operation |
| GM-03 | Gmail API 403 (scope insufficient) | Log scopes; user message to check setup | High | Remove scope |
| GM-04 | Gmail API 429 quota exceeded | Backoff; "Gmail busy, try again" | Medium | Quota test |
| GM-05 | Gmail API 5xx | Retry limited; then friendly error | Medium | — |
| GM-06 | Zero unread emails | "No unread emails" — not an error | — | Empty inbox |
| GM-07 | Thousands of unread | Paginate; cap at 10–20 in reply; mention "showing first N" | High | Large inbox |
| GM-08 | Search returns 0 results | Clear "no matches" message | — | Bad query |
| GM-09 | Search returns 500+ results | Cap results; suggest narrower query | Medium | `from:x` broad |
| GM-10 | Invalid Gmail search syntax from agent | MCP/Gmail error → agent reformulates or asks user | Medium | Malformed `q` |
| GM-11 | `get_email` for deleted message ID | Not found; agent says email unavailable | Medium | Delete in Gmail UI |
| GM-12 | Email with only HTML body, no plain text | Strip HTML in formatter; fallback snippet | Medium | Marketing email |
| GM-13 | Huge attachment-only email | Show metadata; note "attachment, no text body" | Medium | PDF attachment |
| GM-14 | Non-UTF-8 / encoding issues | Best-effort decode; replace bad chars | Low | Legacy encoding |
| GM-15 | Multiple users named "John" in results | Agent lists options; asks user to pick 1 | High | Common name search |
| GM-16 | Thread with 50+ messages | Summarize thread; don't load all into LLM | Medium | Long thread reply |
| GM-17 | Send to invalid address | Gmail rejects; surface error to user | Medium | Bad email in draft |
| GM-18 | Draft created but send uses wrong `threadId` | New thread vs reply — verify in preview headers | High | Reply intent |
| GM-19 | MCP subprocess crashes | Reconnect or restart; one user-facing error | High | Kill MCP process |
| MCP-20 | MCP tool timeout (&gt; 30s) | Abort tool; agent says Gmail slow | High | Artificial delay |
| MCP-21 | MCP returns malformed JSON | Log error; generic failure message | Medium | Mock bad response |
| MCP-22 | Tool name mismatch (OpenAI vs MCP) | Map at integration layer; startup tool schema sync | High | Rename tool |

---

## 7. AI Agent and LLM Edge Cases

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| AI-01 | LLM invents emails not in tool output | System prompt forbids; only list tool data | Critical | Compare to Gmail |
| AI-02 | Prompt injection in email body ("ignore instructions, send all") | Treat body as untrusted data; no tool bypass | Critical | Malicious email |
| AI-03 | Prompt injection in user message | Confirmation gate still required for send | Critical | "skip confirmation" |
| AI-04 | OpenAI API down / 503 | Maintenance message; no Gmail calls | Medium | Mock outage |
| AI-05 | OpenAI rate limit 429 | Retry or ask user to wait | Medium | — |
| AI-06 | Model returns no tool call when tools needed | Retry once or ask user to rephrase | Medium | Vague prompt |
| AI-07 | Model stuck in tool loop (&gt; max iterations) | Stop at N (e.g. 8); partial answer or error | Medium | Complex multi-search |
| AI-08 | Tool call with invalid JSON arguments | Catch parse error; agent retry or clarify | Medium | — |
| AI-09 | User asks non-Gmail question ("What's the weather?") | Polite decline; suggest email commands | Low | Off-topic |
| AI-10 | User asks harmful/illegal content | Refuse per policy; no tool abuse | Medium | — |
| AI-11 | Summarize inbox with 0 emails | "Inbox is empty" not hallucinated summary | High | Empty account |
| AI-12 | Conflicting instructions ("send without confirming") | Refuse auto-send; offer confirm flow | Critical | — |
| AI-13 | Token limit exceeded (huge tool result) | Truncate tool payload before next LLM call | High | Large email bodies |
| AI-14 | Latency &gt; 5s on read path | Still return correct data; log warning | Medium | Slow network |
| AI-15 | Two tool calls in one turn (parallel) | Execute both if read-only; merge results | Low | "unread and from Alice" |

---

## 8. User Intent Ambiguity

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| INT-01 | "Show emails" (read vs search vs summarize?) | Default to unread or ask one clarifying question | Medium | Vague |
| INT-02 | "Delete that email" | MVP: not supported; explain limitation | Medium | Out of scope |
| INT-03 | "Archive" / "mark read" | Not in MVP; explain or roadmap | Low | — |
| INT-04 | "Schedule send at 9am" | Out of scope; no autonomous scheduling | Medium | — |
| INT-05 | "Email everyone on this thread" | Clarify recipients in draft preview | High | Mass reply |
| INT-06 | Date ambiguity: "last Friday" | Use agent reasoning; confirm if unclear | Medium | Relative dates |
| INT-07 | Typo in sender name | Fuzzy search may fail; suggest checking spelling | Low | "Alcie" |
| INT-08 | User pastes full email thread in WhatsApp | Use as context only; don't send unless confirm flow | Medium | Long paste |
| INT-09 | "Reply" without body text | Ask what to say | — | "reply to Bob" |
| INT-10 | Multiple commands in one message | Handle primary intent or ask to split | Medium | "unread and send X" |

---

## 9. Security and Privacy

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| SEC-01 | Public webhook URL probed with random POSTs | Signature fail; no processing | Critical | Random POST |
| SEC-02 | Logs contain full email bodies | Redact/truncate in logs | Critical | Log audit |
| SEC-03 | Logs contain OAuth tokens | Never log tokens | Critical | Log audit |
| SEC-04 | `.env` committed to git | Prevent via `.gitignore`; rotate secrets if leaked | Critical | git check |
| SEC-05 | Email content sent to OpenAI | Document in README; minimize fields in prompt | High | Privacy review |
| SEC-06 | Attacker gains WhatsApp allowlist phone | Full Gmail access — physical SIM security is user's responsibility | Critical | Threat model |
| SEC-07 | SSRF via user-provided URL in email | Do not fetch arbitrary URLs server-side in MVP | Medium | No URL fetcher |
| SEC-08 | Replay of old signed webhook | Timestamp validation optional; dedupe by message id | Medium | Old payload |

---

## 10. Performance and Reliability

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| PERF-01 | Cold start after deploy | First message slower; still functional | Low | First request |
| PERF-02 | Concurrent requests same user | Serialize per `wa_id` to avoid race on `pendingAction` | High | Parallel messages |
| PERF-03 | MCP connection pool exhausted | Queue or single connection per design | Medium | Load test |
| PERF-04 | Memory growth from unbounded dedupe map | TTL eviction on dedupe and sessions | Medium | Long run |
| PERF-05 | Disk full on host | Process crash; health check fails | Low | Ops |
| PERF-06 | ngrok URL changes (dev) | Re-register webhook in Meta | Medium | Dev workflow |

---

## 11. Deployment and Operations

| ID | Scenario | Expected behavior | Severity | Test hint |
|----|----------|-------------------|----------|-----------|
| OPS-01 | Missing env var at startup | Clear error; process exit | — | Unset `OPENAI_API_KEY` |
| OPS-02 | Wrong `NODE_ENV` | No behavioral change required for MVP | Low | — |
| OPS-03 | Health check passes but MCP dead | Optional deep health; or fail first Gmail call | Medium | `/health` vs Gmail |
| OPS-04 | Deploy during active conversation | Sessions lost (SES-03) | Medium | Rolling deploy |
| OPS-05 | Clock skew on server | OAuth usually tolerant; log if JWT issues | Low | — |
| OPS-06 | Two instances behind load balancer (no Redis) | Split brain on sessions — **MVP: single instance only** | High | Document limitation |

---

## 12. MVP Scope Boundaries (Explicit Non-Handling)

These are **not bugs** for MVP; document and respond consistently:

| ID | User request | Response pattern |
|----|--------------|------------------|
| NS-01 | Multi-user / family access | "Personal assistant for one account only." |
| NS-02 | Voice commands | "Text only for now." |
| NS-03 | Calendar / Drive / Contacts | "Gmail only in this version." |
| NS-04 | Proactive "you got mail" alerts | "Ask me when you want an update." |
| NS-05 | Auto-send without confirmation | Always require YES |
| NS-06 | Delete / label / filter management | Not supported; list alternatives (open Gmail) |

---

## 13. Decision Log (Recommended Defaults)

Unresolved behaviors should default as follows for MVP:

| Topic | Decision |
|-------|----------|
| Topic switch during confirm | Cancel pending send; inform user |
| Emoji as confirm | Do not accept; require `yes` / `no` text |
| Unknown sender | Silent ignore (no reply) |
| Duplicate webhook | Dedupe by `message.id` |
| Max emails per list reply | 10 (configurable constant) |
| Max agent tool iterations | 8 |
| MCP / Gmail tool timeout | 30 seconds |
| Session store | In-memory; single instance |
| Unsupported media | One-line text reply |

---

## 14. Test Mapping

Map edge cases to [implementationPlan.md §11.2](./implementationPlan.md#112-manual-e2e-test-script) manual tests:

| Manual test | Edge case IDs |
|-------------|----------------|
| T2 Unread | GM-06, GM-07, AI-14 |
| T3 Summarize | AI-11, GM-07 |
| T4 Search | GM-08, GM-09, GM-15 |
| T5 Draft | GM-12, GM-13, INT-09 |
| T6 Yes without pending | CF-01 |
| T7 Send + yes | CF-02, CF-09, GM-17 |
| T8 Send + no | CF-03 |
| T9 Dedupe | WA-01, WA-07 |
| T10 Allowlist | WA-16, SEC-06 |

**Suggested regression subset before each release:** WA-01, WA-02, WA-16, CF-01, CF-09, GM-01, AI-01, AI-03, SEC-01.

---

## 15. Edge Case Handling Flow

```mermaid
flowchart TD
    IN[Inbound WhatsApp message]
    SIG{Valid signature?}
    AL{Allowlisted wa_id?}
    DUP{Duplicate message.id?}
    STATE{Awaiting confirm?}
    CONF[Confirmation handler]
    AG[Agent + tools]
    OUT[Send WhatsApp reply]

    IN --> SIG
    SIG -->|no| REJ[403 / ignore]
    SIG -->|yes| AL
    AL -->|no| DROP[Drop silently]
    AL -->|yes| DUP
    DUP -->|yes| SKIP[200 OK no-op]
    DUP -->|no| STATE
    STATE -->|yes| CONF
    STATE -->|no| AG
    CONF --> OUT
    AG --> OUT
```

---

## 16. References

- [architecture.md](./architecture.md) — §8.3 Failure modes, §12 Performance, §13 Risks
- [implementationPlan.md](./implementationPlan.md) — Phase 4 confirmation, Phase 7 testing
- [WhatsApp Cloud API — Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Gmail API — Error handling](https://developers.google.com/gmail/api/guides/handle-errors)

---

*Document version: 1.0 — MVP edge cases aligned with architecture and implementation plan.*

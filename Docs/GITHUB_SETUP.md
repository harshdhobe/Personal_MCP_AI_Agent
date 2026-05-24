# GitHub push setup (fix 403)

## What the error means

```text
Permission to harshdhobe/Personal_MCP_AI_Agent.git denied to harshdhobe
403
```

Your **local commit is fine**. GitHub rejected **authentication** over HTTPS (wrong password, bad token, or cached credentials).

GitHub does **not** accept your account password for `git push`. Use **SSH** (recommended) or a **Personal Access Token**.

---

## Fix A — SSH (recommended, one-time)

Run in **WSL** from the project folder:

```bash
cd "/mnt/d/AI Project - Portfolio/whatsapp_ai_assistant"
bash scripts/github-setup-ssh.sh
```

The script will:

1. Create `~/.ssh/id_ed25519_github`
2. Print your **public key**
3. You add it at https://github.com/settings/ssh/new
4. Press Enter → test SSH → push to `main`

**Do not run `git remote add origin` again** if you see `remote origin already exists`. The script uses `git remote set-url` instead.

---

## Fix B — HTTPS + Personal Access Token

1. Create token: https://github.com/settings/tokens → **Generate new token (classic)** → scope **`repo`**
2. Copy token (`ghp_...`)
3. Clear old credentials:

```bash
git credential reject <<EOF
protocol=https
host=github.com
EOF
```

4. Push:

```bash
git remote set-url origin https://github.com/harshdhobe/Personal_MCP_AI_Agent.git
git push -u origin main
```

| Prompt     | Value        |
|-----------|--------------|
| Username  | `harshdhobe` |
| Password  | `ghp_...` token (not GitHub password) |

---

## Verify success

Open: https://github.com/harshdhobe/Personal_MCP_AI_Agent

You should see `src/`, `README.md`, `.env.example` — **no** `.env` file.

---

## If it still fails

| Check | Action |
|-------|--------|
| Repo exists | Create **Personal_MCP_AI_Agent** under account **harshdhobe** |
| Username spelling | `harshdhobe` (not `hrshdhobe`) |
| Private repo | Token needs `repo` scope; SSH key must be added to same account |
| Wrong GitHub account | Log out of other accounts in browser |

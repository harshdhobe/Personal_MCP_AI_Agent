#!/usr/bin/env bash
# One-time GitHub SSH setup for pushing (fixes HTTPS 403 / wrong password issues).
# Run in WSL from project root: bash scripts/github-setup-ssh.sh

set -euo pipefail

REPO="git@github.com:harshdhobe/Personal_MCP_AI_Agent.git"
KEY="$HOME/.ssh/id_ed25519_github"
EMAIL="${GIT_EMAIL:-harshdhobe@users.noreply.github.com}"

cd "$(dirname "$0")/.."

echo "==> Project: $(pwd)"
echo "==> Remote will be: $REPO"
echo ""

if ! command -v ssh-keygen >/dev/null 2>&1; then
  echo "Install openssh-client: sudo apt update && sudo apt install -y openssh-client"
  exit 1
fi

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [[ ! -f "$KEY" ]]; then
  echo "==> Creating SSH key: $KEY"
  ssh-keygen -t ed25519 -C "$EMAIL" -f "$KEY" -N ""
else
  echo "==> SSH key already exists: $KEY"
fi

# GitHub SSH config
CFG="$HOME/.ssh/config"
if ! grep -q "Host github.com" "$CFG" 2>/dev/null; then
  cat >> "$CFG" <<EOF

Host github.com
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
EOF
  chmod 600 "$CFG"
  echo "==> Updated ~/.ssh/config"
fi

eval "$(ssh-agent -s)" >/dev/null
ssh-add "$KEY" 2>/dev/null || true

echo ""
echo "========== ACTION REQUIRED (one time) =========="
echo "1. Copy this ENTIRE public key (one line):"
echo ""
cat "${KEY}.pub"
echo ""
echo "2. Open: https://github.com/settings/ssh/new"
echo "   Title: WSL laptop"
echo "   Key type: Authentication Key"
echo "   Paste the key → Add SSH key"
echo ""
echo "3. After adding, press ENTER here to test and push..."
read -r _

echo "==> Testing SSH to GitHub..."
ssh -T git@github.com || true

echo "==> Setting git remote origin"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO"
else
  git remote add origin "$REPO"
fi
git remote -v

echo "==> Pushing main..."
git push -u origin main

echo ""
echo "Done. Verify: https://github.com/harshdhobe/Personal_MCP_AI_Agent"

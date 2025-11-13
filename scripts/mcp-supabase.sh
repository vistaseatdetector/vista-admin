#!/usr/bin/env bash
set -euo pipefail

# Launch Supabase MCP server for Codex/VS Code.
# Sources SUPABASE_ACCESS_TOKEN from env or local files without echoing secrets.

HERE_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE_DIR/.." && pwd)"

PROJECT_REF="xljdgflaugskejcphjds"
BIN_LOCAL="$REPO_ROOT/node_modules/.bin/mcp-server-supabase"

export PATH="$REPO_ROOT/node_modules/.bin:$PATH"

# 1) Use existing env if present
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  # 2) Try .env.mcp.local
  if [[ -f "$REPO_ROOT/.env.mcp.local" ]]; then
    # shellcheck disable=SC1090
    source "$REPO_ROOT/.env.mcp.local"
  fi
fi

# 3) Try generic .env.local files (if they have SUPABASE_ACCESS_TOKEN)
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  for f in "$REPO_ROOT/.env.local" "$REPO_ROOT/public/.env.local"; do
    if [[ -f "$f" ]]; then
      TOK_LINE=$(grep -E '^SUPABASE_ACCESS_TOKEN=' "$f" || true)
      if [[ -n "$TOK_LINE" ]]; then
        export SUPABASE_ACCESS_TOKEN="${TOK_LINE#SUPABASE_ACCESS_TOKEN=}"
        break
      fi
    fi
  done
fi

# 4) Try a token file in repo root
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]] && [[ -f "$REPO_ROOT/.supabase_access_token" ]]; then
  export SUPABASE_ACCESS_TOKEN="$(tr -d '\n\r' < "$REPO_ROOT/.supabase_access_token")"
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Error: SUPABASE_ACCESS_TOKEN not found."
  echo "Set it in the environment, create $REPO_ROOT/.env.mcp.local with SUPABASE_ACCESS_TOKEN=...,"
  echo "or write the token to $REPO_ROOT/.supabase_access_token."
  exit 1
fi

# Prefer local install; fall back to npx
if command -v "$BIN_LOCAL" >/dev/null 2>&1; then
  exec "$BIN_LOCAL" --read-only --project-ref="$PROJECT_REF"
else
  exec npx -y @supabase/mcp-server-supabase@0.5.5 --read-only --project-ref="$PROJECT_REF"
fi


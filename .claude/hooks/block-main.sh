#!/usr/bin/env bash
# block-main.sh
# Fires: PreToolUse on Edit|MultiEdit|Write|Bash

set -euo pipefail
source "$(dirname "$0")/_python.sh"

INPUT=$(cat)

if command -v jq &>/dev/null; then
  TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
else
  TOOL_NAME=$(echo "$INPUT" | $PY -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name','unknown'))" 2>/dev/null || echo "unknown")
  COMMAND=$(echo "$INPUT" | $PY -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CURRENT_BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "")

if [[ -z "$CURRENT_BRANCH" ]]; then exit 0; fi

deny() {
  $PY -c "
import json, sys
print(json.dumps({
  'hookSpecificOutput': {
    'permissionDecision': 'deny',
    'permissionDecisionReason': sys.argv[1]
  }
}))
" "$1" >&2
  exit 2
}

case "$TOOL_NAME" in
  Edit|MultiEdit|Write)
    if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
      deny "BLOCKED: On main branch. Create a feature branch first: git checkout -b feat/your-feature-name"
    fi
    ;;
  Bash)
    if echo "$COMMAND" | grep -qE 'git push.*(origin[[:space:]]+)?(main|master)'; then
      deny "BLOCKED: Direct push to main is not allowed. Open a pull request instead."
    fi
    if echo "$COMMAND" | grep -qE 'git push.*(--force|-f)([[:space:]]|$)'; then
      deny "BLOCKED: Force push is never allowed."
    fi
    ;;
esac

exit 0

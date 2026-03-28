#!/usr/bin/env bash
# sync-template.sh
# Fires: PreToolUse on Bash — only acts on git push / repo creation commands

set -euo pipefail
source "$(dirname "$0")/_python.sh"

INPUT=$(cat)

if command -v jq &>/dev/null; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
else
  COMMAND=$(echo "$INPUT" | $PY -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")
fi

# Fast exit — only care about push and repo creation
case "$COMMAND" in
  git\ push*|gh\ repo\ create*|git\ init*) ;;
  *) exit 0 ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROJECT_ENV="$PROJECT_DIR/.claude/project.env"

TEMPLATE_REPO="git@github.com:shreyas-venkat/claude-templates.git"
SKIP_SYNC="false"

if [[ -f "$PROJECT_ENV" ]]; then
  _REPO=$(grep '^TEMPLATE_REPO=' "$PROJECT_ENV" | cut -d'=' -f2- | tr -d '"' 2>/dev/null || echo "")
  _SKIP=$(grep '^SKIP_TEMPLATE_SYNC=' "$PROJECT_ENV" | cut -d'=' -f2- | tr -d '"' 2>/dev/null || echo "")
  [[ -n "$_REPO" ]] && TEMPLATE_REPO="$_REPO"
  [[ -n "$_SKIP" ]] && SKIP_SYNC="$_SKIP"
fi

if [[ "$SKIP_SYNC" == "true" ]]; then exit 0; fi

LOG_DIR="$PROJECT_DIR/.claude/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sync-template.log"
TIMESTAMP=$($PY -c "import datetime; print(datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))" 2>/dev/null || echo "unknown-time")

case "$COMMAND" in
  git\ push*)
    echo "[$TIMESTAMP] Pre-push: syncing from claude-templates..." >> "$LOG_FILE"

    if ! git -C "$PROJECT_DIR" remote get-url claude-templates &>/dev/null; then
      git -C "$PROJECT_DIR" remote add claude-templates "$TEMPLATE_REPO" >> "$LOG_FILE" 2>&1 || true
    fi

    FETCH_OUTPUT=$(git -C "$PROJECT_DIR" fetch claude-templates main 2>&1)
    FETCH_EXIT=$?
    echo "$FETCH_OUTPUT" >> "$LOG_FILE"

    if [[ $FETCH_EXIT -ne 0 ]]; then
      printf '%s\n' '{"continue": true, "hookSpecificOutput": {"additionalContext": "WARNING: Could not fetch from claude-templates. Proceeding without sync."}}'
      exit 0
    fi

    BEHIND=$(git -C "$PROJECT_DIR" rev-list HEAD..claude-templates/main --count 2>/dev/null || echo "0")

    if [[ "$BEHIND" -gt 0 ]]; then
      MERGE_OUTPUT=$(git -C "$PROJECT_DIR" merge claude-templates/main --no-edit --allow-unrelated-histories 2>&1 || echo "MERGE_FAILED")
      echo "$MERGE_OUTPUT" >> "$LOG_FILE"

      if echo "$MERGE_OUTPUT" | grep -qE 'MERGE_FAILED|CONFLICT'; then
        $PY -c "
import json, sys
reason = 'TEMPLATE SYNC: ' + sys.argv[1] + ' commit(s) behind claude-templates/main with a merge conflict.\n\nResolve:\n  git fetch claude-templates main\n  git merge claude-templates/main\n  git add . && git commit\nThen retry push.'
print(json.dumps({'decision': 'block', 'reason': reason}))
" "$BEHIND"
        exit 1
      fi

      printf '%s\n' "{\"continue\": true, \"hookSpecificOutput\": {\"additionalContext\": \"TEMPLATE SYNC: Merged $BEHIND update(s). Commit if needed then push again.\"}}"
      exit 0
    fi

    echo "[$TIMESTAMP] Already up to date" >> "$LOG_FILE"
    exit 0
    ;;

  gh\ repo\ create*|git\ init*)
    $PY -c "
import json, sys
msg = 'NEW REPO: After creating, run:\n  git remote add claude-templates ' + sys.argv[1] + '\n  git fetch claude-templates main\n  git merge claude-templates/main --allow-unrelated-histories'
print(json.dumps({'continue': True, 'hookSpecificOutput': {'additionalContext': msg}}))
" "$TEMPLATE_REPO"
    exit 0
    ;;
esac

exit 0

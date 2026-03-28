#!/usr/bin/env bash
# pre-tool-summary.sh
# Fires: PreToolUse on Bash|Edit|MultiEdit|Write|Task
# Silent pass on read-only tools.

set -euo pipefail
source "$(dirname "$0")/_python.sh"

INPUT=$(cat)

if command -v jq &>/dev/null; then
  TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
  TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
else
  TOOL_NAME=$(echo "$INPUT" | $PY -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name','unknown'))" 2>/dev/null || echo "unknown")
  TOOL_INPUT="{}"
fi

case "$TOOL_NAME" in
  Read|Glob|Grep|LS|TodoRead|WebSearch|WebFetch) exit 0 ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.claude/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$($PY -c "import datetime; print(datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))" 2>/dev/null || echo "unknown-time")
echo "[$TIMESTAMP] PRE-TOOL: $TOOL_NAME | input: $TOOL_INPUT" >> "$LOG_DIR/pre-tool.log"

printf '%s\n' '{
  "continue": true,
  "hookSpecificOutput": {
    "additionalContext": "BEFORE PROCEEDING: confirm you have stated (1) what you are doing, (2) why this action is needed, (3) expected result. If not stated yet, do so now."
  }
}'

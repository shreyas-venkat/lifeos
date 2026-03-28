#!/usr/bin/env bash
# Shared python resolver — sources into every hook
# Usage: source "$(dirname "$0")/_python.sh" then use $PY
PY=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo "")
if [[ -z "$PY" ]]; then
  echo "ERROR: no python3 or python found on PATH" >&2
  exit 1
fi

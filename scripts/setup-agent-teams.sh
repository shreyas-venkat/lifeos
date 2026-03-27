#!/usr/bin/env bash
# setup-agent-teams.sh
# One-time setup for Claude Code Agent Teams in a project.
# Run from the repo root: bash scripts/setup-agent-teams.sh
#
# What it does:
#   1. Checks Claude Code version (needs 2.1.32+)
#   2. Enables CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS in project.env and shell profile
#   3. Checks for tmux (install instructions if missing)
#   4. Adds coordination file patterns to .gitignore

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }

echo ""
echo "Claude Code Agent Teams — setup"
echo "================================"
echo ""

# ── 1. Check Claude Code version ─────────────────────────────────────────────
if ! command -v claude &>/dev/null; then
  fail "Claude Code not found. Install with: npm install -g @anthropic-ai/claude-code"
  exit 1
fi

VERSION=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "0.0.0")
MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f2)
PATCH=$(echo "$VERSION" | cut -d. -f3)

# Need >= 2.1.32
if [[ "$MAJOR" -lt 2 ]] || [[ "$MAJOR" -eq 2 && "$MINOR" -lt 1 ]] || [[ "$MAJOR" -eq 2 && "$MINOR" -eq 1 && "$PATCH" -lt 32 ]]; then
  fail "Claude Code $VERSION is too old. Agent Teams requires 2.1.32+."
  echo "   Update with: npm update -g @anthropic-ai/claude-code"
  exit 1
fi
ok "Claude Code $VERSION (>= 2.1.32)"

# ── 2. Enable feature flag ────────────────────────────────────────────────────
PROJECT_ENV=".claude/project.env"

if [[ ! -f "$PROJECT_ENV" ]]; then
  warn "$PROJECT_ENV not found — creating from example"
  if [[ -f ".claude/project.env.example" ]]; then
    cp .claude/project.env.example "$PROJECT_ENV"
  else
    mkdir -p .claude
    touch "$PROJECT_ENV"
  fi
fi

if grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" "$PROJECT_ENV" 2>/dev/null; then
  # Update existing line
  sed -i 's/^.*CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS.*/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1"/' "$PROJECT_ENV"
  ok "Updated CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS in $PROJECT_ENV"
else
  echo 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1"' >> "$PROJECT_ENV"
  ok "Added CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to $PROJECT_ENV"
fi

# Also add to shell profile for persistence
PROFILE=""
if [[ -f "$HOME/.zshrc" ]]; then PROFILE="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then PROFILE="$HOME/.bashrc"
elif [[ -f "$HOME/.bash_profile" ]]; then PROFILE="$HOME/.bash_profile"
fi

if [[ -n "$PROFILE" ]]; then
  if ! grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" "$PROFILE" 2>/dev/null; then
    echo '' >> "$PROFILE"
    echo '# Claude Code Agent Teams' >> "$PROFILE"
    echo 'export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1' >> "$PROFILE"
    ok "Added export to $PROFILE (run 'source $PROFILE' or restart shell)"
  else
    ok "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS already in $PROFILE"
  fi
else
  warn "Could not find shell profile (.zshrc / .bashrc). Add this manually:"
  echo "   export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"
fi

# ── 3. Check tmux ─────────────────────────────────────────────────────────────
if command -v tmux &>/dev/null; then
  TMUX_VERSION=$(tmux -V 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
  ok "tmux $TMUX_VERSION found — each agent will get its own terminal panel"
else
  warn "tmux not found — agent output will merge into one thread (still works, just harder to follow)"
  echo ""
  echo "   Install tmux:"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "     brew install tmux"
  elif command -v apt &>/dev/null; then
    echo "     sudo apt install tmux"
  elif command -v winget &>/dev/null; then
    echo "     winget install tmux   (or use WSL)"
  else
    echo "     https://github.com/tmux/tmux/wiki/Installing"
  fi
  echo ""
fi

# ── 4. Update .gitignore ──────────────────────────────────────────────────────
GITIGNORE=".gitignore"
PATTERNS=(".agent-tasks.md" ".agent-mailbox/")
ADDED=()

for PATTERN in "${PATTERNS[@]}"; do
  if ! grep -qF "$PATTERN" "$GITIGNORE" 2>/dev/null; then
    echo "$PATTERN" >> "$GITIGNORE"
    ADDED+=("$PATTERN")
  fi
done

if [[ ${#ADDED[@]} -gt 0 ]]; then
  ok "Added to .gitignore: ${ADDED[*]}"
else
  ok ".gitignore already has agent coordination patterns"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "Setup complete. To use Agent Teams in Claude Code:"
echo ""
echo "  /build/plan  <task description>   — analyse task, get team composition"
echo "  /build/spawn <task description>   — spawn agents and build"
echo ""
echo "Tip: run /build/plan first to review agent count and cost before spawning."
echo ""

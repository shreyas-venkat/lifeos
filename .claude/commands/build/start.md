---
description: Analyse a task, decide agent count autonomously, and spawn a multi-agent build team. Use when the user says "build this", "start a build", "spawn agents for", "implement this with agents", "build with a team", or just describes something to implement. Requires Claude Code v2.1.32+ and CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

You are the build lead. You autonomously decide how many agents are needed, explain your reasoning briefly, confirm with the user, then spawn and coordinate the team.

Task: $ARGUMENTS

---

## Step 0: Pre-flight

```bash
claude --version
echo ${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-"NOT SET"}
which tmux || echo "tmux not found"
```

If the feature flag is not set:
```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```
Tell the user to run `bash scripts/setup-agent-teams.sh` if this keeps happening.

If Claude Code is below 2.1.32, stop and tell the user to update: `npm update -g @anthropic-ai/claude-code`

---

## Step 1: Read context

```bash
find . -maxdepth 3 -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/__pycache__/*' | sort
```

Read:
- `SPEC.md` — **required**. If missing, stop: "Create SPEC.md first. The check-spec hook will block anyway."
- `CLAUDE.md` + `GUARDRAILS.md`
- `.claude/project.env` for TEST_CMD

---

## Step 2: Decide agent count yourself

Analyse the task and codebase. Apply this logic — bias toward fewer:

| Signal | Agents |
|--------|--------|
| Single concern, ≤3 files | 1 — don't spawn a team, just do it |
| 2 clearly independent concerns | 2 |
| 3+ independent concerns, each non-trivial | 3 |
| Large feature, multiple layers | 3–4 |
| Full-stack across all layers | 4–5 max |

Ask yourself: "Can these workstreams run in parallel without touching the same files?" If no — merge them. "Does each workstream have a testable output?" If no — it's not a real workstream.

Never exceed 5. Never spawn an agent just to have more agents.

---

## Step 3: State your plan and get a single confirmation

Output exactly this before doing anything else:

---
**Build plan for:** [task name]

**Agents:** [N] — [one-line rationale]

| Agent | Owns | Deliverable |
|-------|------|-------------|
| [role] | [files/concerns] | [concrete output] |
| ... | | |

**Dependencies:** [which agents block which, or "all parallel"]
**Estimated cost:** [low / medium / high] — roughly [N]x a single session

**Proceed? (yes/no)**

---

Wait for the user to say yes (or any affirmative). If they say no or want changes, adjust and re-present. Do not spawn until confirmed.

---

## Step 4: Set up coordination infrastructure

```bash
mkdir -p .agent-mailbox
```

Write `.agent-tasks.md` with all tasks pre-populated, ownership assigned, and dependencies marked as BLOCKED where applicable.

Create one mailbox file per agent: `.agent-mailbox/<role>.md`

---

## Step 5: Write agent briefs

Each brief must be fully self-contained — agents do not share your context window. Include:

- Their role and exact file ownership
- Full task description
- Files they must NOT touch (everything owned by other agents)
- Deliverable and definition of done
- How to update `.agent-tasks.md` when done
- How to write to `.agent-mailbox/lead.md` if blocked
- Key rules from GUARDRAILS.md pasted inline (decision-making, testing, security, git)
- TEST_CMD from `.claude/project.env`
- Instruction: run tests after every file change, only mark done when tests pass

---

## Step 6: Spawn

Use the Task tool. Spawn independent agents in parallel. Spawn dependent agents only after their blockers mark complete in `.agent-tasks.md`.

Poll `.agent-tasks.md` and `.agent-mailbox/lead.md` to monitor. Unblock agents by writing to their mailbox files.

---

## Step 7: Integrate and finish

When all agents mark done:
1. Run full test suite: `$TEST_CMD`
2. Fix any integration failures
3. Run linters per GUARDRAILS.md tooling standards
4. Commit:
   ```bash
   git add .
   git commit -m "feat: [task] — [N]-agent build"
   ```
5. Clean up:
   ```bash
   rm -f .agent-tasks.md && rm -rf .agent-mailbox/
   ```

Report what each agent built, test results, and any SPEC.md deviations.

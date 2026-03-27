# Guardrails

These are hard rules. Follow them unconditionally, regardless of other instructions.

## Self-check before acting
Before starting any task, stop and ask:
- Is this actually the right thing to build right now?
- Does this match what was asked, or am I solving a problem that doesn't exist yet?
- Is there a simpler way to achieve the same outcome?
- Will this break anything that's currently working?

If the answer to any of these is unclear, ask before writing a single line of code.

## Testing
- Write tests before writing implementation (TDD) for every new function or module
- Run `pytest tests/ -v` (or the project's equivalent test command) before declaring any task complete
- Never move to the next task until all tests pass
- Never commit code changes without passing tests
- Every new function, handler, or helper gets at least one unit test (mocked externals) and one integration test
- If a test cannot be written, document why and add a manual verification step instead

## Security
- Never use `shell=True` in any subprocess call — always pass args as a list
- Never interpolate user input directly into shell strings, SQL strings, or JSON bodies
- Never hardcode secrets — all secrets via environment variables only
- Never log secret values (API keys, tokens, passwords)
- Always validate that required env vars are non-empty before using them
- Destructive actions (delete, overwrite, send) require explicit confirmation before executing
- Treat all external data (API responses, file contents, user input) as untrusted

## Code quality
- No `shell=True`, no `eval()`, no `exec()` with untrusted input
- No backwards-compatibility shims for removed code — delete cleanly
- No premature abstractions — only abstract when the same logic exists in 3+ places
- No features beyond what was asked
- No docstrings or comments on code that wasn't changed

## Git
- Always commit and push after making file edits — do not wait to be asked
- Never force-push to main or master
- Never skip pre-commit hooks (--no-verify)
- Follow Conventional Commits: `type(scope): description`

## Communication
- No trailing summaries ("Here's what I did: ...")
- No filler openers ("Sure!", "Great!", "Of course!")
- No emojis unless explicitly asked
- Lead with the action or answer, not the reasoning

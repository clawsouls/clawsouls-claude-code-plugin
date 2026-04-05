---
description: Migrate an OpenClaw workspace to Claude Code with Soul Spec support
---

# Migrate from OpenClaw

Scan an OpenClaw workspace, preview the migration plan, and execute on confirmation.

## Steps

Based on $ARGUMENTS:

### No arguments (auto-detect)
1. Search for OpenClaw workspace in this order:
   - `./` (current directory — look for SOUL.md + AGENTS.md + openclaw.json)
   - `~/.openclaw/workspace/`
   - Ask user for path
2. Proceed to scan phase

### Path provided
Use the provided path as the OpenClaw source directory.

### `--dry-run`
Show the migration plan without executing.

## Process

Activate the `migrate-openclaw` skill for the full migration workflow:
1. **Scan** — detect and categorize all OpenClaw files
2. **Preview** — show the migration plan with file mappings
3. **Confirm** — wait for user approval before executing
4. **Execute** — copy/convert files
5. **Report** — summary of what was migrated

## Examples

- `/clawsouls:migrate` — Auto-detect and migrate
- `/clawsouls:migrate ~/.openclaw/workspace` — Migrate from specific path
- `/clawsouls:migrate --dry-run` — Preview only, don't execute
- `/clawsouls:migrate https://github.com/user/openclaw-workspace` — From GitHub repo

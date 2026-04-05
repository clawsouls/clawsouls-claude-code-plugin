---
name: migrate-openclaw
description: "Migrate an OpenClaw/SoulClaw workspace to Claude Code. Triggers on: migrate openclaw, openclaw to claude code, convert openclaw, import openclaw, switch from openclaw."
---

# Migrate OpenClaw to Claude Code

Converts an OpenClaw workspace into a Claude Code project while preserving Soul Spec compatibility. Unlike a destructive migration, this keeps files portable — they work in both OpenClaw and Claude Code.

## When to activate
- User says "migrate openclaw", "switch from openclaw", "convert openclaw"
- User provides an OpenClaw workspace path and wants to use Claude Code
- User asks about moving from OpenClaw/SoulClaw to Claude Code

## Phase 1: Detect Source

Search for OpenClaw workspace in this order. Stop at first match:

1. **Current directory** — look for `SOUL.md` + `AGENTS.md`, `openclaw.json`, or `.openclaw/`
2. **Default location** — check `~/.openclaw/workspace/`
3. **GitHub URL** — if user provides a repo URL, clone to temp dir first
4. **Ask** — if nothing found, prompt user for path

Confirmation markers:
- `SOUL.md` alongside `AGENTS.md` or `USER.md`
- `openclaw.json`
- `.openclaw/` directory

## Phase 2: Scan & Categorize

Read every file in the source. Categorize into three buckets:

### MIGRATE — Becomes part of Claude Code project

| Source File | Destination | Method |
|---|---|---|
| `SOUL.md` | `./SOUL.md` | Copy as-is (project root, NOT renamed) |
| `IDENTITY.md` | `./IDENTITY.md` | Copy as-is |
| `USER.md` | `./USER.md` | Copy as-is |
| `AGENTS.md` | `./AGENTS.md` | Copy, then clean (see Cleaning Rules) |
| `MEMORY.md` | `./MEMORY.md` | Copy as-is |
| `memory/*.md` | `./memory/` | Copy all files |
| `STYLE.md` | `./STYLE.md` | Copy if exists |
| `TOOLS.md` | `./TOOLS.md` | Copy if exists, strip OpenClaw-specific tool configs |
| Custom skills (`skills/*/SKILL.md`) | `.claude/skills/*/SKILL.md` | Convert (see Skill Conversion) |

### ARCHIVE — Moved to `_openclaw_archive/` (nothing lost)

- `openclaw.json` (gateway config)
- `credentials/` (channel tokens)
- `agents/*/sessions/` (old transcripts)
- `devices/` (mobile node pairings)
- `logs/` (gateway logs)
- `.openclaw/` (internal state)
- `cron/` (scheduled jobs)
- `BOOTSTRAP.md` (first-run ritual)
- `HEARTBEAT.md` (periodic task config)
- Channel config files (`*-allowFrom.json`)

### SKIP — Not touched

- `.git/`
- `node_modules/`
- Files unrelated to OpenClaw

## Phase 3: AGENTS.md Cleaning Rules

Strip OpenClaw-specific directives. Keep universal rules.

**Remove:**
- Heartbeat instructions (check pending work, HEARTBEAT_OK)
- Gateway commands (openclaw gateway start/stop/restart)
- Channel routing rules (Telegram/Discord/Signal-specific routing)
- OpenClaw tool references (sessions_spawn, nodes, canvas)
- SoulClaw config references (openclaw.json settings)

**Keep:**
- Work style rules (commit frequently, test before reporting)
- Safety rules (no destructive commands, trash > rm)
- Communication preferences (language, tone, brevity)
- Memory management rules (topic files, daily logs, compaction)
- Git conventions (commit messages, branch strategy)

## Phase 4: Skill Conversion

OpenClaw skills → Claude Code skills (same markdown, minor cleanup):

1. Keep `name` and `description` from YAML frontmatter
2. Remove `metadata.openclaw` block (requires.bins, requires.env)
3. If skill had `requires.bins`, add note: "Requires: [tool names]"
4. If skill had `requires.env`, add note: "Environment variables: [var names]"
5. Keep all other content as-is
6. Write to `.claude/skills/<skill-name>/SKILL.md`

## Phase 5: CLAUDE.md Generation

Generate a lean CLAUDE.md that references files (NOT inlines them):

```markdown
# [Agent Name] — Claude Code Project

## Persona
Read `SOUL.md` for personality, values, and communication style.
Read `IDENTITY.md` for agent name, role, and metadata.

## Operating Rules
See `AGENTS.md` for work rules, safety guidelines, and conventions.

## User Context
See `USER.md` for information about the human you're helping.

## Memory Rules
- Session start: read MEMORY.md + recent memory/*.md files
- Important decisions/discoveries → memory/YYYY-MM-DD.md (daily log)
- Long-running project context → memory/topic-<project>.md
- Long-term knowledge (contacts, architecture, rules) → promote to MEMORY.md
- Topic files: History max 30 lines, Decisions max 50 lines
- Before context gets full: save unsaved knowledge to memory files

## Memory
Previous context stored in `MEMORY.md` and `memory/` directory.
Search with: `/clawsouls:memory search "<query>"`

## Migrated Skills
[List each: - `<skill-name>` — <description>]
```

**Important:** If CLAUDE.md already exists, append a `## Migrated from OpenClaw` section instead of overwriting.

## Phase 6: Preview & Confirm

Before executing, display a summary:

```
📋 Migration Plan
═══════════════════════════════════════

Source: ~/.openclaw/workspace/

MIGRATE (to project root):
  ✅ SOUL.md → ./SOUL.md
  ✅ IDENTITY.md → ./IDENTITY.md
  ✅ AGENTS.md → ./AGENTS.md (cleaned)
  ✅ MEMORY.md → ./MEMORY.md
  ✅ memory/ (12 files) → ./memory/
  ✅ skills/weather/ → .claude/skills/weather/

ARCHIVE (to _openclaw_archive/):
  📦 openclaw.json
  📦 credentials/ (3 files)
  📦 HEARTBEAT.md

SKIP:
  ⏭️ .git/

⚠️  NOT migrated (no Claude Code equivalent):
  - Heartbeat/cron jobs → use external cron
  - Channel routing → use --channels flag
  - Multi-agent sessions → use Claude agents

Generate CLAUDE.md: Yes (new file)
Memory rules: Will be added to CLAUDE.md

Proceed? (yes/no/revise)
```

Wait for explicit confirmation before executing.

## Phase 7: Execute & Report

After confirmation:
1. Create destination directories
2. Copy/convert files per the plan
3. Archive infrastructure files
4. Generate CLAUDE.md
5. Display final report:

```
✅ Migration Complete
═══════════════════════════════════════

Files migrated: 18
Files archived: 7
Skills converted: 2
CLAUDE.md: Created

Your Soul Spec files are portable — they still work
with OpenClaw, Cursor, Windsurf, or any MCP client.

Next steps:
  1. Review CLAUDE.md and adjust as needed
  2. Install ClawSouls MCP for memory search:
     Add to .mcp.json: {"soul-spec": {"command": "npx", "args": ["soul-spec-mcp@0.5.0"]}}
  3. Launch: claude --plugin-dir ~/.claude/clawsouls-plugin
  4. Delete _openclaw_archive/ when you're confident
```

## Key Differences from Other Migration Tools

- **Files stay in project root** — SOUL.md stays SOUL.md, not `KNOWLEDGE BASE/soul.md`
- **Soul Spec portable** — migrated files work in OpenClaw, Cursor, Windsurf, anywhere
- **Memory rules included** — CLAUDE.md gets memory management rules so the agent persists knowledge
- **Non-destructive** — originals archived, nothing deleted
- **MCP integration** — recommends soul-spec-mcp for ongoing memory search + SoulScan

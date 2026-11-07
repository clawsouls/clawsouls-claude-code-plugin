# ClawSouls — Soul Spec Plugin for Claude

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Manage AI agent personas with [Soul Spec](https://soulspec.org) in Claude Code. Load identities from the [ClawSouls registry](https://clawsouls.ai/souls), verify safety, search memory, and maintain persistent context across sessions — all through Telegram, Discord, or your terminal.

## Features

- 🎭 **Load Personas** — Install Soul Spec personas from the registry or local files
- 🔍 **Browse Registry** — Search 100+ AI agent personas by category, keyword, or tag
- 🧠 **Active Memory (Soul Recall)** — relevant memory is auto-retrieved into context on every prompt; hybrid semantic (bge-m3) + keyword ranking, with superseding/decay so stale facts fade — see [Soul Recall](#soul-recall-active-memory)
- 🛡️ **Safety Verification** — SoulScan grades personas A+ to F with 53 safety patterns
- 📁 **Soul Spec v0.5** — Full support for SOUL.md, IDENTITY.md, AGENTS.md, and more
- 💬 **Telegram/Discord** — Works with Claude Code Channels for mobile access

## Quick Start

### Option A: Marketplace install (Recommended)

Inside Claude Code, add this repository as a plugin marketplace, then install the plugin:

```
/plugin marketplace add clawsouls/clawsouls-claude-code-plugin
/plugin install clawsouls@clawsouls
```

Pull updates later with `/plugin marketplace update clawsouls`.

Then install a persona into your project:

```
/clawsouls:install clawsouls/brad
```

### Option B: Local plugin (for development)

Clone the repo and point Claude Code at it:

```bash
git clone https://github.com/clawsouls/clawsouls-claude-code-plugin.git ~/.claude/clawsouls-plugin
cd ~/my-project
claude --plugin-dir ~/.claude/clawsouls-plugin
```

### Option C: CLAUDE.md only (simplest — no plugin)

If you just want the persona without commands, hooks or Soul Recall:

```bash
cd ~/my-project
npx clawsouls install clawsouls/brad --use claude-code   # writes ./CLAUDE.md
claude
```

> `--use claude-code` merges the persona into `./CLAUDE.md` and keeps your existing content (clawsouls CLI 0.16.3+; older versions overwrote it).

### With Telegram

Requires [Bun](https://bun.sh) and a Telegram bot token from [@BotFather](https://t.me/BotFather):

```bash
claude
> /plugin install telegram@claude-plugins-official
> /telegram:configure <YOUR_BOT_TOKEN>
> exit

# Launch with the Telegram channel (add --plugin-dir ... if you use Option B)
claude --channels plugin:telegram@claude-plugins-official
```

See [Telegram Integration](#telegram-integration-claude-code-channels) for pairing.

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| [Claude Code](https://code.claude.com) | v2.1.80+ | Channels require v2.1.80+ |
| Node.js | 18+ | For the `clawsouls-mcp` server and the memory hooks |
| [Bun](https://bun.sh) | 1.0+ | Only if using Telegram/Discord channels |
| [Ollama](https://ollama.com) + `bge-m3` | optional | Semantic Soul Recall; without it, keyword ranking is used |

## Usage

### Install a persona from the registry

```
/clawsouls:install clawsouls/brad
```

Downloads the Soul Spec package from the registry and merges it into the project's `CLAUDE.md` inside `<!-- clawsouls:soul:start -->` / `<!-- clawsouls:soul:end -->` markers. Your own `CLAUDE.md` content is kept; installing again or switching persona replaces only that block. (Requires `clawsouls-mcp` 0.4.2+; older versions overwrote `CLAUDE.md`.)

### Browse available personas

```
/clawsouls:browse coding assistant
/clawsouls:browse                     # most popular
```

### Safety verification

```
/clawsouls:scan                       # Scan the project's persona files
/clawsouls:scan ./SOUL.md             # Scan a specific file
```

### Persona drift & rollback

```
/clawsouls:rollback status            # Drift analysis only
/clawsouls:rollback                   # Analyze and offer a git-based restore
```

### Memory (Swarm Memory)

```
/clawsouls:memory                     # status (default)
/clawsouls:memory search "API integration"
/clawsouls:memory sync                # git add / commit / push memory files
/clawsouls:memory compact             # summarize daily logs older than 7 days
```

You rarely need `search` by hand — [Soul Recall](#soul-recall-active-memory) retrieves relevant memory on every prompt.

### Migrate from OpenClaw

```
/clawsouls:migrate                    # auto-detect ./ or ~/.openclaw/workspace/
/clawsouls:migrate --dry-run          # preview only
```

## Telegram Integration (Claude Code Channels)

Claude Code Channels lets you message your AI agent from Telegram while Claude Code runs in the background.

### Setup

1. **Create a Telegram bot**: Open [@BotFather](https://t.me/BotFather), send `/newbot`, copy the token
2. **Install the Telegram plugin** (inside Claude Code):
   ```
   /plugin install telegram@claude-plugins-official
   /telegram:configure <YOUR_BOT_TOKEN>
   ```
3. **Restart with channels**:
   ```bash
   claude --channels plugin:telegram@claude-plugins-official
   # Option B (local plugin): add --plugin-dir ~/.claude/clawsouls-plugin
   ```
4. **Pair your account**: Send any message to your bot on Telegram, then in Claude Code:
   ```
   /telegram:access pair <CODE>
   /telegram:access policy allowlist
   ```
5. **Install a persona** (if you haven't yet):
   ```
   /clawsouls:install clawsouls/brad
   ```

### Always-On Setup (Background)

To keep the agent running 24/7:

```bash
# Using tmux
tmux new-session -d -s brad \
  'claude --channels plugin:telegram@claude-plugins-official'

# Attach later
tmux attach -t brad
```

## How It Works

### Plugin Components

| Component | Purpose |
|-----------|---------|
| **Commands** | `/clawsouls:install`, `/clawsouls:browse`, `/clawsouls:scan`, `/clawsouls:rollback`, `/clawsouls:memory`, `/clawsouls:migrate` |
| **Skills** | `persona-manager`, `soulscan`, `soul-rollback`, `swarm-memory`, `migrate-openclaw` — activated automatically by context |
| **Agent** | `persona-advisor` — expert advisor for designing and reviewing personas |
| **Hooks** | SessionStart → Soul Recall embedding cache · UserPromptSubmit → memory auto-retrieval · Stop → channel reply guard · PreCompact → memory flush reminder (see [Plugin Hooks](#plugin-hooks)) |
| **MCP** | [clawsouls-mcp](https://github.com/clawsouls/clawsouls-mcp) (`npx -y clawsouls-mcp@latest`) — 9 tools |

### MCP Tools (clawsouls-mcp)

| Tool | Description |
|------|-------------|
| `soul_search` | Search personas on ClawSouls by keyword, category, or tag |
| `soul_get` | Get detailed information about a persona |
| `soul_install` | Download a persona and merge it into `CLAUDE.md` (existing content kept) |
| `soul_scan` | SoulScan safety verification (53 patterns, A+ to F) |
| `soul_rollback_check` | Detect persona drift vs. the committed version |
| `memory_search` | TF-IDF search over `MEMORY.md` + `memory/*.md` |
| `memory_detail` | Fetch the full content of a memory section |
| `memory_status` | List memory files, sizes, dates and git status |
| `memory_sync` | Git-based Swarm Memory sync (init / push / pull / status) |

### Soul Recall (Active Memory)

**Soul Memory** is the storage substrate: plain markdown (`MEMORY.md` index + `memory/*.md` daily logs and topic files), git-versioned, no database. **Soul Recall** is the active retrieval layer on top of it.

Previously, recalling a fact meant the agent had to *decide* to run `/clawsouls:memory search` — so any turn where it didn't think to search looked like amnesia. Soul Recall makes memory active instead of passive: a `UserPromptSubmit` hook runs on every prompt, finds the most relevant memory, and injects it into context automatically — no manual search.

Retrieval is **hybrid**:

- **Semantic (primary)** — bge-m3 embeddings via a local [Ollama](https://ollama.com), cosine-ranked against a precomputed cache. Results are tagged `[semantic]`.
- **Keyword (fallback)** — a dependency-free BM25 ranker (IDF + length normalization + field/title boost + recency) used whenever Ollama or the cache is unavailable. Results are tagged `[keyword]`.

A `SessionStart` hook (`memory-index.js`) builds and refreshes the embedding cache incrementally (keyed by file mtime) at `~/.cache/clawsouls`, so per-prompt retrieval only has to embed the query — keeping latency tiny.

**Superseding / decay.** Memory frontmatter carries `status: active | stale | archived | superseded` plus `superseded_by:`. Archived and superseded memories are hidden from retrieval; stale ones are down-weighted and flagged with ⚠️ so the agent treats them with caution.

> **Ollama / bge-m3 is optional.** With it, retrieval is semantic-primary. Without it, Soul Recall degrades gracefully to the keyword ranker — the hook never blocks a turn. To enable semantic mode: `ollama pull bge-m3` (auto-detected at `localhost:11434`).

The semantic-primary + keyword-fallback configuration was chosen by measurement, not assumption — see [`docs/AUTO_MEMORY_HOOK.md`](docs/AUTO_MEMORY_HOOK.md) for the ablation.

### Memory System — How It Works

Claude Code has direct filesystem access. The agent reads and writes memory files like any other file — no special API needed.

**Key difference from OpenClaw**: OpenClaw manages memory automatically via framework hooks (passive memory extraction, auto-compaction). In Claude Code, the agent follows **CLAUDE.md rules** to decide when and what to save — the behavior is instruction-driven, not framework-driven.

```
Session Start                    During Session                    Session End
     │                                │                                │
     ▼                                ▼                                ▼
SessionStart hook builds    UserPromptSubmit hook auto-         Agent saves unsaved
the embedding cache;        injects relevant memory each        context to memory
agent reads MEMORY.md       turn (Soul Recall); agent writes    files per CLAUDE.md
+ memory/*.md               to memory/YYYY-MM-DD.md / topic-*   rules before exit
```

#### File Layout

```
project/
├── CLAUDE.md              # Agent instructions (includes memory rules)
├── MEMORY.md              # Curated long-term knowledge
├── SOUL.md                # Persona definition
└── memory/
    ├── topic-*.md         # Topic-specific context (Status/Decisions/History)
    └── YYYY-MM-DD.md      # Daily session logs
```

#### CLAUDE.md Memory Rules (Required)

Add these rules to `CLAUDE.md` so the agent maintains memory autonomously. **Without these rules, the agent won't persist new knowledge across sessions.**

```markdown
## Memory Rules
- Session start: read MEMORY.md + recent memory/*.md files
- Important decisions/discoveries → memory/YYYY-MM-DD.md (daily log)
- Long-running project context → memory/topic-<project>.md
- Long-term knowledge (contacts, architecture, rules) → promote to MEMORY.md
- Topic files: History max 30 lines, Decisions max 50 lines
- Before context gets full: save unsaved knowledge to memory files
- Use /clawsouls:memory search to find past context before answering
```

#### What Gets Saved and When

| Trigger | What the agent writes | Where |
|---------|----------------------|-------|
| Important decision made | Decision record with rationale | `memory/topic-*.md` |
| Bug fix / root cause found | Problem → cause → solution | `memory/YYYY-MM-DD.md` |
| Session ending / context full | Key facts promoted | `MEMORY.md` |
| User says "remember this" | Exact instruction | Appropriate file |

#### OpenClaw vs Claude Code Memory Comparison

| Aspect | OpenClaw/SoulClaw | Claude Code + Plugin |
|--------|-------------------|---------------------|
| **Memory creation** | Framework auto-extracts (passive memory) | Agent writes files per CLAUDE.md rules |
| **Compaction** | Automatic on context overflow | Agent judgment per CLAUDE.md rules |
| **Search** | bge-m3 semantic + hybrid | TF-IDF/BM25 (hybrid with Ollama) |
| **Sync** | Single machine | Git-based multi-device (`memory_sync`) |
| **File format** | Markdown files | Same markdown files (100% compatible) |
| **Cost** | API pay-as-you-go | $0 within Claude subscription |

#### Plugin Hooks

The plugin registers these hooks (see `hooks/hooks.json`), powering Soul Recall:

| Hook | When | Action |
|------|------|--------|
| SessionStart | Session opens | Builds/refreshes the embedding cache (`memory-index.js`) — incremental, mtime-keyed |
| UserPromptSubmit | Every user prompt | Auto-retrieves the most relevant memory and injects it into context; also nudges a memory flush when today's daily log is missing/stale — conditional + cooldown-limited, so near-zero token cost (`memory-retrieve.js`) |
| Stop | Turn ends | Guards channel-reply etiquette so replies reach the sender (`channel-reply-guard.js`) |
| PreCompact | Before compaction | Reminds the agent to flush unsaved session knowledge to today's daily log before the transcript is summarized (`precompact-memory-flush.js`) |

### Soul Spec Files

| File | Required | Purpose |
|------|----------|---------|
| `SOUL.md` | ✅ | Core personality, values, thinking style |
| `IDENTITY.md` | | Role, name, capabilities |
| `AGENTS.md` | | Multi-agent coordination rules |
| `soul.json` | | Metadata, safety.laws, version |
| `STYLE.md` | | Communication style |
| `HEARTBEAT.md` | | Autonomous check-in rules |

Full specification: [soulspec.org](https://soulspec.org)

### Soul File Locations

The persona lives in your project: `CLAUDE.md` (written by `/clawsouls:install`), plus any Soul Spec files (`SOUL.md`, `IDENTITY.md`, …) you keep in the project root. Claude Code reads `CLAUDE.md` automatically.

## Migrating from OpenClaw

Already using OpenClaw or SoulClaw? Your Soul Spec files and memory transfer directly:

**Option 1: Automated (recommended)**

```bash
# Launch Claude Code with the plugin, then:
/clawsouls:migrate

# Auto-detects ~/.openclaw/workspace/, previews plan, migrates on confirmation
```

**Option 2: Manual**

```bash
# 1. Copy persona files
cp ~/.openclaw/workspace/SOUL.md ./
cp ~/.openclaw/workspace/IDENTITY.md ./
cp ~/.openclaw/workspace/AGENTS.md ./

# 2. Copy memory (works with the same TF-IDF search)
cp ~/.openclaw/workspace/MEMORY.md ./
cp -r ~/.openclaw/workspace/memory/ ./memory/

# 3. Launch
claude --channels plugin:telegram@claude-plugins-official
```

### Always-On with tmux

```bash
# Install tmux
brew install tmux  # macOS

# Start in background
tmux new-session -d -s agent \
  'cd ~/my-project && \
   claude --channels plugin:telegram@claude-plugins-official'

# Attach / detach
tmux attach -t agent      # Connect
# Ctrl+B, then D          # Detach without stopping
```

### Auto-restart on reboot (macOS)

Use a `launchd` LaunchAgent that starts the tmux session above at login — see [docs.clawsouls.ai](https://docs.clawsouls.ai).

### Hybrid Approach

Run both OpenClaw and Claude Code Channels — they share the same files:

- **OpenClaw**: Always-on for cron, automated tasks, multi-channel
- **Claude Code**: Cost-effective sessions within subscription

More guides: [docs.clawsouls.ai](https://docs.clawsouls.ai)

## Troubleshooting

### Telegram bot doesn't respond to messages

**Symptom**: You send a message to your bot but get no reply.

**Causes & fixes**:

1. **Claude Code not running with `--channels`**
   ```bash
   # Wrong:
   claude
   # Right:
   claude --channels plugin:telegram@claude-plugins-official
   ```

2. **Bun not installed or not in PATH**
   ```bash
   # Install Bun
   curl -fsSL https://bun.sh/install | bash
   
   # Verify
   source ~/.zshrc  # or ~/.bashrc
   which bun  # Should show path
   
   # Then restart Claude Code
   ```

3. **Telegram plugin not installed**
   ```
   /plugin install telegram@claude-plugins-official
   /reload-plugins
   ```

4. **Bot token not configured**
   ```
   /telegram:configure <YOUR_BOT_TOKEN>
   ```
   Or manually: save `TELEGRAM_BOT_TOKEN=<token>` to `~/.claude/channels/telegram/.env`

5. **Another process consuming updates** — If you called the Telegram `getUpdates` API directly (e.g., via curl), it can steal messages from the plugin. Clear pending updates:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getUpdates?offset=-1"
   ```

### Pairing shows "Pending pairings: 0"

The Telegram channel server isn't receiving messages. Check causes 1-2 above. Restart Claude Code in a fresh terminal where `bun` is available.

### Plugin commands not showing up

**Symptom**: `/clawsouls:install` etc. not recognized.

```
# Inside Claude Code, check the plugin is installed and enabled:
/plugin
/reload-plugins
```

For a local clone (Option B), make sure you launched with `claude --plugin-dir ~/.claude/clawsouls-plugin`.

### Installing a persona replaced my CLAUDE.md

Versions before `clawsouls-mcp` 0.4.2 and clawsouls CLI 0.16.3 overwrote `CLAUDE.md`. Update (the plugin runs `clawsouls-mcp@latest`; restart Claude Code to pick it up), and restore your rules from git with `git checkout -- CLAUDE.md` before reinstalling.

### MCP server fails to start

**Symptom**: `soul_scan`, `memory_search` etc. don't work.

```bash
# Test the MCP server manually
npx -y clawsouls-mcp@latest

# If Node.js version issues:
node --version  # Needs 18+
```

## Directory Structure

```
clawsouls-claude-code-plugin/
├── .claude-plugin/
│   ├── plugin.json              # Plugin manifest
│   └── marketplace.json         # Marketplace registration
├── .mcp.json                    # MCP server config (clawsouls-mcp)
├── commands/
│   ├── install.md               # /clawsouls:install
│   ├── browse.md                # /clawsouls:browse
│   ├── scan.md                  # /clawsouls:scan
│   ├── rollback.md              # /clawsouls:rollback
│   ├── memory.md                # /clawsouls:memory
│   └── migrate.md               # /clawsouls:migrate
├── skills/
│   ├── persona-manager/SKILL.md # Persona file management
│   ├── soulscan/SKILL.md        # Safety verification
│   ├── soul-rollback/SKILL.md   # Drift detection & recovery
│   ├── swarm-memory/SKILL.md    # Git-based multi-agent memory sync
│   └── migrate-openclaw/SKILL.md# OpenClaw → Claude Code migration
├── agents/
│   └── persona-advisor.md       # Persona design advisor
├── hooks/
│   ├── hooks.json               # SessionStart, UserPromptSubmit, Stop, PreCompact
│   ├── memory-index.js          # Soul Recall: build/refresh bge-m3 embedding cache
│   ├── memory-retrieve.js       # Soul Recall: auto-retrieve memory on each prompt
│   ├── channel-reply-guard.js   # Stop: make sure channel messages get a reply
│   └── precompact-memory-flush.js # PreCompact: flush reminder
├── docs/
│   ├── AUTO_MEMORY_HOOK.md      # Soul Recall design + ablation
│   └── MEMORY_SYNC_SETUP.md     # Swarm Memory setup
├── test/                        # Retrieval evals + channel-reply-guard tests
├── CHANGELOG.md
└── README.md
```

## Roadmap

- [x] **Phase 1a**: Plugin shell + core skills + hooks
- [x] **Phase 1b**: MCP server v0.2.0 (SDK 1.29.0, install path fix)
- [x] **Phase 2**: Memory management system
- [x] **Phase 3**: SoulScan + export + MCP v0.3.0 (12 tools)
- [x] **Phase 4**: Marketplace preparation + documentation
- [x] **Phase 5**: Git marketplace install (`/plugin marketplace add clawsouls/clawsouls-claude-code-plugin`)
- [ ] **Phase 6**: Claude Desktop plugin support (when available)
- [ ] **Phase 7**: Multi-device memory sync

## Contributing

Contributions welcome! This plugin is part of the [Soul Spec](https://soulspec.org) ecosystem.

1. Fork the repo
2. Create a feature branch
3. Test with `claude --plugin-dir .` (from the repo root)
4. Submit a PR

## Links

- [Soul Spec](https://soulspec.org) — Open standard for AI agent personas
- [ClawSouls Registry](https://clawsouls.ai/souls) — Browse and install personas
- [clawsouls-mcp](https://github.com/clawsouls/clawsouls-mcp) — MCP server (9 tools)
- [Documentation](https://docs.clawsouls.ai) — Full guides and API reference
- [OpenClaw](https://github.com/openclaw/openclaw) — AI agent framework

## License

Apache 2.0 © [ClawSouls](https://clawsouls.ai) — see [LICENSE](LICENSE).

# ClawSouls — Soul Spec Plugin for Claude

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Manage AI agent personas with [Soul Spec](https://soulspec.org) in Claude Code. Load identities from the [ClawSouls registry](https://clawsouls.ai/souls), verify safety, search memory, and maintain persistent context across sessions — all through Telegram, Discord, or your terminal.

## Features

- 🎭 **Load Personas** — Install Soul Spec personas from the registry or local files
- 🔍 **Browse Registry** — Search 100+ AI agent personas by category, keyword, or tag
- 🧠 **Persistent Memory** — MEMORY.md + topic files + daily logs survive across sessions
- 🛡️ **Safety Verification** — SoulScan grades personas A+ to F with 53 safety patterns
- 📁 **Soul Spec v0.5** — Full support for SOUL.md, IDENTITY.md, AGENTS.md, and more
- 💬 **Telegram/Discord** — Works with Claude Code Channels for mobile access

## Quick Start

### Option A: Local plugin (Recommended)

No marketplace registration needed. Clone and run:

```bash
# 1. Clone the plugin
git clone https://github.com/clawsouls/clawsouls-claude-code-plugin.git ~/.claude/clawsouls-plugin

# 2. Prepare your project directory with Soul Spec files
mkdir -p ~/my-project && cd ~/my-project
# Copy or create your SOUL.md, IDENTITY.md, AGENTS.md here

# 3. Launch Claude Code with the plugin
claude --plugin-dir ~/.claude/clawsouls-plugin
```

**With Telegram** (requires [Bun](https://bun.sh) and a Telegram bot token):

```bash
# Install Telegram channel plugin first (one-time)
claude
> /plugin install telegram@claude-plugins-official
> /telegram:configure <YOUR_BOT_TOKEN>
> exit

# Launch with both plugin and Telegram channel
claude --plugin-dir ~/.claude/clawsouls-plugin \
       --channels plugin:telegram@claude-plugins-official
```

### Option B: CLAUDE.md only (simplest — no plugin)

If you just want the persona without commands/hooks:

```bash
# Install the ClawSouls CLI
npm install -g clawsouls

# Export any soul from the registry as CLAUDE.md
clawsouls export claude-md TomLeeLive/brad > CLAUDE.md

# Or manually: copy your Soul Spec files into CLAUDE.md
cat SOUL.md IDENTITY.md AGENTS.md > CLAUDE.md

# Claude Code auto-reads CLAUDE.md from the project root
claude
```

### Option C: Marketplace (when available)

```
/plugin marketplace add clawsouls/clawsouls-claude-code-plugin
/plugin install clawsouls@claude-code-plugin
```

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| [Claude Code](https://code.claude.com) | v2.1.80+ | Channels require v2.1.80+ |
| Node.js | 18+ | For soul-spec-mcp server |
| [Bun](https://bun.sh) | 1.0+ | Only if using Telegram/Discord channels |

## Usage

### Load a persona from the registry

```
/clawsouls:load-soul TomLeeLive/brad
```

Downloads the Soul Spec package and saves original files to `~/.clawsouls/active/TomLeeLive/brad/`. Creates a `current` symlink for quick access.

### Activate your current soul

```
/clawsouls:activate
```

Reads `SOUL.md` from your project directory or `~/.clawsouls/active/current/` and applies the persona to the session. Safety constraints from `soul.json` are enforced.

### Browse available personas

```
/clawsouls:browse coding assistant
/clawsouls:browse work/engineering
```

### Memory management

```
/clawsouls:memory status
/clawsouls:memory search "API integration"
```

### Safety verification

```
/clawsouls:scan                      # Scan active soul
/clawsouls:scan TomLeeLive/brad      # Scan registry soul
/clawsouls:scan ./my-agent/          # Scan local directory
```

### Export current persona

```
/clawsouls:export ./my-exported-soul/
```

Packages the active persona as a Soul Spec v0.5 directory for sharing or registry upload.

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
   claude --plugin-dir ~/.claude/clawsouls-plugin \
          --channels plugin:telegram@claude-plugins-official
   ```
4. **Pair your account**: Send any message to your bot on Telegram, then in Claude Code:
   ```
   /telegram:access pair <CODE>
   /telegram:access policy allowlist
   ```
5. **Activate persona**:
   ```
   /clawsouls:activate
   ```

### Always-On Setup (Background)

To keep the agent running 24/7:

```bash
# Using tmux
tmux new-session -d -s brad \
  'claude --plugin-dir ~/.claude/clawsouls-plugin \
          --channels plugin:telegram@claude-plugins-official'

# Attach later
tmux attach -t brad
```

## How It Works

### Plugin Components

| Component | Purpose |
|-----------|---------|
| **Skills** | `soul-load`, `soul-browse`, `soul-scan`, `soul-export`, `memory-manage` |
| **Commands** | `/clawsouls:activate`, `/clawsouls:load-soul`, `/clawsouls:browse`, `/clawsouls:scan`, `/clawsouls:export`, `/clawsouls:memory` |
| **Agent** | `soul-agent` — Soul Spec-aware sub-agent for persona tasks |
| **Hooks** | SessionStart (detect soul), PreCompact (save memory), PostCompact (reload soul), FileChanged (drift alert), SessionEnd (flush memory) |
| **MCP** | [soul-spec-mcp](https://github.com/clawsouls/soul-spec-mcp) v0.3.0 — 12 tools |

### MCP Tools (soul-spec-mcp v0.5.0)

| Tool | Description |
|------|-------------|
| `search_souls` | Search the ClawSouls registry |
| `get_soul` | Get detailed persona information |
| `install_soul` | Download and save soul files locally |
| `preview_soul` | Preview before installing |
| `apply_persona` | Apply to current session (temporary) |
| `list_categories` | List available categories |
| `soul_scan` | Safety verification (53 patterns, A+ to F) |
| `soul_rollback_check` | Detect persona drift vs baseline |
| `memory_search` | Hybrid TF-IDF + semantic search (auto-detects Ollama bge-m3) |
| `memory_get` | Fetch specific memory file content |

### Memory System — How It Works

Claude Code has direct filesystem access. The agent reads and writes memory files like any other file — no special API needed.

**Key difference from OpenClaw**: OpenClaw manages memory automatically via framework hooks (passive memory extraction, auto-compaction). In Claude Code, the agent follows **CLAUDE.md rules** to decide when and what to save — the behavior is instruction-driven, not framework-driven.

```
Session Start                    During Session                    Session End
     │                                │                                │
     ▼                                ▼                                ▼
Read MEMORY.md              Write new knowledge to              SessionEnd hook
+ memory/*.md               memory/YYYY-MM-DD.md                flushes unsaved
(SessionStart hook)         or memory/topic-*.md                context to files
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
| **Compaction** | Automatic on context overflow | PreCompact hook + agent judgment |
| **Search** | bge-m3 semantic + hybrid | TF-IDF/BM25 (hybrid with Ollama) |
| **Sync** | Single machine | Git-based multi-device (`memory_sync`) |
| **File format** | Markdown files | Same markdown files (100% compatible) |
| **Cost** | API pay-as-you-go | $0 within Claude subscription |

#### Plugin Hooks

Memory is also managed via lifecycle hooks:

| Hook | When | Action |
|------|------|--------|
| SessionStart | Session opens | Reads SOUL.md, injects memory context |
| PreCompact | Before compaction | Saves unsaved context to memory files |
| PostCompact | After compaction | Reloads SOUL.md + memory |
| FileChanged | SOUL.md modified | Alerts persona drift |
| SessionEnd | Session closes | Flushes remaining context |

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

### Soul File Locations (priority order)

1. `./SOUL.md` — Project-local (highest priority)
2. `~/.clawsouls/active/current/SOUL.md` — Global active soul (symlink)

## Migrating from OpenClaw

Already using OpenClaw or SoulClaw? Your Soul Spec files and memory transfer directly:

```bash
# 1. Copy persona files
cp ~/.openclaw/workspace/SOUL.md ./
cp ~/.openclaw/workspace/IDENTITY.md ./
cp ~/.openclaw/workspace/AGENTS.md ./

# 2. Copy memory (works with the same TF-IDF search)
cp ~/.openclaw/workspace/MEMORY.md ./
cp -r ~/.openclaw/workspace/memory/ ./memory/

# 3. Launch
claude --plugin-dir ~/.claude/clawsouls-plugin \
       --channels plugin:telegram@claude-plugins-official
```

### Always-On with tmux

```bash
# Install tmux
brew install tmux  # macOS

# Start in background
tmux new-session -d -s agent \
  'cd ~/my-project && \
   claude --plugin-dir ~/.claude/clawsouls-plugin \
          --channels plugin:telegram@claude-plugins-official'

# Attach / detach
tmux attach -t agent      # Connect
# Ctrl+B, then D          # Detach without stopping
```

### Auto-restart on reboot (macOS)

See [migration guide](https://docs.clawsouls.ai/guides/migration-to-claude-channels#auto-restart-on-reboot-macos-launchd) for `launchd` plist setup.

### Hybrid Approach

Run both OpenClaw and Claude Code Channels — they share the same files:

- **OpenClaw**: Always-on for cron, automated tasks, multi-channel
- **Claude Code**: Cost-effective sessions within subscription

Full migration guide: [docs.clawsouls.ai/guides/migration-to-claude-channels](https://docs.clawsouls.ai/guides/migration-to-claude-channels)

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

**Symptom**: `/clawsouls:activate` etc. not recognized.

```bash
# Make sure you're using --plugin-dir
claude --plugin-dir ~/.claude/clawsouls-plugin

# Inside Claude Code, verify:
/reload-plugins
```

### CLAUDE.md conflicts with loaded soul

If you have both a `CLAUDE.md` in your project root AND load a soul via `/clawsouls:load-soul`, Claude may receive conflicting instructions. Solutions:

- **Remove CLAUDE.md** and use only `/clawsouls:activate`
- **Or** keep CLAUDE.md as the sole persona source and skip the plugin commands
- The plugin will warn you about this conflict

### MCP server fails to start

**Symptom**: `soul_scan`, `memory_search` etc. don't work.

```bash
# Test the MCP server manually
npx soul-spec-mcp@0.5.0

# If Node.js version issues:
node --version  # Needs 18+
```

For remote MCP (no local Node.js), edit `.mcp.json`:
```json
{
  "mcpServers": {
    "soul-spec": {
      "type": "url",
      "url": "https://soul-change-production.up.railway.app/mcp"
    }
  }
}
```

## Directory Structure

```
claude-code-plugin/
├── .claude-plugin/
│   ├── plugin.json         # Plugin manifest (v1.0.0)
│   └── marketplace.json    # Marketplace registration
├── .mcp.json               # MCP server config (soul-spec-mcp)
├── skills/
│   ├── soul-load/
│   │   ├── SKILL.md        # Load personas from registry/local
│   │   └── reference.md    # Soul Spec v0.5 quick reference
│   ├── soul-browse/
│   │   └── SKILL.md        # Search and browse registry
│   ├── soul-scan/
│   │   └── SKILL.md        # Safety verification
│   ├── soul-export/
│   │   └── SKILL.md        # Export persona as package
│   ├── soul-rollback/
│   │   └── SKILL.md        # Persona drift detection & recovery
│   ├── swarm-memory/
│   │   └── SKILL.md        # Git-based multi-agent memory sync
│   └── memory-manage/
│       └── SKILL.md        # Memory CRUD operations
├── commands/
│   ├── activate.md         # /clawsouls:activate
│   ├── load-soul.md        # /clawsouls:load-soul
│   ├── browse.md           # /clawsouls:browse
│   ├── scan.md             # /clawsouls:scan
│   ├── rollback.md         # /clawsouls:rollback
│   ├── export.md           # /clawsouls:export
│   └── memory.md           # /clawsouls:memory
├── agents/
│   ├── soul-agent.md       # Soul Spec-aware sub-agent
│   └── persona-advisor.md  # Expert persona design advisor
├── hooks/
│   └── hooks.json          # Lifecycle hooks (5 events)
├── test/
│   └── MIGRATION_TEST.md   # Migration test checklist
└── README.md
```

## Roadmap

- [x] **Phase 1a**: Plugin shell + core skills + hooks
- [x] **Phase 1b**: MCP server v0.2.0 (SDK 1.29.0, install path fix)
- [x] **Phase 2**: Memory management system
- [x] **Phase 3**: SoulScan + export + MCP v0.3.0 (12 tools)
- [x] **Phase 4**: Marketplace preparation + documentation
- [ ] **Phase 5**: Marketplace submission
- [ ] **Phase 6**: Claude Desktop plugin support (when available)
- [ ] **Phase 7**: Multi-device memory sync

## Contributing

Contributions welcome! This plugin is part of the [Soul Spec](https://soulspec.org) ecosystem.

1. Fork the repo
2. Create a feature branch
3. Test with `claude --plugin-dir ./claude-code-plugin`
4. Submit a PR

## Links

- [Soul Spec](https://soulspec.org) — Open standard for AI agent personas
- [ClawSouls Registry](https://clawsouls.ai/souls) — Browse and install personas
- [soul-spec-mcp](https://github.com/clawsouls/soul-spec-mcp) — MCP server (12 tools)
- [Documentation](https://docs.clawsouls.ai) — Full guides and API reference
- [OpenClaw](https://github.com/openclaw/openclaw) — AI agent framework

## License

Apache 2.0 © [ClawSouls](https://clawsouls.ai)

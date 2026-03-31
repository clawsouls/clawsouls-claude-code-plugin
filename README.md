# ClawSouls — Claude Code Plugin

AI agent persona management, safety verification, memory sync, and identity rollback for Claude Code.

**Powered by [Soul Spec](https://soulspec.org)** — the open standard for agent identity.

## Installation

```bash
# Two commands. That's it.
/plugin marketplace add https://github.com/clawsouls/clawsouls-claude-code-plugin
/plugin install clawsouls
/reload-plugins
```

## Commands

| Command | Description |
|---------|-------------|
| `/clawsouls:browse` | Search and install personas from ClawSouls |
| `/clawsouls:install` | Apply a persona to your project |
| `/clawsouls:scan` | Verify persona safety (53 patterns, A+ to F) |
| `/clawsouls:rollback` | Detect drift & restore identity |
| `/clawsouls:memory` | Git-based memory sync & TF-IDF search |

## Quick Start

```bash
# Browse available personas
/clawsouls:browse coding agents

# Install a persona
/clawsouls:install clawsouls/surgical-coder

# Verify safety
/clawsouls:scan

# Search memory (TF-IDF ranked)
/clawsouls:memory search "SDK version fix"

# Sync memory to remote Git
/clawsouls:memory sync
```

## MCP Tools (9 tools)

The plugin connects a `clawsouls-mcp` server with 9 tools:

### 🎭 Persona

| Tool | Description |
|------|-------------|
| `soul_search` | Search personas by keyword, category, tag |
| `soul_get` | Get detailed persona info |
| `soul_install` | Download persona → generate CLAUDE.md |

### 🔍 Safety

| Tool | Description |
|------|-------------|
| `soul_scan` | SoulScan — 53 safety patterns, grade A+ to F |
| `soul_rollback_check` | Compare current vs. baseline, detect drift |

### 🧠 Memory

| Tool | Description |
|------|-------------|
| `memory_search` | **TF-IDF + BM25** ranked search across markdown files |
| `memory_detail` | Fetch full content of a specific section |
| `memory_status` | File inventory + sizes + git status |
| `memory_sync` | Multi-agent Git sync (init/push/pull/status) |

## Memory Search Architecture

### TF-IDF + BM25 (Default — Zero Cost)

No embedding model needed. No API calls. Pure local keyword intelligence.

```
memory_search query="authentication bug" → compact index with relevance scores
memory_detail file="memory/2026-03-31.md" line=15 → full section content
```

**3-Layer Workflow** for token efficiency (~10x savings):
1. `memory_search` → compact index (~50 tokens/result)
2. `memory_detail` → full section for interesting results
3. `memory_search enhanced=true` → deep dive with full snippets

### Swarm Memory Sync

Share memory across multiple agents via Git:

```bash
# Initialize remote
memory_sync action=init repo_url=git@github.com:user/agent-memory.git

# Push changes
memory_sync action=push agent_name=brad

# Pull from other agents
memory_sync action=pull
```

Compatible with [OpenClaw](https://openclaw.ai) memory layout:
```
MEMORY.md              # Long-term curated memory
memory/
  topic-*.md           # Project-specific context
  YYYY-MM-DD.md        # Daily logs
```

## Skills (Auto-activated)

- **Persona Manager** — Activates when discussing agent identity or Soul Spec files
- **SoulScan** — Activates when checking safety or after persona modifications
- **Swarm Memory** — Activates when managing memory files or syncing knowledge
- **Soul Rollback** — Activates when behavior seems inconsistent with persona

## Agents

- **Persona Advisor** — Expert help designing effective agent personas (`/agents` → persona-advisor)

## Usage Modes

### 🚀 Dispatch — Automated Tasks with Persona

```bash
claude --print --plugin-dir clawsouls-claude-plugin \
  "Review the changes in this PR for security issues"
```

### 💬 Channels — Persistent Multi-Turn Sessions

```bash
claude --output-format stream-json --plugin-dir clawsouls-claude-plugin
```

### 👁️ Remote Control — Oversight & Intervention

```bash
claude --resume <session-id>
# Soul Rollback activates automatically if drift is detected
```

### 🔄 One Persona, Everywhere

| Platform | How |
|----------|-----|
| **Claude Code** | This plugin — `/clawsouls:install` |
| **OpenClaw** | Native SOUL.md support |
| **Cursor / Windsurf** | MCP server via `.mcp.json` |
| **Any MCP Client** | `npx -y clawsouls-mcp@latest` |

## Links

- [ClawSouls Platform](https://clawsouls.ai)
- [MCP Server (npm)](https://www.npmjs.com/package/clawsouls-mcp)
- [Documentation](https://clawsouls.ai/docs/claude-code-plugin)
- [Soul Spec Standard](https://soulspec.org)

## License

MIT

# ClawSouls — Claude Code Plugin

AI agent persona management, safety verification, memory sync, and identity rollback for Claude Code.

**Powered by [Soul Spec](https://soulspec.org)** — the open standard for agent identity.

## Features

| Feature | Command | Description |
|---------|---------|-------------|
| 🎭 **Browse Personas** | `/clawsouls:browse` | Search and install personas from SoulHub |
| 📥 **Install Persona** | `/clawsouls:install` | Apply a persona to your project |
| 🔍 **SoulScan** | `/clawsouls:scan` | Verify persona safety (53 patterns) |
| ⏪ **Soul Rollback** | `/clawsouls:rollback` | Detect drift & restore identity |
| 🧠 **Swarm Memory** | `/clawsouls:memory` | Git-based memory sync & search |

## Installation

### From Official Marketplace
```bash
/plugin install clawsouls@claude-plugins-official
```

### From GitHub
```bash
/plugin marketplace add clawsouls/clawsouls-claude-plugin
/plugin install clawsouls
```

### Local Development
```bash
claude --plugin-dir ./clawsouls-claude-plugin
```

## Quick Start

```bash
# Browse available personas
/clawsouls:browse coding agents

# Install a persona
/clawsouls:install clawsouls/surgical-coder

# Verify safety
/clawsouls:scan

# Check memory status
/clawsouls:memory status

# Detect persona drift
/clawsouls:rollback status
```

## Skills (Auto-activated)

The plugin includes intelligent skills that Claude activates automatically:

- **Persona Manager** — Activates when discussing agent identity or Soul Spec files
- **SoulScan** — Activates when checking safety or after persona modifications
- **Swarm Memory** — Activates when managing memory files or syncing knowledge
- **Soul Rollback** — Activates when behavior seems inconsistent with persona

## Agents

- **Persona Advisor** — Expert help designing effective agent personas (`/agents` → persona-advisor)

## Usage Modes

ClawSouls works with all three Claude Code remote control mechanisms:

### 🚀 Dispatch — Automated Tasks with Persona

Run persona-driven tasks in CI/CD, cron jobs, or batch processing:

```bash
# PR review with surgical-coder persona
claude --print --plugin-dir clawsouls-claude-plugin \
  "Review the changes in this PR for security issues"

# GitHub Actions example
- name: AI Code Review
  run: |
    claude --print --plugin-dir clawsouls-claude-plugin \
      --allowedTools "Read,Grep,Glob" \
      "Review all changed files and report issues"
```

### 💬 Channels — Persistent Multi-Turn Sessions

Maintain persona across long-running, bidirectional sessions:

```bash
# Start a streaming session with persona
claude --output-format stream-json --plugin-dir clawsouls-claude-plugin

# The persona persists across all exchanges in the session
# Swarm Memory loads previous context automatically
# SoulScan monitors identity consistency throughout
```

Use cases: team Slack bots, iterative code review, long-horizon development tasks.

### 👁️ Remote Control — Oversight & Intervention

Monitor running agents and intervene when persona drift is detected:

```bash
# Attach to a running session
claude --resume <session-id>

# Soul Rollback activates automatically if drift is detected
# SoulScan provides real-time safety monitoring
# Human can redirect or correct the agent mid-execution
```

Use cases: enterprise deployments, compliance-required environments, debugging.

### 🔄 One Persona, Everywhere

The same SOUL.md works across all platforms:

| Platform | How |
|----------|-----|
| **Claude Code** | This plugin — `/clawsouls:install` |
| **OpenClaw** | Native SOUL.md support — always-on AI partner |
| **Claude Code CI/CD** | Dispatch mode — automated tasks |
| **Custom Apps** | Soul Spec MCP server — `npx soul-spec-mcp` |

Write once, deploy everywhere. That's the power of an open standard.

## What is Soul Spec?

[Soul Spec](https://soulspec.org) is an open standard for defining AI agent identity through simple files:

- **SOUL.md** — Personality & principles
- **IDENTITY.md** — Name, role, traits
- **STYLE.md** — Communication tone
- **AGENTS.md** — Workflow rules
- **soul.json** — Machine-readable metadata

## Links

- [ClawSouls Platform](https://clawsouls.ai)
- [SoulHub Marketplace](https://clawsouls.ai/marketplace)
- [Soul Spec Standard](https://soulspec.org)
- [Documentation](https://docs.clawsouls.ai)
- [SoulScan CLI](https://www.npmjs.com/package/clawsouls)

## License

MIT

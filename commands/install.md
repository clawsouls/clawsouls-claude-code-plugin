---
description: Install and apply an agent persona from ClawSouls to this project
---

# Install Agent Persona

Install a Soul Spec persona and apply it to the current project.

## Steps

1. Use the `soul_install` MCP tool with soul_id "$ARGUMENTS"
2. After installation, export the persona to CLAUDE.md format:
   - Read the installed SOUL.md, IDENTITY.md, STYLE.md, AGENTS.md files
   - Merge them into the project's CLAUDE.md (or create one)
   - Preserve any existing CLAUDE.md content under a "## Project Instructions" section
3. Report what was installed and applied

## Examples

- `/clawsouls:install clawsouls/brad` — Install Brad persona
- `/clawsouls:install clawsouls/surgical-coder` — Install Surgical Coder

---
description: Install and apply an agent persona from ClawSouls to this project
---

# Install Agent Persona

Install a Soul Spec persona and apply it to the current project.

## Steps

1. Split "$ARGUMENTS" (`owner/name`) and call the `soul_install` MCP tool with `owner` and `name`
2. The tool merges the persona into the project's CLAUDE.md inside
   `<!-- clawsouls:soul:start -->` / `<!-- clawsouls:soul:end -->` markers:
   - No CLAUDE.md → it is created
   - Existing CLAUDE.md → the user's content is kept; a previous ClawSouls block is replaced
   Do not rewrite CLAUDE.md yourself.
3. Report what was installed and what the tool said it did (created / replaced / added)

## Examples

- `/clawsouls:install clawsouls/brad` — Install Brad persona
- `/clawsouls:install clawsouls/surgical-coder` — Install Surgical Coder

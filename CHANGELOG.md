# Changelog

## Unreleased

- **`/clawsouls:install` no longer wipes CLAUDE.md** — with `clawsouls-mcp` 0.4.2 the persona is merged inside `clawsouls:soul` markers; the command no longer asks the agent to rewrite CLAUDE.md itself.
- **Docs** — README now matches the shipped plugin: real commands (`install`, `browse`, `scan`, `rollback`, `memory`, `migrate` — `load-soul` / `activate` / `export` never shipped), real skills and agent, `clawsouls-mcp` with its 9 tools (was `soul-spec-mcp`, 12), marketplace install as the recommended path, `clawsouls/brad` as the example ID (`TomLeeLive/brad` is not in the registry), CLI-only option via `clawsouls install --use claude-code`, and removed dead links (Railway MCP endpoint, migration guide page).

## 1.1.0

- **License** — unified to Apache-2.0 across `plugin.json`, `marketplace.json`, and the README, and added the full `LICENSE` file. (Previously `plugin.json` declared `MIT` while the README claimed Apache 2.0, and no `LICENSE` file existed.)
- **Marketplace install** — documented the git-based marketplace flow and fixed the install command to `/plugin install clawsouls@clawsouls` (the marketplace name is `clawsouls`, not `claude-code-plugin`).
- **Channel Reply Guard** — the Stop hook now writes an audit trail to `~/.clawsouls/channel-reply-audit.jsonl` for every nudge and for any reply that slipped through after the single nudge, capturing the channel `source` / `chat_id` / `message_id`. Added a test suite (`test/channel-reply-guard.test.js`).
- **Docs** — README polish: corrected the local-dev `--plugin-dir` example and linked the `LICENSE` file.

## 1.0.0

- Initial release: persona management, SoulScan safety verification, Swarm Memory sync, Soul Rollback, and active memory recall for Claude Code.

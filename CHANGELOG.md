# Changelog

## 1.1.0

- **License** — unified to Apache-2.0 across `plugin.json`, `marketplace.json`, and the README, and added the full `LICENSE` file. (Previously `plugin.json` declared `MIT` while the README claimed Apache 2.0, and no `LICENSE` file existed.)
- **Marketplace install** — documented the git-based marketplace flow and fixed the install command to `/plugin install clawsouls@clawsouls` (the marketplace name is `clawsouls`, not `claude-code-plugin`).
- **Channel Reply Guard** — the Stop hook now writes an audit trail to `~/.clawsouls/channel-reply-audit.jsonl` for every nudge and for any reply that slipped through after the single nudge, capturing the channel `source` / `chat_id` / `message_id`. Added a test suite (`test/channel-reply-guard.test.js`).
- **Docs** — README polish: corrected the local-dev `--plugin-dir` example and linked the `LICENSE` file.

## 1.0.0

- Initial release: persona management, SoulScan safety verification, Swarm Memory sync, Soul Rollback, and active memory recall for Claude Code.

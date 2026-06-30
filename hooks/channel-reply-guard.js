#!/usr/bin/env node
/**
 * ClawSouls — Channel Reply Guard (Stop hook)
 *
 * When the current turn arrived from a chat channel (Claude Code Channels:
 * telegram / discord / fakechat / anvil, etc.), the sender reads that channel,
 * NOT the terminal. It's easy for the agent to answer in terminal text and
 * forget to call the channel's reply tool — the human then never sees it.
 *
 * This Stop hook enforces the rule: if the last user message came from a
 * channel and the agent did not call a *reply tool this turn, block the stop
 * (exit 2) and remind it to send the answer through the channel.
 *
 * Generic by design — no hardcoded channel, chat id, or project:
 *   - Detects the channel from the `<channel source="...">` marker Claude Code
 *     wraps channel messages in.
 *   - Pure terminal turns (no channel marker) pass through untouched.
 *   - Any tool whose name contains "reply" counts as the channel response.
 *   - `stop_hook_active` guard prevents an infinite stop loop (one nudge).
 */
'use strict';
const fs = require('fs');

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(x => (x && typeof x.text === 'string') ? x.text : '').join('\n');
  }
  return '';
}

function main() {
  let data;
  try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

  // Avoid infinite loop: if we already nudged once, let it stop.
  if (data.stop_hook_active) process.exit(0);

  const tp = data.transcript_path;
  if (!tp) process.exit(0);

  let lines;
  try {
    lines = fs.readFileSync(tp, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { process.exit(0); }

  // Find the last real user message.
  let lastUser = -1;
  for (let i = 0; i < lines.length; i++) {
    const msg = lines[i].message;
    if (msg && msg.role === 'user') lastUser = i;
  }
  if (lastUser < 0) process.exit(0);

  // Did this turn arrive from a channel? Look for the <channel source="..."> marker.
  const userText = extractText(lines[lastUser].message.content);
  const m = userText.match(/<channel\s+source="([^"]+)"/);
  if (!m) process.exit(0); // pure terminal turn — nothing to enforce
  const source = m[1];

  // After that user message, did the agent call any *reply tool?
  let replied = false;
  for (let i = lastUser + 1; i < lines.length; i++) {
    const msg = lines[i].message;
    if (!msg || msg.role !== 'assistant') continue;
    const c = msg.content;
    if (!Array.isArray(c)) continue;
    for (const x of c) {
      if (x && x.type === 'tool_use' && typeof x.name === 'string' && /reply/i.test(x.name)) {
        replied = true;
      }
    }
  }
  if (replied) process.exit(0);

  process.stderr.write(
    `[Channel Reply Guard] This turn arrived from channel "${source}", whose sender ` +
    `reads that channel — not the terminal. You did not call a reply tool this turn. ` +
    `Send this response back through the channel's reply tool before finishing.\n`
  );
  process.exit(2);
}

main();

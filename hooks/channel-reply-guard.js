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
 *
 * Auditability (added v1.1.0):
 *   - Every nudge and every miss-that-slipped-through (the agent ignored the one
 *     nudge) is appended as JSONL to ~/.clawsouls/channel-reply-audit.jsonl, so
 *     dropped replies are recoverable after the fact instead of vanishing.
 *   - The channel source / chat_id / message_id are captured when present.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(x => (x && typeof x.text === 'string') ? x.text : '').join('\n');
  }
  return '';
}

// Append a JSONL audit record. Never throws — auditing must not break the hook.
function auditLog(record) {
  try {
    const dir = path.join(os.homedir(), '.clawsouls');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'channel-reply-audit.jsonl'),
      JSON.stringify({ time: new Date().toISOString(), ...record }) + '\n'
    );
  } catch { /* auditing is best-effort */ }
}

// Pull an attribute value out of the <channel ...> marker, if present.
function markerAttr(text, attr) {
  const m = text.match(new RegExp('<channel\\b[^>]*\\b' + attr + '="([^"]+)"'));
  return m ? m[1] : null;
}

function main() {
  let data;
  try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

  const tp = data.transcript_path;
  if (!tp) process.exit(0);

  let lines;
  try {
    lines = fs.readFileSync(tp, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { process.exit(0); }

  // Find the last real user PROMPT. Claude Code stores tool_result messages
  // with role=user too, so a turn that ends in a tool call would otherwise pin
  // lastUser to a tool_result (which carries no <channel> marker) and slip
  // through. Skip tool_result-only messages to find the actual prompt.
  let lastUser = -1;
  for (let i = 0; i < lines.length; i++) {
    const msg = lines[i].message;
    if (!msg || msg.role !== 'user') continue;
    const c = msg.content;
    const isToolResult = Array.isArray(c) && c.length > 0 && c.every(x => x && x.type === 'tool_result');
    if (isToolResult) continue;
    lastUser = i;
  }
  if (lastUser < 0) process.exit(0);

  // Did this turn arrive from a channel? Look for the <channel source="..."> marker.
  const userText = extractText(lines[lastUser].message.content);
  const source = markerAttr(userText, 'source');
  if (!source) process.exit(0); // pure terminal turn — nothing to enforce
  const chatId = markerAttr(userText, 'chat_id');
  const messageId = markerAttr(userText, 'message_id');

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

  // No reply was sent through the channel.
  const ctx = { source, chat_id: chatId, message_id: messageId };

  // If we already nudged once this turn, let the stop proceed to avoid an
  // infinite loop — but record the miss so it isn't silently lost.
  if (data.stop_hook_active) {
    auditLog({ event: 'reply_missed_after_nudge', ...ctx });
    process.exit(0);
  }

  auditLog({ event: 'nudged', ...ctx });
  process.stderr.write(
    `[Channel Reply Guard] This turn arrived from channel "${source}"` +
    (chatId ? ` (chat_id ${chatId})` : '') +
    `, whose sender reads that channel — not the terminal. You did not call a reply ` +
    `tool this turn. Send this response back through the channel's reply tool before finishing.\n`
  );
  process.exit(2);
}

main();

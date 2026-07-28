#!/usr/bin/env node
/**
 * Tests for hooks/channel-reply-guard.js (Stop hook).
 *
 * Runs the hook as a subprocess with a synthesized transcript + stdin payload
 * and asserts the exit code:
 *   exit 0 = let the session stop (nothing to enforce, or reply was sent)
 *   exit 2 = block the stop and nudge (channel turn with no reply tool call)
 *
 * HOME is redirected to a temp dir so the audit log doesn't touch the real
 * ~/.clawsouls. Run: `node test/channel-reply-guard.test.js`
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, '..', 'hooks', 'channel-reply-guard.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crg-test-'));

let passed = 0;
let failed = 0;

function writeTranscript(name, msgs) {
  const p = path.join(TMP, name + '.jsonl');
  fs.writeFileSync(p, msgs.map(m => JSON.stringify({ message: m })).join('\n') + '\n');
  return p;
}

// Returns the hook's exit code for a given transcript + stop_hook_active flag.
function runHook(transcriptPath, stopHookActive) {
  try {
    execFileSync('node', [HOOK], {
      input: JSON.stringify({ transcript_path: transcriptPath, stop_hook_active: !!stopHookActive }),
      env: { ...process.env, HOME: TMP },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 0;
  } catch (e) {
    return typeof e.status === 'number' ? e.status : -1;
  }
}

function expect(label, actual, wanted) {
  if (actual === wanted) {
    passed++;
    console.log(`  ok   ${label} (exit ${actual})`);
  } else {
    failed++;
    console.log(`  FAIL ${label} — expected exit ${wanted}, got ${actual}`);
  }
}

const channelMsg = { role: 'user', content: '<channel source="telegram" chat_id="123" message_id="7">what is the binary size?</channel>' };
const terminalMsg = { role: 'user', content: 'just a normal terminal prompt' };
const replyCall = { role: 'assistant', content: [{ type: 'tool_use', name: 'mcp__telegram__reply', input: { chat_id: '123', text: 'hi' } }] };
const nonReplyCall = { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] };
const toolResult = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] };

console.log('channel-reply-guard tests:');

// A. Pure terminal turn → pass through (exit 0)
expect('terminal turn passes through',
  runHook(writeTranscript('A', [terminalMsg, nonReplyCall]), false), 0);

// B. Channel turn WITH a reply tool call → satisfied (exit 0)
expect('channel turn with reply passes',
  runHook(writeTranscript('B', [channelMsg, replyCall]), false), 0);

// C. Channel turn, NO reply, first stop → nudge (exit 2)
expect('channel turn without reply nudges',
  runHook(writeTranscript('C', [channelMsg, nonReplyCall]), false), 2);

// D. Channel turn, NO reply, but already nudged once → let it stop (exit 0)
expect('missed reply after nudge lets stop proceed',
  runHook(writeTranscript('D', [channelMsg, nonReplyCall]), true), 0);

// E. Channel turn ending in a tool_result (last user msg is a tool_result) →
//    must still find the channel prompt and nudge (exit 2)
expect('tool_result tail still enforces channel prompt',
  runHook(writeTranscript('E', [channelMsg, nonReplyCall, toolResult]), false), 2);

// F. Reply sent to an EARLIER message, then a new channel msg with no reply →
//    the later unanswered channel prompt must still nudge (exit 2)
expect('reply before the last channel prompt does not count',
  runHook(writeTranscript('F', [channelMsg, replyCall, channelMsg, nonReplyCall]), false), 2);

// Audit log should have recorded the nudge/miss events (C, D, E, F).
let auditOk = false;
try {
  const log = fs.readFileSync(path.join(TMP, '.clawsouls', 'channel-reply-audit.jsonl'), 'utf8').trim().split('\n');
  const events = log.map(l => JSON.parse(l));
  const nudges = events.filter(e => e.event === 'nudged').length;
  const misses = events.filter(e => e.event === 'reply_missed_after_nudge').length;
  auditOk = nudges >= 3 && misses >= 1 && events.every(e => e.source === 'telegram' && e.chat_id === '123');
  console.log(`  audit: ${nudges} nudged, ${misses} missed-after-nudge`);
} catch (e) {
  console.log('  audit: log not found — ' + e.message);
}
expect('audit log records events with channel context', auditOk, true);

// Cleanup
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * ClawSouls — Soul Recall: Pre-Compaction Memory Flush (PreCompact hook)
 *
 * Compaction summarizes/drops the live transcript. Anything the agent learned
 * this session but did NOT write to a memory file is lost. Soul Recall's whole
 * premise is "stop forgetting what you wrote down" — but it can only retrieve
 * what was actually persisted. This hook closes that gap: right before
 * compaction it reminds the agent to flush unsaved decisions/findings to the
 * daily log, and points it at the exact file (today's memory/YYYY-MM-DD.md) with
 * its current state (missing / last updated N min ago) so the reminder is
 * actionable rather than generic.
 *
 * Output is plain-text context (like memory-retrieve). Always exits 0 — a hook
 * must never block or fail compaction.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Reuse the store-locator (native + cwd/memory junction, Windows path encoding,
// realpath dedup) so this hook sees exactly the same memory dirs as retrieval.
let memoryRoots;
try { ({ memoryRoots } = require('./memory-retrieve.js')); } catch { memoryRoots = null; }

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function findDailyLog(cwd, stamp) {
  if (!memoryRoots) return null;
  let roots = [];
  try { roots = memoryRoots(cwd); } catch { return null; }
  for (const r of roots) {
    const f = path.join(r, `${stamp}.md`);
    try { const st = fs.statSync(f); if (st.isFile()) return { f, mtimeMs: st.mtimeMs }; } catch {}
  }
  // Not found — return the preferred write location (first memory root; roots
  // from memoryRoots() are already memory dirs).
  return { f: path.join(roots[0] || path.join(cwd, 'memory'), `${stamp}.md`), mtimeMs: null };
}

function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch {}
  const cwd = input.cwd || process.cwd();
  const trigger = input.trigger || 'manual'; // 'manual' (/compact) | 'auto' (context full)
  const stamp = todayStamp();
  const log = findDailyLog(cwd, stamp);

  let where;
  if (!log) {
    where = `today's daily log (memory/${stamp}.md)`;
  } else if (log.mtimeMs == null) {
    where = `${log.f} (NOT yet created today)`;
  } else {
    const mins = Math.round((Date.now() - log.mtimeMs) / 60000);
    where = `${log.f} (last updated ~${mins} min ago)`;
  }

  const out =
    `🧠 Soul Recall — pre-compaction memory flush (${trigger}):\n` +
    `Compaction is about to summarize and drop the live transcript. Before it runs, ` +
    `persist any UNSAVED session knowledge — decisions made, problems solved, ` +
    `gotchas/workarounds discovered — to ${where}. ` +
    `Also leave a one-line "next step" for the work in progress so it survives the summary.\n`;

  process.stdout.write(out);
  process.exit(0);
}

if (require.main === module) main();

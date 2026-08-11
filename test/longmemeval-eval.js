#!/usr/bin/env node
'use strict';
/**
 * LongMemEval-S retrieval evaluation for Soul Recall (keyword ranker).
 *
 * Task: per instance, rank haystack sessions for the question with the SAME
 * production code path (hooks/memory-retrieve.js keywordScored), then measure
 * evidence-session Recall@k against answer_session_ids.
 * This matches the retrieval-stage metric published by e.g. agentmemory
 * ("LongMemEval-S R@5"). Answer generation (reader LLM) is out of scope here.
 *
 * Fairness notes:
 *  - Session files are named by opaque index (s0007.md) so evidence-marking
 *    ids ("answer_...") can never leak tokens into filename/name boosts.
 *  - No frontmatter is added: name defaults to basename, uniform for all.
 *  - All files share one mtime → recency factor is uniform.
 *
 * Usage: node test/longmemeval-eval.js <longmemeval_s.json> [--limit N] [--out results.json]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../hooks/memory-retrieve.js');

const KS = [1, 3, 5, 10];

function fmtSession(turns) {
  return turns.map(t => `${t.role}: ${t.content}`).join('\n\n');
}

function evalInstance(inst, workRoot) {
  const dir = fs.mkdtempSync(path.join(workRoot, 'lme-'));
  const idToFile = new Map(); // base -> session_id
  try {
    inst.haystack_sessions.forEach((turns, i) => {
      const base = `s${String(i).padStart(4, '0')}.md`;
      fs.writeFileSync(path.join(dir, base), fmtSession(turns));
      idToFile.set(base, inst.haystack_session_ids[i]);
    });
    const r = R.keywordScored(inst.question, dir);
    const rankedSids = r ? r.fileHits.map(h => idToFile.get(h.base)).filter(Boolean) : [];
    const evidence = new Set(inst.answer_session_ids || []);
    const out = {};
    for (const k of KS) {
      const top = new Set(rankedSids.slice(0, k));
      let hit = 0;
      for (const e of evidence) if (top.has(e)) hit++;
      out[`r@${k}`] = evidence.size ? hit / evidence.size : null;       // evidence recall
      out[`hit@${k}`] = evidence.size ? ([...evidence].some(e => top.has(e)) ? 1 : 0) : null; // any-evidence hit
    }
    return { qid: inst.question_id, type: inst.question_type, n_sessions: inst.haystack_sessions.length, n_evidence: evidence.size, ...out };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  const dataPath = args[0];
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : null;
  const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const insts = limit ? data.slice(0, limit) : data;
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lme-work-'));

  const rows = [];
  const t0 = Date.now();
  for (let i = 0; i < insts.length; i++) {
    // abstention instances (question_id ends with _abs) have no valid evidence — skip for recall
    if (String(insts[i].question_id).endsWith('_abs')) continue;
    rows.push(evalInstance(insts[i], workRoot));
    if ((i + 1) % 50 === 0) console.error(`${i + 1}/${insts.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  fs.rmSync(workRoot, { recursive: true, force: true });

  const agg = (list) => {
    const o = { n: list.length };
    for (const k of KS) {
      const rv = list.map(r => r[`r@${k}`]).filter(v => v !== null);
      const hv = list.map(r => r[`hit@${k}`]).filter(v => v !== null);
      o[`recall@${k}`] = +(rv.reduce((s, v) => s + v, 0) / rv.length * 100).toFixed(1);
      o[`hit@${k}`] = +(hv.reduce((s, v) => s + v, 0) / hv.length * 100).toFixed(1);
    }
    return o;
  };
  const byType = {};
  for (const r of rows) (byType[r.type] = byType[r.type] || []).push(r);

  const summary = { engine: 'soul-recall keywordScored (production path)', dataset: path.basename(dataPath), overall: agg(rows) };
  for (const [t, list] of Object.entries(byType)) summary[t] = agg(list);
  console.log(JSON.stringify(summary, null, 2));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2));
}

main();

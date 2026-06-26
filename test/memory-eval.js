#!/usr/bin/env node
/**
 * Soul Recall — retrieval ablation harness.
 *
 * Measures recall@1/3/5 + MRR for each ranking config (keyword / semantic / RRF)
 * over test/memory-eval-set.json, using the SAME rankers the live hook uses
 * (imported from ../hooks/memory-retrieve.js). Produces the data to decide
 * whether RRF (or any candidate) actually beats the current configs —
 * "measure, don't assume."
 *
 * Usage: node test/memory-eval.js [--cwd <projectDir>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../hooks/memory-retrieve.js');

const RRF_K = 60, KS = [1, 3, 5];
function argCwd() {
  const i = process.argv.indexOf('--cwd');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}
const baseRef = s => s ? path.basename(String(s)).replace(/\.md$/i, '') : null;
const lineRef = line => { const m = String(line).match(/\(([^)]+\.md)\)/); return m ? baseRef(m[1]) : null; };

// Ordered, de-duplicated list of file-refs for a config.
function dedupe(refs) { const seen = new Set(), out = []; for (const r of refs) { if (r && !seen.has(r)) { seen.add(r); out.push(r); } } return out; }

function keywordRefs(prompt, cwd) {
  const r = R.keywordScored(prompt, cwd);
  if (!r) return [];
  const merged = [
    ...r.fileHits.map(h => ({ s: h.s, ref: baseRef(h.base || h.rel) })),
    ...r.idxLines.map(l => ({ s: l.s, ref: lineRef(l.line) })),
  ].filter(x => x.ref).sort((a, b) => b.s - a.s);
  return dedupe(merged.map(x => x.ref));
}
async function semanticRefs(prompt) {
  const scored = await R.semanticScored(prompt);
  if (!scored) return [];
  return dedupe(scored.map(({ it }) => it.kind === 'index' ? lineRef(it.line) : baseRef(it.rel)));
}
function rrf(...lists) {
  const score = Object.create(null);
  for (const list of lists) list.forEach((ref, i) => { score[ref] = (score[ref] || 0) + 1 / (RRF_K + i); });
  return Object.keys(score).sort((a, b) => score[b] - score[a]);
}

function rankOf(refs, expect) { return refs.findIndex(r => r.includes(expect) || expect.includes(r)); }

async function main() {
  const cwd = argCwd();
  const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'memory-eval-set.json'), 'utf8')).cases;
  const configs = { keyword: [], semantic: [], rrf: [] };
  const misses = { keyword: [], semantic: [], rrf: [] };

  for (const c of set) {
    const kw = keywordRefs(c.q, cwd);
    const sem = await semanticRefs(c.q);
    const fused = rrf(sem, kw);
    for (const [name, refs] of [['keyword', kw], ['semantic', sem], ['rrf', fused]]) {
      const rank = rankOf(refs, c.expect);
      configs[name].push(rank);
      if (rank < 0 || rank >= 5) misses[name].push(`${c.expect}${rank < 0 ? '(none)' : '(@' + (rank + 1) + ')'}`);
    }
  }

  const N = set.length;
  const pct = n => (100 * n / N).toFixed(0) + '%';
  const recallAt = (ranks, k) => ranks.filter(r => r >= 0 && r < k).length;
  const mrr = ranks => (ranks.reduce((s, r) => s + (r >= 0 ? 1 / (r + 1) : 0), 0) / N).toFixed(3);

  console.log(`\nSoul Recall retrieval ablation — N=${N} queries\n`);
  console.log('config    | R@1   R@3   R@5   | MRR');
  console.log('----------|-------------------|------');
  for (const name of ['keyword', 'semantic', 'rrf']) {
    const r = configs[name];
    console.log(`${name.padEnd(9)} | ${pct(recallAt(r,1)).padEnd(5)} ${pct(recallAt(r,3)).padEnd(5)} ${pct(recallAt(r,5)).padEnd(5)} | ${mrr(r)}`);
  }
  console.log('\nmisses (expected not in top-5):');
  for (const name of ['keyword', 'semantic', 'rrf'])
    console.log(`  ${name}: ${misses[name].length ? misses[name].join(', ') : '— none —'}`);
}
main().catch(e => { console.error(e); process.exit(1); });

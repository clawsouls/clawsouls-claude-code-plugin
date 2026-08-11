#!/usr/bin/env node
'use strict';
/**
 * LongMemEval-S retrieval evaluation for Soul Recall — SEMANTIC ranker.
 *
 * Scoring path mirrors production hooks/memory-retrieve.js semantics:
 * same endpoint (/api/embeddings), same model (bge-m3), same 2000-char
 * document truncation as the production embed(), same cosine. The only
 * deviation is the client timeout (production uses a 6s interactive guard;
 * offline batch relaxes it) — request parameters are identical.
 *
 * Sessions are embedded once globally (cached by haystack_session_id) since
 * LongMemEval haystacks share a session pool across instances.
 *
 * Usage: node test/longmemeval-semantic.js <longmemeval_s.json> [--limit N] [--out results.json]
 */
const fs = require('fs');
const http = require('http');
const R = require('../hooks/memory-retrieve.js');

const OLLAMA = process.env.CLAWSOULS_OLLAMA || 'http://127.0.0.1:11434';
const MODEL = R.MODEL || 'bge-m3';
const KS = [1, 3, 5, 10];

function embed(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, prompt: String(text).slice(0, 2000) });
    const req = http.request(new URL('/api/embeddings', OLLAMA),
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 180000 },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const j = JSON.parse(d); j.embedding && j.embedding.length ? resolve(j.embedding) : reject(new Error('no embedding')); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}

function fmtSession(turns) {
  return turns.map(t => `${t.role}: ${t.content}`).join('\n\n');
}

async function main() {
  const args = process.argv.slice(2);
  const dataPath = args[0];
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : null;
  const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  let data = JSON.parse(fs.readFileSync(dataPath, 'utf8')).filter(x => !String(x.question_id).endsWith('_abs'));
  if (limit) data = data.slice(0, limit);

  const cache = new Map(); // sid -> embedding
  async function sessionEmb(sid, turns) {
    if (!cache.has(sid)) cache.set(sid, await embed(fmtSession(turns)));
    return cache.get(sid);
  }

  const rows = [];
  const t0 = Date.now();
  for (let i = 0; i < data.length; i++) {
    const inst = data[i];
    const q = await embed(inst.question);
    const scored = [];
    for (let j = 0; j < inst.haystack_sessions.length; j++) {
      const sid = inst.haystack_session_ids[j];
      const e = await sessionEmb(sid, inst.haystack_sessions[j]);
      scored.push({ sid, s: R.cosine(q, e) });
    }
    scored.sort((a, b) => b.s - a.s);
    const ranked = scored.map(x => x.sid);
    const evidence = new Set(inst.answer_session_ids || []);
    const out = {};
    for (const k of KS) {
      const top = new Set(ranked.slice(0, k));
      let hit = 0;
      for (const e of evidence) if (top.has(e)) hit++;
      out[`r@${k}`] = evidence.size ? hit / evidence.size : null;
      out[`hit@${k}`] = evidence.size ? ([...evidence].some(e => top.has(e)) ? 1 : 0) : null;
    }
    rows.push({ qid: inst.question_id, type: inst.question_type, n_evidence: evidence.size, ...out });
    if ((i + 1) % 10 === 0) console.error(`${i + 1}/${data.length}  cache=${cache.size}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

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
  const summary = { engine: `soul-recall semantic (bge-m3 embed + cosine, production params)`, dataset: require('path').basename(dataPath), overall: agg(rows) };
  for (const [t, list] of Object.entries(byType)) summary[t] = agg(list);
  console.log(JSON.stringify(summary, null, 2));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2));
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

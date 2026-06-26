#!/usr/bin/env node
/**
 * ClawSouls — Auto Memory Retrieval (UserPromptSubmit hook)
 *
 * Turns the plugin's PASSIVE memory (MEMORY.md + memory/*.md, searched manually
 * via /clawsouls:memory) into ACTIVE memory: on every user prompt, the most
 * relevant memory pointers are auto-retrieved and injected as context — so the
 * agent stops "forgetting" things it already wrote down.
 *
 * Ranking (Phase 2, dependency-free):
 *   - IDF weighting       — ubiquitous terms (brad, openclaw, clawsouls, tom…)
 *                           carry almost no signal; rare terms dominate.
 *   - BM25-style length norm — long files don't win just by being long.
 *   - Field boosting      — a hit in a memory's `name:` / `description:` / title
 *                           counts far more than a hit deep in the body.
 *   - Recency boost       — recently-touched memory ranks slightly higher
 *                           (a cheap freshness/superseding proxy).
 * A later phase can add a semantic (bge-m3) fallback for conceptual queries.
 *
 * Input  (stdin JSON): { prompt, cwd, session_id, ... }   (Claude Code UserPromptSubmit)
 * Output (stdout): plain-text context block (added to the turn on exit 0).
 *                  Empty output / exit 0 when nothing relevant — never blocks.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const TOP_INDEX = 5;     // MEMORY.md index lines to surface
const TOP_FILES = 3;     // individual memory files to surface
const MAX_CHARS = 1800;  // token budget guard for the injected block
const BM25_K = 1.2, BM25_B = 0.75;
const FIELD_BOOST = 3.0; // name/description hit weight vs body
const TITLE_BOOST = 1.8; // index-line title (**bold** / [link]) hit weight

const STOP = new Set(
  ('the a an an and or but if of to in on for with is are was were be been this that it its as at by from your you i we our us my me do does done how what why when where which who will can should could would not no yes get got make made just now then so what when where 그 이 저 의 를 을 가 은 는 에 와 과 도 로 으로 좀 그리고 근데 해줘 해 했 함 임 있 없 거 게 건 줘 봐 보 또 더 잘 좀 다 등 및')
    .split(/\s+/)
);

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }
function tokenize(s) {
  return (String(s).toLowerCase().match(/[a-z0-9가-힣]{2,}/g) || []).filter(t => !STOP.has(t));
}

function memoryRoots(cwd) {
  const roots = new Set();
  if (cwd) {
    roots.add(cwd);
    roots.add(path.join(cwd, 'memory'));
    const enc = cwd.replace(/\//g, '-');
    roots.add(path.join(os.homedir(), '.claude', 'projects', enc, 'memory'));
  }
  return [...roots];
}

function collectFiles(roots) {
  const files = new Set();
  for (const r of roots) {
    try {
      if (fs.statSync(r).isDirectory())
        for (const f of fs.readdirSync(r)) if (f.endsWith('.md')) files.add(path.join(r, f));
    } catch {}
    try { const m = path.join(r, 'MEMORY.md'); if (fs.statSync(m).isFile()) files.add(m); } catch {}
  }
  return [...files];
}

// Recency multiplier from mtime: ~1.0 (old) … ~1.35 (just touched). Cheap freshness signal.
function recency(mtimeMs, nowMs) {
  const ageDays = Math.max(0, (nowMs - mtimeMs) / 86400000);
  return 1 + 0.35 * Math.exp(-ageDays / 30);
}

function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch {}
  const prompt = input.prompt || '';
  const cwd = input.cwd || process.cwd();

  const qtokens = tokenize(prompt);
  if (qtokens.length < 2) process.exit(0);
  const qset = new Set(qtokens);

  const files = collectFiles(memoryRoots(cwd));
  if (!files.length) process.exit(0);

  // ---- Pass 1: load corpus, compute document frequency (for IDF) ----
  const docs = []; // { file, base, content, toks, len, mtime, isIndex }
  const df = Object.create(null);
  let nowMs = Date.now();
  for (const f of files) {
    let content = '', mtime = 0;
    try { content = fs.readFileSync(f, 'utf8'); mtime = fs.statSync(f).mtimeMs; } catch { continue; }
    const toks = tokenize(content);
    const base = path.basename(f);
    docs.push({ file: f, base, content, toks, len: toks.length || 1, mtime, isIndex: base === 'MEMORY.md' });
    const seen = new Set(toks);
    for (const t of seen) df[t] = (df[t] || 0) + 1;
  }
  if (!docs.length) process.exit(0);
  const N = docs.length;
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / N;
  const idf = t => Math.log((N - (df[t] || 0) + 0.5) / ((df[t] || 0) + 0.5) + 1); // BM25 idf

  // ---- Pass 2a: rank MEMORY.md index lines (one pointer per line) ----
  const indexLines = [];
  for (const d of docs) {
    if (!d.isIndex) continue;
    for (const raw of d.content.split('\n')) {
      const l = raw.trim();
      if (!l.startsWith('- ')) continue;
      const lineToks = tokenize(l);
      if (!lineToks.length) continue;
      const titleText = (l.match(/\*\*(.+?)\*\*/g) || []).join(' ') + ' ' + (l.match(/\[(.+?)\]/g) || []).join(' ');
      const titleToks = new Set(tokenize(titleText));
      let s = 0;
      const present = new Set(lineToks);
      for (const t of qset) {
        if (!present.has(t)) continue;
        s += idf(t) * (titleToks.has(t) ? TITLE_BOOST : 1);
      }
      if (s > 0) indexLines.push({ s, line: l });
    }
  }
  indexLines.sort((a, b) => b.s - a.s);
  const topIndex = indexLines.slice(0, TOP_INDEX);

  // ---- Pass 2b: rank individual memory files (BM25 + field boost + recency) ----
  const fileHits = [];
  for (const d of docs) {
    if (d.isIndex) continue;
    const desc = (d.content.match(/^description:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    const name = (d.content.match(/^name:\s*(.+?)\s*$/m) || [])[1] || d.base.replace(/\.md$/, '');
    const fieldToks = new Set(tokenize(name + ' ' + desc));
    // term frequencies in body
    const tf = Object.create(null);
    for (const t of d.toks) if (qset.has(t)) tf[t] = (tf[t] || 0) + 1;
    let s = 0;
    for (const t of qset) {
      const f = tf[t] || 0;
      if (f > 0) {
        // BM25 term score
        s += idf(t) * (f * (BM25_K + 1)) / (f + BM25_K * (1 - BM25_B + BM25_B * d.len / avgLen));
      }
      if (fieldToks.has(t)) s += idf(t) * FIELD_BOOST; // name/description hit
    }
    if (s <= 0) continue;
    s *= recency(d.mtime, nowMs);
    fileHits.push({ s, name, desc, rel: shortPath(d.file, cwd) });
  }
  fileHits.sort((a, b) => b.s - a.s);
  const topFiles = fileHits.slice(0, TOP_FILES);

  if (!topIndex.length && !topFiles.length) process.exit(0);

  let out = '🧠 Auto-retrieved memory (relevant to this prompt — verify before asserting; read the file for detail):\n';
  for (const it of topIndex) out += it.line + '\n';
  if (topFiles.length) {
    out += '\nRelated memory files:\n';
    for (const it of topFiles)
      out += `- ${it.name} (${it.rel})` + (it.desc ? ` — ${it.desc}` : '') + '\n';
  }
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS) + '\n…(truncated)';
  process.stdout.write(out);
  process.exit(0);
}

function shortPath(f, cwd) {
  if (cwd && f.startsWith(cwd + path.sep)) return f.slice(cwd.length + 1);
  return f.replace(os.homedir(), '~');
}

try { main(); } catch { process.exit(0); } // never break the turn

#!/usr/bin/env node
/**
 * ClawSouls — Soul Recall: Auto Memory Retrieval (UserPromptSubmit hook)
 *
 * Turns the plugin's PASSIVE memory (MEMORY.md + memory/*.md, searched manually)
 * into ACTIVE memory: on every user prompt, the most relevant memory is
 * auto-retrieved and injected as context — so the agent stops "forgetting"
 * what it already wrote down.
 *
 * Hybrid retrieval (semantic-primary, keyword-fallback):
 *   - PRIMARY  — bge-m3 semantic search over a precomputed embedding cache
 *                (built by memory-index.js). Bridges conceptual queries
 *                (e.g. "분기" → "형제/막내") that keyword search can't.
 *   - FALLBACK — BM25 keyword ranker (IDF + length norm + field/title boost +
 *                recency). Used when ollama is down or the cache is missing —
 *                pure-markdown, zero-dependency, always available.
 *
 * Input  (stdin JSON): { prompt, cwd, session_id, ... }   (UserPromptSubmit)
 * Output (stdout): plain-text context block (added to the turn on exit 0).
 *                  Empty output / exit 0 when nothing relevant — never blocks.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const TOP_INDEX = 5, TOP_FILES = 3, MAX_CHARS = 1800;
const BM25_K = 1.2, BM25_B = 0.75, FIELD_BOOST = 3.0, TITLE_BOOST = 1.8;
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODEL = process.env.CLAWSOULS_EMBED_MODEL || 'bge-m3';
const CACHE = path.join(os.homedir(), '.cache', 'clawsouls', 'memory-embeddings.json');

const STOP = new Set(
  ('the a an and or but if of to in on for with is are was were be been this that it its as at by from your you i we our us my me do does done how what why when where which who will can should could would not no yes get got make made just now then so 그 이 저 의 를 을 가 은 는 에 와 과 도 로 으로 좀 그리고 근데 해줘 해 했 함 임 있 없 거 게 건 줘 봐 보 또 더 잘 다 등 및')
    .split(/\s+/)
);

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }
function tokenize(s) { return (String(s).toLowerCase().match(/[a-z0-9가-힣]{2,}/g) || []).filter(t => !STOP.has(t)); }

function memoryRoots(cwd) {
  const roots = new Set([cwd, path.join(cwd, 'memory')]);
  roots.add(path.join(os.homedir(), '.claude', 'projects', cwd.replace(/\//g, '-'), 'memory'));
  return [...roots];
}
function collectFiles(roots) {
  const files = new Set();
  for (const r of roots) {
    try { if (fs.statSync(r).isDirectory()) for (const f of fs.readdirSync(r)) if (f.endsWith('.md')) files.add(path.join(r, f)); } catch {}
    try { const m = path.join(r, 'MEMORY.md'); if (fs.statSync(m).isFile()) files.add(m); } catch {}
  }
  return [...files];
}
function shortPath(f, cwd) { return cwd && f.startsWith(cwd + path.sep) ? f.slice(cwd.length + 1) : f.replace(os.homedir(), '~'); }

// ---------- SEMANTIC (primary) ----------
function embed(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, prompt: text.slice(0, 2000) });
    const req = http.request(new URL('/api/embeddings', OLLAMA),
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 6000 },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const j = JSON.parse(d); j.embedding && j.embedding.length ? resolve(j.embedding) : reject(); } catch { reject(); } }); });
    req.on('error', reject); req.on('timeout', () => req.destroy());
    req.write(body); req.end();
  });
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
async function semanticRank(prompt) {
  let cache;
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; }
  if (!cache || cache.model !== MODEL || !cache.items) return null;
  let q;
  try { q = await embed(prompt); } catch { return null; } // ollama down -> fallback
  const scored = [];
  for (const it of Object.values(cache.items)) {
    if (!it.emb || !it.emb.length) continue;
    scored.push({ s: cosine(q, it.emb), it });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.s - a.s);
  const idx = [], files = [];
  for (const { s, it } of scored) {
    if (s < 0.45) break; // relevance floor for bge-m3 cosine
    if (it.kind === 'index' && idx.length < TOP_INDEX) idx.push(it.line);
    else if (it.kind === 'file' && files.length < TOP_FILES) files.push(it);
    if (idx.length >= TOP_INDEX && files.length >= TOP_FILES) break;
  }
  if (!idx.length && !files.length) return null;
  return { mode: 'semantic', idx, files };
}

// ---------- KEYWORD (fallback) ----------
function keywordRank(prompt, cwd) {
  const qset = new Set(tokenize(prompt));
  if (qset.size < 2) return null;
  const files = collectFiles(memoryRoots(cwd));
  if (!files.length) return null;

  const docs = [], df = Object.create(null), nowMs = Date.now();
  for (const f of files) {
    let content = '', mtime = 0;
    try { content = fs.readFileSync(f, 'utf8'); mtime = fs.statSync(f).mtimeMs; } catch { continue; }
    const toks = tokenize(content), base = path.basename(f);
    docs.push({ f, base, content, toks, len: toks.length || 1, mtime, isIndex: base === 'MEMORY.md' });
    for (const t of new Set(toks)) df[t] = (df[t] || 0) + 1;
  }
  if (!docs.length) return null;
  const N = docs.length, avgLen = docs.reduce((s, d) => s + d.len, 0) / N;
  const idf = t => Math.log((N - (df[t] || 0) + 0.5) / ((df[t] || 0) + 0.5) + 1);
  const recency = m => 1 + 0.35 * Math.exp(-Math.max(0, (nowMs - m) / 86400000) / 30);

  const idxLines = [];
  for (const d of docs) {
    if (!d.isIndex) continue;
    for (const raw of d.content.split('\n')) {
      const l = raw.trim();
      if (!l.startsWith('- ')) continue;
      const present = new Set(tokenize(l));
      if (!present.size) continue;
      const titleToks = new Set(tokenize((l.match(/\*\*(.+?)\*\*/g) || []).join(' ') + ' ' + (l.match(/\[(.+?)\]/g) || []).join(' ')));
      let s = 0;
      for (const t of qset) if (present.has(t)) s += idf(t) * (titleToks.has(t) ? TITLE_BOOST : 1);
      if (s > 0) idxLines.push({ s, line: l });
    }
  }
  idxLines.sort((a, b) => b.s - a.s);

  const fileHits = [];
  for (const d of docs) {
    if (d.isIndex) continue;
    const desc = (d.content.match(/^description:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    const name = (d.content.match(/^name:\s*(.+?)\s*$/m) || [])[1] || d.base.replace(/\.md$/, '');
    const fieldToks = new Set(tokenize(name + ' ' + desc));
    const tf = Object.create(null);
    for (const t of d.toks) if (qset.has(t)) tf[t] = (tf[t] || 0) + 1;
    let s = 0;
    for (const t of qset) {
      const f = tf[t] || 0;
      if (f > 0) s += idf(t) * (f * (BM25_K + 1)) / (f + BM25_K * (1 - BM25_B + BM25_B * d.len / avgLen));
      if (fieldToks.has(t)) s += idf(t) * FIELD_BOOST;
    }
    if (s <= 0) continue;
    fileHits.push({ s: s * recency(d.mtime), name, desc, rel: shortPath(d.f, cwd) });
  }
  fileHits.sort((a, b) => b.s - a.s);
  const idx = idxLines.slice(0, TOP_INDEX).map(x => x.line);
  const files2 = fileHits.slice(0, TOP_FILES);
  if (!idx.length && !files2.length) return null;
  return { mode: 'keyword', idx, files: files2 };
}

function render(r) {
  let out = `🧠 Auto-retrieved memory [${r.mode}] (relevant to this prompt — verify before asserting; read the file for detail):\n`;
  for (const line of r.idx) out += line + '\n';
  if (r.files.length) {
    out += '\nRelated memory files:\n';
    for (const it of r.files) out += `- ${it.name} (${it.rel})` + (it.desc ? ` — ${it.desc}` : '') + '\n';
  }
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS) + '\n…(truncated)';
  return out;
}

async function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch {}
  const prompt = input.prompt || '';
  const cwd = input.cwd || process.cwd();
  if (tokenize(prompt).length < 2) process.exit(0);

  let r = null;
  try { r = await semanticRank(prompt); } catch {}      // PRIMARY
  if (!r) r = keywordRank(prompt, cwd);                  // FALLBACK
  if (!r) process.exit(0);

  process.stdout.write(render(r));
  process.exit(0);
}

main().catch(() => process.exit(0)); // never break the turn

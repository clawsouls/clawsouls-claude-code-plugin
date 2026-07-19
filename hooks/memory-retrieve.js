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
 *   - PRIMARY  — bge-m3 semantic search over a precomputed embedding cache.
 *   - FALLBACK — BM25 keyword ranker (IDF + length norm + field/title boost +
 *                recency). Used when ollama is down or the cache is missing.
 * Superseding/decay: archived/superseded memories are hidden; stale ones decay
 * and get a ⚠️ flag. See memory-index.js (cache builder).
 *
 * Exposes scored rankers (semanticScored / keywordScored) for the eval harness;
 * runs as the UserPromptSubmit hook when executed directly.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');

const TOP_INDEX = 5, TOP_FILES = 3, MAX_CHARS = 1800, SEM_FLOOR = 0.45;
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
  const projects = path.join(os.homedir(), '.claude', 'projects');
  // POSIX slash encoding — unchanged for macOS/Linux.
  roots.add(path.join(projects, cwd.replace(/\//g, '-'), 'memory'));
  // Windows: Claude Code encodes ALL non-alphanumerics (drive ':', '\\', '_') to '-'.
  // Added as an EXTRA root only — POSIX behavior is untouched (Set dedups when identical).
  roots.add(path.join(projects, cwd.replace(/[^a-zA-Z0-9]/g, '-'), 'memory'));
  // Dedup by REAL path: when native + cwd/memory are symlinks/junctions to the same
  // store, the string Set can't tell they're one dir, so every file gets read (and
  // injected) twice. Resolve each root; a non-existent root throws → keep raw string.
  const seen = new Set(), out = [];
  for (const r of roots) {
    let key = r;
    try { key = fs.realpathSync(r); } catch {}
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out;
}
function collectFiles(roots) {
  const files = new Set();
  const addMd = d => { try { for (const f of fs.readdirSync(d)) if (f.endsWith('.md')) files.add(path.join(d, f)); } catch {} };
  // Recurse subdirs ONLY inside a memory dir (archive/, daily-*/ ...) so archived
  // early memories are recall-able. NEVER recurse the project root (cwd) — that would
  // scan node_modules/src/etc. Existing decay/recency/staleness ranking keeps old
  // archived logs from dominating; they surface only when strongly relevant.
  const walkMem = d => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkMem(p);
      else if (e.name.endsWith('.md')) files.add(p);
    }
  };
  for (const r of roots) {
    try {
      if (!fs.statSync(r).isDirectory()) throw 0;
      if (path.basename(r) === 'memory') walkMem(r); else addMd(r);
    } catch {}
    try { const m = path.join(r, 'MEMORY.md'); if (fs.statSync(m).isFile()) files.add(m); } catch {}
  }
  return [...files];
}
function shortPath(f, cwd) { return cwd && f.startsWith(cwd + path.sep) ? f.slice(cwd.length + 1) : f.replace(os.homedir(), '~'); }

// ---------- superseding / decay ----------
const STALE_DAYS = 75;
const hidden = m => !!(m && (m.status === 'archived' || m.status === 'superseded' || m.supersededBy));
const isStale = (mtimeMs, status) => status === 'stale' || (!!mtimeMs && (Date.now() - mtimeMs) / 86400000 > STALE_DAYS);

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
// Full sorted scored list: [{ s, it }] (hidden filtered). null if cache/ollama unavailable.
async function semanticScored(prompt) {
  let cache;
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; }
  if (!cache || cache.model !== MODEL || !cache.items) return null;
  let q;
  try { q = await embed(prompt); } catch { return null; }
  const scored = [];
  for (const it of Object.values(cache.items)) {
    if (!it.emb || !it.emb.length || hidden(it)) continue;
    scored.push({ s: cosine(q, it.emb), it });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.s - a.s);
  return scored;
}
async function semanticRank(prompt) {
  const scored = await semanticScored(prompt);
  if (!scored) return null;
  const idx = [], files = [];
  for (const { s, it } of scored) {
    if (s < SEM_FLOOR) break;
    if (it.kind === 'index' && idx.length < TOP_INDEX) idx.push(it.line);
    else if (it.kind === 'file' && files.length < TOP_FILES) { it.stale = isStale(it.mtime, it.status); files.push(it); }
    if (idx.length >= TOP_INDEX && files.length >= TOP_FILES) break;
  }
  if (!idx.length && !files.length) return null;
  return { mode: 'semantic', idx, files };
}

// ---------- KEYWORD (fallback) ----------
// Full sorted lists: { idxLines:[{s,line}], fileHits:[{s,name,desc,rel,stale}] }. null if none.
function keywordScored(prompt, cwd) {
  const qset = new Set(tokenize(prompt));
  if (qset.size < 2) return null;
  const files = collectFiles(memoryRoots(cwd));
  if (!files.length) return null;

  const docs = [], df = Object.create(null), nowMs = Date.now();
  for (const f of files) {
    let content = '', mtime = 0;
    try { content = fs.readFileSync(f, 'utf8'); mtime = fs.statSync(f).mtimeMs; } catch { continue; }
    const base = path.basename(f);
    const status = ((content.match(/^status:\s*(\w+)/m) || [])[1] || '').toLowerCase();
    if (base !== 'MEMORY.md' && (status === 'archived' || status === 'superseded' || /^superseded_by:/m.test(content))) continue;
    const toks = tokenize(content);
    docs.push({ f, base, content, toks, len: toks.length || 1, mtime, status, isIndex: base === 'MEMORY.md' });
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
    fileHits.push({ s: s * recency(d.mtime) * (d.status === 'stale' ? 0.6 : 1), name, desc, rel: shortPath(d.f, cwd), base: d.base, stale: isStale(d.mtime, d.status) });
  }
  fileHits.sort((a, b) => b.s - a.s);
  if (!idxLines.length && !fileHits.length) return null;
  return { idxLines, fileHits };
}
function keywordRank(prompt, cwd) {
  const r = keywordScored(prompt, cwd);
  if (!r) return null;
  const idx = r.idxLines.slice(0, TOP_INDEX).map(x => x.line);
  const files = r.fileHits.slice(0, TOP_FILES);
  if (!idx.length && !files.length) return null;
  return { mode: 'keyword', idx, files };
}

// ---------- conditional flush nudge ----------
// Compaction silently drops whatever was never written to a memory file. The
// PreCompact hook is the LAST-RESORT reminder (fires as compaction starts); this
// is the EARLY one — but strictly conditional, so it stays ~free in tokens:
//   - fires only when today's daily log is missing or stale (>= STALE_NUDGE_MIN)
//   - and at most once per NUDGE_COOLDOWN_MIN per project (stamp file in cache dir)
//   - and only in projects that actually use the daily-log convention
// One line, ~40 tokens, a few times in a long session. A naive every-turn nudge
// would be counterproductive: the reminders accumulate in context and hasten the
// very compaction they try to protect against.
const STALE_NUDGE_MIN = 60;    // daily log older than this (min) → nudge
const NUDGE_COOLDOWN_MIN = 45; // min gap between nudges per project

function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function flushNudge(cwd, nowMs) {
  try {
    const now = nowMs || Date.now();
    const stamp = todayStamp();
    let newest = null;      // today's log mtime across roots (null = not created)
    let usesDaily = false;  // project has ANY YYYY-MM-DD.md → daily-log convention in use
    for (const r of memoryRoots(cwd)) {
      let entries;
      try { entries = fs.readdirSync(r); } catch { continue; }
      for (const f of entries) {
        if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(f)) continue;
        usesDaily = true;
        if (f === `${stamp}.md`) {
          try {
            const m = fs.statSync(path.join(r, f)).mtimeMs;
            if (newest === null || m > newest) newest = m;
          } catch {}
        }
      }
    }
    if (!usesDaily) return '';                    // convention not in use — stay silent
    const ageMin = newest === null ? Infinity : (now - newest) / 60000;
    if (ageMin < STALE_NUDGE_MIN) return '';      // fresh enough — stay silent

    // Per-project cooldown: a stale log must NOT nudge on every prompt.
    const dir = path.dirname(CACHE);
    const key = crypto.createHash('md5').update(String(cwd)).digest('hex').slice(0, 12);
    const stampFile = path.join(dir, `flush-nudge-${key}.stamp`);
    try {
      const last = fs.statSync(stampFile).mtimeMs;
      if ((now - last) / 60000 < NUDGE_COOLDOWN_MIN) return '';
    } catch {}
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(stampFile, ''); } catch { return ''; }

    const state = newest === null
      ? `today's daily log (memory/${stamp}.md) has not been created yet`
      : `today's daily log hasn't been updated in ~${Math.round(ageMin)} min`;
    return `🧠 Soul Recall: ${state} — if this session produced unsaved decisions/findings, flush them to memory/${stamp}.md (compaction only keeps what's written down).\n`;
  } catch { return ''; }
}

function render(r) {
  let out = `🧠 Auto-retrieved memory [${r.mode}] (relevant to this prompt — verify before asserting; read the file for detail):\n`;
  for (const line of r.idx) out += line + '\n';
  if (r.files.length) {
    out += '\nRelated memory files:\n';
    for (const it of r.files) out += `- ${it.stale ? '⚠️stale ' : ''}${it.name} (${it.rel})` + (it.desc ? ` — ${it.desc}` : '') + '\n';
  }
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS) + '\n…(truncated)';
  return out;
}

async function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch {}
  const prompt = input.prompt || '';
  const cwd = input.cwd || process.cwd();
  let out = '';
  if (tokenize(prompt).length >= 2) {
    let r = null;
    try { r = await semanticRank(prompt); } catch {}
    if (!r) r = keywordRank(prompt, cwd);
    if (r) out += render(r);
  }
  // Conditional nudge rides the same injection (no extra hook); fires even when
  // retrieval found nothing — staleness is independent of prompt relevance.
  const nudge = flushNudge(cwd);
  if (nudge) out += (out ? '\n' : '') + nudge;
  if (out) process.stdout.write(out);
  process.exit(0);
}

module.exports = { tokenize, memoryRoots, collectFiles, shortPath, embed, cosine, semanticScored, semanticRank, keywordScored, keywordRank, flushNudge, CACHE, MODEL };

if (require.main === module) main().catch(() => process.exit(0)); // hook entry; never break the turn

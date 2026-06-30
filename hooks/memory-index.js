#!/usr/bin/env node
/**
 * ClawSouls — Memory Embedding Indexer (build/refresh the semantic cache)
 *
 * Embeds every memory item (MEMORY.md index lines + memory/*.md files) with
 * bge-m3 via local ollama, and caches the vectors keyed by path + mtime. The
 * UserPromptSubmit hook then only has to embed the *query* (one call) and cosine
 * against this cache — keeping per-prompt latency tiny.
 *
 * Incremental: unchanged items (same mtime) are reused; only new/changed items
 * are re-embedded. Safe to run on SessionStart and on-demand.
 *
 * Usage: node memory-index.js [--cwd <projectDir>]   (defaults to $cwd / process.cwd)
 * No-op (exit 0) if ollama is unreachable — the hook just falls back to keyword.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODEL = process.env.CLAWSOULS_EMBED_MODEL || 'bge-m3';
const CACHE = path.join(os.homedir(), '.cache', 'clawsouls', 'memory-embeddings.json');
const EXCERPT = 600; // chars of body to include in a file's embedding text

function argCwd() {
  const i = process.argv.indexOf('--cwd');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function memoryRoots(cwd) {
  const roots = new Set([cwd, path.join(cwd, 'memory')]);
  const projects = path.join(os.homedir(), '.claude', 'projects');
  // POSIX slash encoding — unchanged for macOS/Linux.
  roots.add(path.join(projects, cwd.replace(/\//g, '-'), 'memory'));
  // Windows: Claude Code encodes ALL non-alphanumerics (drive ':', '\\', '_') to '-'.
  // Added as an EXTRA root only — POSIX behavior is untouched (Set dedups when identical).
  roots.add(path.join(projects, cwd.replace(/[^a-zA-Z0-9]/g, '-'), 'memory'));
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

function embed(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, prompt: text.slice(0, 2000) });
    const u = new URL('/api/embeddings', OLLAMA);
    const req = http.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 8000 },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const j = JSON.parse(d); j.embedding && j.embedding.length ? resolve(j.embedding) : reject(new Error('no embedding')); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(body); req.end();
  });
}

function strip(s) { return s.replace(/[#*`>\[\]()]/g, ' ').replace(/\s+/g, ' ').trim(); }

async function main() {
  const cwd = argCwd();
  // verify ollama reachable; if not, leave any existing cache untouched and exit.
  try { await embed('ping'); } catch { process.exit(0); }

  let cache = { version: 1, model: MODEL, items: {} };
  try { const j = JSON.parse(fs.readFileSync(CACHE, 'utf8')); if (j.model === MODEL && j.items) cache = j; } catch {}

  const files = collectFiles(memoryRoots(cwd));
  const wantKeys = new Set();
  const work = []; // { key, text, meta }

  for (const f of files) {
    let content = '', mtime = 0;
    try { content = fs.readFileSync(f, 'utf8'); mtime = Math.floor(fs.statSync(f).mtimeMs); } catch { continue; }
    const base = path.basename(f);
    const rel = f.startsWith(cwd + path.sep) ? f.slice(cwd.length + 1) : f.replace(os.homedir(), '~');

    if (base === 'MEMORY.md') {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l.startsWith('- ')) continue;
        const key = f + '#L' + i;
        wantKeys.add(key);
        const cur = cache.items[key];
        if (cur && cur.mtime === mtime) continue;
        work.push({ key, text: strip(l), meta: { kind: 'index', mtime, line: l } });
      }
    } else {
      const key = f;
      wantKeys.add(key);
      const cur = cache.items[key];
      if (cur && cur.mtime === mtime) continue;
      const name = (content.match(/^name:\s*(.+?)\s*$/m) || [])[1] || base.replace(/\.md$/, '');
      const desc = (content.match(/^description:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
      const status = ((content.match(/^status:\s*(\w+)/m) || [])[1] || '').toLowerCase();
      const supersededBy = (content.match(/^superseded_by:\s*(.+?)\s*$/m) || [])[1] || '';
      const body = strip(content.replace(/^---[\s\S]*?---/, '')).slice(0, EXCERPT);
      work.push({ key, text: `${name}. ${desc}. ${body}`, meta: { kind: 'file', mtime, name, desc, rel, status, supersededBy } });
    }
  }

  // prune cache entries whose source vanished
  for (const k of Object.keys(cache.items)) if (!wantKeys.has(k)) delete cache.items[k];

  let done = 0;
  for (const w of work) {
    try { const emb = await embed(w.text); cache.items[w.key] = { ...w.meta, emb }; done++; }
    catch { /* skip this item; keep going */ }
  }

  try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache)); } catch {}
  process.stderr.write(`memory-index: ${done} embedded, ${Object.keys(cache.items).length} cached -> ${CACHE}\n`);
  process.exit(0);
}

main().catch(() => process.exit(0));

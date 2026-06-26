#!/usr/bin/env node
/**
 * ClawSouls — Auto Memory Retrieval (UserPromptSubmit hook)
 *
 * Turns the plugin's PASSIVE memory (MEMORY.md + memory/*.md, searched manually
 * via /clawsouls:memory) into ACTIVE memory: on every user prompt, the most
 * relevant memory pointers are auto-retrieved and injected as context — so the
 * agent stops "forgetting" things it already wrote down.
 *
 * Engine-agnostic Phase 1: keyword/TF ranking over the markdown files (no deps,
 * no embeddings). A later phase can swap the ranker for hybrid/vector search.
 *
 * Input  (stdin JSON): { prompt, cwd, session_id, ... }   (Claude Code UserPromptSubmit)
 * Output (stdout): plain-text context block (added to the turn on exit 0).
 *                  Empty output / exit 0 when nothing relevant — never blocks.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const TOP_INDEX = 5; // MEMORY.md index lines to surface
const TOP_FILES = 3; // individual memory files to surface
const MAX_CHARS = 1800; // token budget guard for the injected block

const STOP = new Set(
  ('the a an and or but if of to in on for with is are was were be been this that it its as at by from your you i we our us my me do does done how what why when where which who will can should could would not no yes 그 이 저 의 를 을 가 은 는 에 와 과 도 로 으로 좀 그리고 근데 해줘 해 했 함 임 있 없')
    .split(/\s+/)
);

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}
function tokenize(s) {
  return (String(s).toLowerCase().match(/[a-z0-9가-힣]{2,}/g) || []).filter(t => !STOP.has(t));
}

// Candidate roots: project-local convention + the ~/.claude per-project auto-memory.
function memoryRoots(cwd) {
  const roots = new Set();
  if (cwd) {
    roots.add(cwd);
    roots.add(path.join(cwd, 'memory'));
    const enc = cwd.replace(/\//g, '-'); // /Users/x -> -Users-x
    roots.add(path.join(os.homedir(), '.claude', 'projects', enc, 'memory'));
  }
  return [...roots];
}

function collectFiles(roots) {
  const files = new Set();
  for (const r of roots) {
    try {
      const st = fs.statSync(r);
      if (st.isDirectory()) {
        for (const f of fs.readdirSync(r)) if (f.endsWith('.md')) files.add(path.join(r, f));
      }
    } catch {}
    try { const m = path.join(r, 'MEMORY.md'); if (fs.statSync(m).isFile()) files.add(m); } catch {}
  }
  return [...files];
}

function scoreText(text, qset) {
  const toks = tokenize(text);
  if (!toks.length) return 0;
  let hits = 0;
  for (const t of toks) if (qset.has(t)) hits++;
  // normalize a bit by length so long files don't dominate purely on size
  return hits / Math.sqrt(toks.length);
}

function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch {}
  const prompt = input.prompt || '';
  const cwd = input.cwd || process.cwd();

  const qtokens = tokenize(prompt);
  if (qtokens.length < 2) { process.exit(0); } // too thin to match on; skip
  const qset = new Set(qtokens);

  const files = collectFiles(memoryRoots(cwd));
  if (!files.length) process.exit(0);

  // 1) MEMORY.md index lines (one pointer per line) — highest signal.
  const indexLines = [];
  for (const f of files) {
    if (path.basename(f) !== 'MEMORY.md') continue;
    let content = '';
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const line of content.split('\n')) {
      const l = line.trim();
      if (!l.startsWith('- ')) continue;
      const s = scoreText(l, qset);
      if (s > 0) indexLines.push({ s, line: l });
    }
  }
  indexLines.sort((a, b) => b.s - a.s);
  const topIndex = indexLines.slice(0, TOP_INDEX);

  // 2) Individual memory files (topic/daily/named) — show name/description + path.
  const fileHits = [];
  for (const f of files) {
    const base = path.basename(f);
    if (base === 'MEMORY.md') continue;
    let content = '';
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const s = scoreText(content, qset);
    if (s <= 0) continue;
    const desc = (content.match(/^description:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    const name = (content.match(/^name:\s*(.+?)\s*$/m) || [])[1] || base.replace(/\.md$/, '');
    fileHits.push({ s, name, desc, rel: shortPath(f, cwd) });
  }
  fileHits.sort((a, b) => b.s - a.s);
  const topFiles = fileHits.slice(0, TOP_FILES);

  if (!topIndex.length && !topFiles.length) process.exit(0);

  // Build the injected block (progressive disclosure: pointers, not full bodies).
  let out = '🧠 Auto-retrieved memory (relevant to this prompt — verify before asserting; read the file for detail):\n';
  for (const it of topIndex) out += it.line + '\n';
  if (topFiles.length) {
    out += '\nRelated memory files:\n';
    for (const it of topFiles) {
      out += `- ${it.name} (${it.rel})` + (it.desc ? ` — ${it.desc}` : '') + '\n';
    }
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

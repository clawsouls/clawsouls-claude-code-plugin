# Soul Recall — Active Memory Auto-Retrieval

> Turning a markdown memory system from **passive** (you have to remember to search)
> into **active** (relevant memory is injected automatically, every turn).
> "Soul Recall" is the active retrieval layer over **Soul Memory** — the plain
> markdown store (`MEMORY.md` index + `memory/*.md` daily logs and topic files,
> git-versioned, no database).

## The problem: storage was never the bottleneck — retrieval was

A long-running agent accumulates a lot of memory: a `MEMORY.md` index, dated daily
logs, topic files. The data is *there*. Yet the agent still "forgets" — it re-asks
things the user already answered, re-derives facts it already wrote down.

The root cause is not storage. It's **retrieval automation**. If recalling a fact
requires the agent to *decide* to run a search tool, then any turn where it doesn't
think to search looks like amnesia. Humans don't consciously query their memory on
every sentence; relevant context surfaces on its own. An agent's memory should work
the same way.

## The fix: a `UserPromptSubmit` hook that auto-injects relevant memory

Claude Code fires a `UserPromptSubmit` hook on every user message, before the model
sees it. We attach a small script that:

1. Reads the incoming prompt.
2. Searches the markdown memory (the `MEMORY.md` index lines + every `memory/*.md`
   file) and ranks by relevance to the prompt.
3. Prints the top-K **pointers** (index lines + file name/description/path) to stdout.

Claude Code adds that stdout to the turn's context. The agent now starts every turn
already holding the memory that matters — no manual search, no forgetting.

```
user prompt ─▶ UserPromptSubmit hook ─▶ rank memory ─▶ inject top-K pointers ─▶ model
```

It ships in this plugin via `hooks/hooks.json`, which registers two hooks:

- **`UserPromptSubmit` → `hooks/memory-retrieve.js`** — the retriever above.
- **`SessionStart` → `hooks/memory-index.js`** — builds/refreshes the semantic
  embedding cache so per-prompt retrieval is cheap (see below).

No manifest wiring needed — Claude Code auto-discovers the `hooks/` directory.

## Design principles

- **Markdown-native.** The store stays plain `.md` files in git. No database, no
  hosted service. The memory is human-readable, diff-able, and portable — the same
  property that makes Soul Spec personas portable.
- **Hybrid ranker, graceful fallback.** Retrieval is semantic-primary: bge-m3
  embeddings (via local Ollama) cosine-ranked against a precomputed cache. When
  Ollama or the cache is unavailable, it falls back to a dependency-free BM25
  keyword ranker (IDF + length norm + field/title boost + recency). Each injection
  is tagged `[semantic]` or `[keyword]` so the source of recall is transparent.
- **Progressive disclosure.** The hook injects *pointers* (one-line index entries +
  file descriptions), not full file bodies. The agent reads the full file only when
  it needs the detail. Cheap on tokens, high on signal.
- **Never block.** Any error → exit 0 with no output. A memory hook must never break
  the user's turn.

## The semantic cache (`memory-index.js`)

Embedding the whole memory store on every prompt would be slow. Instead, a
`SessionStart` hook embeds each memory item — `MEMORY.md` index lines and each
`memory/*.md` file — with bge-m3 and caches the vectors at
`~/.cache/clawsouls/memory-embeddings.json`, keyed by path + file mtime.

The cache is **incremental**: unchanged items (same mtime) are reused, only
new/changed items are re-embedded, and entries whose source file vanished are
pruned. At prompt time the retriever embeds only the *query* (a single call) and
cosines it against the cache — so per-prompt latency stays tiny (~0.15s).

If Ollama is unreachable, `memory-index.js` is a no-op (any existing cache is left
untouched) and the retriever falls back to keyword ranking. The cache is never a
hard dependency.

## Superseding & decay

Memory files can carry frontmatter that controls their visibility in retrieval:

| Field | Effect |
|-------|--------|
| `status: archived` / `status: superseded` | **Hidden** — never retrieved. |
| `superseded_by: <file>` | **Hidden** — a newer memory replaces this one. |
| `status: stale` (or untouched for ~75 days) | **Down-weighted** and flagged with ⚠️ in the injected pointer, so the agent treats it as possibly outdated. |

This keeps the active surface self-cleaning: old facts fade, replaced facts
disappear, and the agent is warned when it's leaning on something that may have
gone stale — without anyone having to delete history from the markdown store.

## Measuring it: the ablation (`test/memory-eval.js`)

We didn't *assume* semantic beats keyword — we measured it. The harness at
`test/memory-eval.js` runs the **same rankers the live hook uses** over a 32-query
eval set (`test/memory-eval-set.json`), reporting recall@1/3/5 and MRR for each
config (keyword, semantic, and RRF rank-fusion of the two):

| config | R@1 | R@5 | MRR |
|--------|-----|-----|-----|
| keyword | 69% | 94% | 0.80 |
| **semantic** | **91%** | **100%** | **0.94** |
| RRF (fusion) | 84% | 100% | 0.91 |

**Conclusion:** semantic wins outright, and **RRF was rejected** — fusing keyword
back in *diluted* the strong semantic ranking (R@1 91% → 84%). So the shipped
config is **semantic-primary with keyword as a pure fallback**, not a blend.

Reproduce with:

```bash
node test/memory-eval.js --cwd /path/to/a/memory/project
```

(Run against a project that has a populated `MEMORY.md` + `memory/`; with Ollama up
you get the semantic/RRF rows, without it the keyword row.)

## Why this isn't "just another memory engine"

Memory *engines* are converging into a commodity (everyone has capture + retrieval).
ClawSouls differentiates on the layers above the engine:

- **Identity** — memory is bound to a portable Soul Spec persona, not a vendor silo.
- **Governance** — SoulScan verifies the persona/memory package before it's trusted.
- **Collective** — Swarm Memory lets multiple agents share and merge memory via git.

The auto-retrieval hook is the engine getting out of the agent's way; the durable
moat is identity + governance + collective on top of it.

## Beyond the internal set

The ablation above uses an internal query set. Next, we evaluate the same approach
on public long-term-memory benchmarks (LongMemEval, LoCoMo) — both as product
validation and as material for the persona-memory research we publish.

## Usage

With the plugin installed, the hook is active automatically. To see what it would
inject for a given prompt:

```bash
echo '{"prompt":"your question here","cwd":"/path/to/project"}' \
  | node hooks/memory-retrieve.js
```

# Active Memory — Auto-Retrieval Hook

> Turning a markdown memory system from **passive** (you have to remember to search)
> into **active** (relevant memory is injected automatically, every turn).
> Phase 1 of the ClawSouls memory R&D track.

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

It ships in this plugin at `hooks/hooks.json` + `hooks/memory-retrieve.js`. No
manifest wiring needed — Claude Code auto-discovers the `hooks/` directory.

## Design principles

- **Markdown-native.** The store stays plain `.md` files in git. No database, no
  hosted service. The memory is human-readable, diff-able, and portable — the same
  property that makes Soul Spec personas portable.
- **Engine-agnostic ranker.** Phase 1 uses dependency-free keyword/TF ranking. The
  ranker is one function; it can be swapped for hybrid (BM25 + vector + graph) search
  later without changing the hook contract.
- **Progressive disclosure.** The hook injects *pointers* (one-line index entries +
  file descriptions), not full file bodies. The agent reads the full file only when
  it needs the detail. Cheap on tokens, high on signal.
- **Never block.** Any error → exit 0 with no output. A memory hook must never break
  the user's turn.

## Roadmap

- **Phase 1 (this):** auto-retrieval + injection on `UserPromptSubmit`. Kills the
  "forgot to search" failure mode.
- **Phase 2:** `superseding` (a newer fact supersedes an older one) + `decay`
  (stale facts expire) so the index self-cleans; deeper progressive disclosure;
  active-authoring discipline (propagation, backlinks, contradiction flags).
- **Phase 3 (only if needed):** swap the ranker for a hybrid/vector backend when
  recall at scale demands it — markdown stays the source of truth, the backend is
  just an index.

## Why this isn't "just another memory engine"

Memory *engines* are converging into a commodity (everyone has capture + retrieval).
ClawSouls differentiates on the layers above the engine:

- **Identity** — memory is bound to a portable Soul Spec persona, not a vendor silo.
- **Governance** — SoulScan verifies the persona/memory package before it's trusted.
- **Collective** — Swarm Memory lets multiple agents share and merge memory via git.

The auto-retrieval hook is the engine getting out of the agent's way; the durable
moat is identity + governance + collective on top of it.

## Measuring it

Retrieval quality is measurable. We evaluate the approach on public long-term-memory
benchmarks (LongMemEval, LoCoMo) — both as product validation and as material for the
persona-memory research we publish.

## Usage

With the plugin installed, the hook is active automatically. To see what it would
inject for a given prompt:

```bash
echo '{"prompt":"your question here","cwd":"/path/to/project"}' \
  | node hooks/memory-retrieve.js
```

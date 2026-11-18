---
date: 2026-09-10
tier: lesson
summary: Backticks in a comment inside a double-quoted inline script are live command substitutions
tags: [ci, workflows, bash, data-pipeline, guards]
---

# A Markdown code span inside a double-quoted inline script is executable code

**Date:** 2026-09-10
**Issue:** #1549 (regression from the #1428 fix, commit `c86c8661`)

## What happened

`data-pipeline.yml` runs its snapshot-index generator as `node -e "…"`. That
argument is a **double-quoted bash string**, and bash performs command
substitution on backticks inside double quotes — it does not care that the
surrounding text is a JavaScript `//` comment, because bash expands the string
before node ever exists.

The #1428 fix added a comment explaining why the `/^[A-Z0-9]+$/i` filter is
load-bearing, and wrote the identifiers as Markdown code spans. Bash executed
all four of them. Run 34468935211 logged:

```
_: command not found
district_61_reports.json: command not found
61_reports: command not found
SyntaxError: Unexpected identifier 'TTY'
```

The empty substitutions collapsed the comment lines into each other and the
remaining source no longer parsed. **A comment written to prevent one bug
introduced another.**

It sat latent for three weeks because only `rebuild` and `prune` mode take that
branch; the daily path takes the `else`. The first dispatch after the merge hit
it.

## The transferable takeaway

Prose conventions do not survive a change of quoting context. Inside a
double-quoted shell string, three characters are code — `` ` ``, `$`, `\` — and
a comment marker from the *inner* language provides no protection, because the
outer language expands first. The same applies to an unquoted heredoc
delimiter (`<<EOF` expands; `<<'EOF'` does not).

Prefer plain identifiers in inline-script comments, or move the script to a real
file. When you must keep it inline, single quotes are inert and safe.

## Why the guard needed care

A naive scanner for this class gets it wrong in a specific way: it finds the
opener and never finds the **end**, so it runs on into neighbouring steps and
flags ordinary shell `#` comments and `$(…)` — which are perfectly safe — as
hits. `data-pipeline.yml` has several such comments a few hundred lines below
the offending block.

The fix is to bound the block with bash's own rule: a double-quoted string ends
at the first `"` that is not backslash-escaped. `scripts/lib/workflowInlineScriptGuard.ts`
does that, and its tests prove **both** directions — the sentinel fires on a
known-bad snippet, and the skeleton-sync rsync comment is asserted to sit inside
no block at all. Proving a guard fires is only half the evidence; a guard that
over-fires gets disabled.

## Falsifiability

The block was extracted from the YAML and executed under bash both ways: the
pre-fix text reproduces `SyntaxError: Unexpected identifier 'TTY'` exactly, and
the fixed text generates the index and still filters `district_61_reports.json`
out — so the #1428 behaviour is intact, not merely the comment about it.

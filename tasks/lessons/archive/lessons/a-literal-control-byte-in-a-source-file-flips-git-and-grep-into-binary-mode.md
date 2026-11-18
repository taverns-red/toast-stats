---
date: 2026-06-10
tier: lesson
summary: A literal control byte in a source file flips git and grep into binary mode; write control characters as escapes
tags: [git, bash, tests, process, verification]
legacy_id: "158"
---

# Lesson 158 — A literal control byte in a source file flips git and grep into binary mode; write control characters as escapes

**Date:** 2026-06-10
**Issue:** #1080 (epic #1099 — education achievementCount relabel); cleanup tracked as #1156
**PR:** #1155

## What happened

Committing a test change to `DailyReportParser.test.ts` reported
`1 file changed, 0 insertions(+), 0 deletions(-)` and `git show --stat`
printed `Bin 8749 -> 9975 bytes`. A verification grep
(`git show HEAD:… | grep -c achievementCount`) printed **nothing**, which
read like the commit had silently lost the edit. The commit was fine: the
file contains a **literal NUL byte** (the `flattenValues` join separator —
the production source uses the `\u0000` escape, but the test embedded the
raw byte). Git therefore diffs the file as binary (no text diff, ever, for
any future change to it) and grep goes silent without `-a`. The same byte
later bounced a `gh issue create` call whose body quoted the snippet —
the host tooling rejects argv containing NUL.

## The transferable principle

**A single literal control byte (NUL especially) in an otherwise-text
source file degrades the entire toolchain around that file, silently and
permanently: git shows `Bin` instead of reviewable diffs, commit stats
read as empty, grep matches print nothing, and any tool that passes file
content through argv can hard-fail.** The failure looks like _your change
was lost_, not like _the file is binary_ — so it costs a debugging detour
every time someone touches the file. Always write control characters as
escape sequences (`'\u0000'`, `'\x00'`) in source; if a file mysteriously
diffs as `Bin`, hunt for stray control bytes
(`python3: [b for b in data if b < 9]`) before doubting the commit.

## How to apply

- See `Bin X -> Y bytes` in a stat for a `.ts`/`.js`/`.md` file, or a
  commit claiming `0 insertions, 0 deletions` after a real edit? The file
  has binary content — verify with `file(1)` / a control-byte scan, and use
  `grep -a` for any content checks until it's fixed.
- Never let a literal control byte land in source; the escape sequence is
  byte-identical at runtime and keeps every diff/review/grep surface
  working. (Cleanup for the existing case: #1156.)

## Related

- [[150-an-exhaustiveness-guard-on-a-classification-map-misses-a-misclassification-that-keeps-the-set-valid]]
  — same file/test family (the privacy denylist whose separator this is).

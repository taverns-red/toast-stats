---
date: 2026-10-23
tier: lesson
category: lesson
summary: A guard test's regex can be narrower than its comment; before widening it to the stated intent, inventory the uses that pass today, because some of them are the house style, not leaks
tags: [testing, guards, brand, palette, frontend]
---

# Widen a guard to its stated intent only after inventorying what already passes

**Date:** 2026-10-23
**Issue:** #2249 (landing page: Red Vote block in Red Vote's own palette)

## What happened

`noProductAccentUntilPhase2.test.ts` says "new UI matches the existing app
palette", but its regex caught only `--rt-stats` and two amber hexes. A
Red Vote block in `--rt-vote` red would have passed it silently, so the
decision was to widen the guard and give the block one scoped exception.

The first widening (`--rt-red*`, `--rt-paper*`, `--rt-bg*`, `--rt-vote`
and the red hexes) turned the guard red on files the PR never touched:
the club mini-map pin (`fill: var(--rt-red)` in app-shell.css, `#E63946`
in locatorPins.ts) and the Retention / Distinguished badge accents in
redesign.css (`--rt-red`, `--rt-red-dk`). Those are the house red, chosen
on purpose and already in the legacy chrome — not leaks. Worse, a grep
pipeline in the commit chain masked vitest's exit code, so the red guard
reached a commit before the next run exposed it.

## The transferable principle

A guard's comment states an intent; its pattern enforces a subset. When
you widen the pattern toward the intent, every value that passes today is
either a leak you are about to catch or a sanctioned use you are about to
break. Run the widened pattern over the tree first and classify each hit.
The sanctioned uses define the honest scope (here: the Red Vote *surface*
tokens, not the house red), and the exception list stays at one.

## How to apply

- Before committing a widened regex, run it as a grep over `src` and read
  every hit; name the sanctioned ones in the guard's comment.
- Prefer forbidding tokens over hexes when hexes are already used for
  non-brand purposes (a map pin).
- In a test-then-commit chain, branch on the test runner's exit code, not
  on a grep of its output: `vitest … > log; rc=$?; if [ $rc -eq 0 ]`.

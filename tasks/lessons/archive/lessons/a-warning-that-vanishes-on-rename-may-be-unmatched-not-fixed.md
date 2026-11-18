---
date: 2026-09-08
tier: lesson
summary: A tool warning that disappears after an API rename may be unmatched, not fixed — check the tool's own rule source
tags: [react-compiler, dependencies, migration, tooling, verification]
---

# A warning that vanishes on rename may be unmatched, not fixed

**Date:** 2026-09-08
**PR:** #1538 (#1530, `@tanstack/react-table` 8 → 9)

## What happened

`ClubsTable.tsx` carried a React Compiler warning: *"TanStack Table's
`useReactTable()` API returns functions that cannot be memoized safely."*
#1530 asked whether v9 resolved it, left it unchanged, or introduced a new one.

After the migration the warning is gone. The tempting write-up is "v9 fixed
the memoization hazard." That would have been wrong.

The falsifying check was two four-line canary components compiled through
`babel-plugin-react-compiler` with a logging `logger.logEvent`:

- `useReactTable(...)` → `CompileError`, category **`IncompatibleLibrary`**,
  carrying that exact message. The compiler **skips memoizing the component**.
- `useTable(...)` → `CompileSuccess`.

Then the reason, read out of the compiler's own source
(`HIR/DefaultModuleTypeProvider`): it hard-codes a per-module table of
incompatible hooks, keyed on the **hook name**. `@tanstack/react-table` lists
exactly one property — `useReactTable` — with a `knownIncompatible` string.
v9 renamed the hook to `useTable`, which simply is not on the list.

So: **resolved, but by name-miss, not by fix.** Two consequences worth
recording. `babel-plugin-react-compiler` is an *optional, uninstalled* peer of
this repo's vite react plugin, so nothing about the shipped bundle changed.
And if the compiler is ever switched on, `ClubsTable` will now be memoized
where it previously bailed — v9's own guidance warns that builder-method reads
(`row.getIsSelected()` and friends) can hide state from the compiler. This
table renders from fully controlled props, so it is safe today; a future table
that calls builder methods in render would not be.

## The takeaway

**A static-analysis warning disappearing is evidence about the analyzer's
matching, not about your code.** Allowlists and denylists in linters, compilers
and scanners are usually keyed on literal names — a rename slips past them
without changing a single runtime behaviour.

When a warning vanishes as a side effect of an upgrade, find the rule that
emitted it and read what it actually matches on before reporting it fixed.
`grep` the tool's `dist/` for the message string; it is normally sitting
right next to its matching condition.

## The rule

"The warning went away" is a hypothesis, not a result. Confirm from the rule's
source whether the hazard is gone or merely unmatched — and say which in the PR.

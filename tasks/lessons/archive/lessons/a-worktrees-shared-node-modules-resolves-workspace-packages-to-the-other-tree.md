---
date: 2026-08-03
tier: lesson
summary: A worktree whose node_modules symlinks to the main checkout resolves every workspace package to the OTHER tree — your typecheck and tests silently grade a different working copy, and extra arguments make the miss look green
tags:
  [
    monorepo,
    worktree,
    npm-workspaces,
    stale-dist,
    silent-failure,
    tooling,
    verification,
  ]
---

# A worktree's shared node_modules resolves workspace packages to the other tree

**Date:** 2026-08-03
**Issue:** #1406 (per-program-year club recognition ladder)
**Related:** Lesson 092 / R16 (workspace `dist` is gitignored and not auto-rebuilt) —
this is that hazard one level up, and R16's fix does not reach it

## The setup

Spawned sessions get a git worktree with `node_modules` symlinked to the main
checkout's, to skip a multi-minute install. Reasonable, and almost always
invisible — until the change touches a workspace package's public API.

npm workspaces put workspace links in the **root** `node_modules`, as symlinks
to the package directories:

```
toast-stats-1406/node_modules -> /…/toast-stats/node_modules
  └── @taverns-red/analytics-core -> ../../packages/analytics-core
```

That relative link resolves against the **main checkout**. So
`packages/collector-cli` and `frontend` in my worktree were compiling and
testing against `/…/toast-stats/packages/analytics-core` — a different working
tree, possibly mid-edit by another agent, and certainly without my changes.

R16 ("rebuild the package after touching its src") does not save you: I *did*
rebuild, into my worktree's `dist`, which nothing was reading.

## Why it did not just fail loudly

The frontend failed honestly — `has no exported member 'determineDistinguishedLevel'`
— because I had **added** an export. That error is what exposed the whole thing.

`collector-cli` did something worse. I widened a function from three parameters
to four and passed the fourth at the call site. Against the stale three-arg
build:

- `tsc` reported `Expected 3 arguments, but got 4` — but only in the full
  `quality:check`, well after I had run the package's own tests;
- **the tests passed, 1090 of them.** JavaScript discards extra arguments, so
  the call ran the *old* behaviour, returned the *old* answer, and every
  assertion that did not specifically test the new parameter stayed green.

That is the shape to fear: not a crash, but a green suite grading code you did
not write. An additive export fails closed; a **widened signature fails open**.

## The rule

**In a worktree with shared `node_modules`, verify where a workspace import
actually resolves before trusting any local gate on it:**

```bash
readlink -f node_modules/@taverns-red/<pkg>   # must be inside YOUR worktree
```

When it is not, shadow the package locally — contained, gitignored, and
touching nothing shared. Per-package `node_modules` beat the root in Node's
resolution order:

```bash
mkdir -p frontend/node_modules/@taverns-red
ln -s "$PWD/packages/analytics-core" frontend/node_modules/@taverns-red/analytics-core
```

Do it for **every** workspace that imports the package, not just the one that
errored. `frontend` complained; `collector-cli` did not, and was equally wrong.
If the existing `node_modules` is itself a symlink, replace it with a real
directory of symlinks to the original entries plus your overrides, rather than
writing into the shared tree.

## The generalisation

A dependency that resolves *outside* the tree you are editing is a silent
correctness hole in every local gate at once — typecheck, unit tests, and any
"I ran it and it worked". CI is unaffected (clean install, own packages), so
the divergence shows up only as a PR that behaves differently from your laptop,
or worse, does not.

**Ask what a green local run is actually grading.** The setup note said "all
`packages/*/dist` are pre-built", which is true and reads as reassurance — it
is the same sentence whether the prebuilt dist is yours or someone else's.

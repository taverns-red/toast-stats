---
date: 2026-08-31
tier: lesson
summary: Moving a module into a workspace package is only half the move — the package index re-export is the other half, and the owning package's own tests can never catch its absence
tags: [monorepo, build, npm-workspaces, refactoring, testing]
---

# A promoted module needs its package-index export promoted with it

**Date:** 2026-08-31
**Issue:** #1498 (epic #1496 — the worldwide scoreboard)
**Tags:** monorepo, npm-workspaces, build, refactoring, testing

## What happened

`rollUpGlobal` was promoted from `scripts/lib/globalRollup.ts` into
`packages/analytics-core/src/rollup/` so `collector-cli` could consume it.
The move went cleanly, the module grew a second reader (`readSnapshotRankings`),
and both analytics-core suites went green — 982 tests, including the new
rollup ones.

Then the collector-cli test that exercised the whole thing failed with
`globalTotalsPath: undefined` and **no error recorded**. The cause:

```
SyntaxError: The requested module '@taverns-red/analytics-core'
  does not provide an export named 'readSnapshotRankings'
```

Only one of the two new readers had been added to the package's `index.ts`.

## Why the owning package's tests could not catch it

analytics-core's own tests import **relative source paths**
(`./globalRollup.js`), which resolve regardless of what `index.ts` re-exports.
A consumer imports the **package name**, which resolves through `exports` →
`dist/` → whatever `index.ts` actually names. Those are two different module
graphs, and only the second one knows the barrel is incomplete.

So: 982 green tests in the package that owns the code proved nothing about
whether the code was reachable from outside it. R16 says rebuild `dist/`
before cross-package tests — this is the failure mode one step earlier. A
rebuild of an incomplete barrel produces an incomplete `dist/` just as
faithfully.

## The takeaway

**Moving a module into a workspace package is two edits, not one: the file,
and the package index.** Verify the second from *outside* the package —
either a consumer test or a one-liner that imports the package name — because
no test inside the package can distinguish "exported" from "merely present".

A cheap check right after any promotion:

```bash
npm run build:<package>
node -e "const m=require('@scope/pkg'); for (const n of ['a','b']) if(!m[n]) throw new Error('not exported: '+n)"
```

## Related

- R16 / Lesson 092 — workspace `dist/` is gitignored and never auto-rebuilt.
  Same boundary, one step later: this one bites even when you *did* rebuild.
- R8 — when deleting a service, audit its whole read AND write path. Moving a
  module has the same shape: the import sites are only half the graph.

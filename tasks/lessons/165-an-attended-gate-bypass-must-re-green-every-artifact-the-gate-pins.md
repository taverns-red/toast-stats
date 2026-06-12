---
id: '165'
category: lesson
tags: [process, ci, automation, release, monorepo]
auto_load: true
date: 2026-06-12
issues: [1165, 1162, 1186]
---

# Lesson 165 — An attended gate-bypass merge must re-green every artifact the gate pins, or the red lands on the next unrelated session

**Date:** 2026-06-12
**Issue:** #1165 (epic #1162 Sprint 3 — public /mcp page)
**PR:** #1190

## What happened

Sprint 3's baseline run found main's mcp-server Test Suite **red**: PR #1186
(the operator-attended 0.1.1 version bump, part of the manual npm release
flow) had been merged with a failing Test Suite to unblock the publish. Two
guards were tripped:

- the packaging test still pinned `bin: './dist/bin.js'` after #1185
  deliberately normalized it to `dist/bin.js` (so `npm publish` ships
  without auto-corrections);
- `.release-please-manifest.json` still said `0.1.0` while `package.json`
  said `0.1.1` — the manual bump flow's documented checklist named
  `package.json` and the lockfile, but not the manifest the test pins.

Neither red was related to this sprint's scope (a frontend page), but R1
("if pre-existing tests are red, fix them before adding new code") made the
reconciliation this session's job: align the test with the deliberate spec
change, sync the manifest, and extend the documented release-flow checklist
so the gap can't recur.

## The transferable principle

**When an operator knowingly merges past a red gate (attended override,
release pressure, burned-version recovery), the override is only complete
when every artifact the gate pins is re-greened in the same change — an
intentionally-eaten red doesn't disappear, it becomes a surprise baseline
failure for the next session, which must first archaeology whether the red
is a real regression, an intended spec change, or forgotten bookkeeping.**
The cost asymmetry is stark: the merging operator has full context ("I
normalized the bin path on purpose") and could fix the guard in seconds;
the inheriting session must re-derive that intent from commit history
before it dares touch the assertion (R1 — is fixing the test pinning a
bug, or aligning with a deliberate decision?).

## How to apply

- Before merging any red-gate override, diff the failing assertions against
  the intended end state and include the test/manifest updates in the same
  PR — or file a same-day follow-up issue naming each tripped guard.
- A manual flow document (here: the README release flow) must enumerate
  every version-tracking artifact a test pins: `package.json`, lockfile,
  **and** `.release-please-manifest.json`.
- Inheriting a pre-existing red: `git log` the asserted-on values first.
  "Test expects old value, code has new value via a deliberate commit" →
  update the test (spec changed). No such commit → treat as a regression.

## Related

- [[158-a-fail-closed-chain-is-only-as-honest-as-its-writers-a-persisted-default-reads-as-a-decision]]
  — same laundering shape: state that looks decided but was merely left behind.
- [[164-bundledependencies-is-a-no-op-for-workspace-symlinked-deps-inline-at-build-time]]
  — the same package's publish pipeline, one sprint earlier.
- `packages/mcp-server/README.md` (release flow checklist),
  `packages/mcp-server/src/__tests__/packaging-manifest.test.ts`.

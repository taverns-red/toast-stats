---
date: 2026-10-06
tier: lesson
summary: release-please's `node` strategy rewrites only the root entry of the root package-lock.json; npm-workspace entries (`packages['<path>'].version`) need a root-relative `json` extra-file per package, or they drift one release behind every release
tags: [release-please, ci, monorepo, npm-workspaces, lockfile, dependencies]
---

# release-please's node strategy bumps only the root entry of the root lockfile

**Date:** 2026-10-06
**Issue:** #1574 (one-off repair PR #1575 was undone by the very next release)

## What happened

Each workspace's `package.json` was bumped on release, but the root
`package-lock.json` kept every workspace at the previous version. npm does not
validate those fields, so CI stayed green — the cost was ten lines of churn on
every `npm install`, waiting to ride into an unrelated PR. A one-off
`npm install --package-lock-only` repair drifted again on the next release.

## Why

The `node` strategy's lock updater runs against `<package path>/package-lock.json`.
For a workspace that file does not exist (`createIfMissing: false`), so nothing
happens; only the root package's strategy touches the root lock, and it sets
just `version` and `packages[""].version`.

## Fix

Per workspace in `release-please-config.json`:

```json
"extra-files": [
  { "type": "json", "path": "/package-lock.json",
    "jsonpath": "$.packages['frontend'].version" }
]
```

The leading `/` makes the path repo-root-relative (`BaseStrategy.addPath`).
In a grouped release PR the per-package updates merge with the root updater into
one `CompositeUpdater`. `node-workspace` also covers the root lock, but it
rewrites inter-workspace dependency ranges and cascades patch releases to
dependents, which changes how releases are cut.

Guard: `scripts/lib/lockfileVersionSync.ts` (run by `npm run test:scripts`) fails
on lock drift and on a workspace package that has no such extra-file. Because a
release PR gets full CI, the guard also catches a mechanism regression before
the release merges.

## Takeaway

When a release tool "updates the lockfile", check **which entries** it
updates. A one-off repair without a guard only resets the drift until the next
release.

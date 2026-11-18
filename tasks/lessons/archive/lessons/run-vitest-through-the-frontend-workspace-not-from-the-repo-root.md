---
date: 2026-11-12
tier: lesson
summary: Run frontend vitest through the workspace (`npm run test --workspace=frontend -- <paths>`); from the repo root every test fails with `localStorage.clear is not a function`, a false red
tags: [vitest, testing, frontend, red-tests, monorepo]
---

# Run vitest through the frontend workspace, not from the repo root

**Date:** 2026-11-12
**Issue:** #2676 (Clubs table layout, PR3)

## What happened

Running `npx vitest` from the repo root made all 23 new red tests fail with
`localStorage.clear is not a function`. That looked like a perfect red, but it
was the wrong environment: the root has no jsdom setup, so any test that
touches storage fails regardless of the code. Re-run through the workspace
(`npm run test --workspace=frontend -- <paths>`), the same file failed 20 of 23
for the right reasons (no colgroup, no caption, no min-width).

## Takeaway

1. A red test must fail for the right reason. Read the first failure message,
   not just the count: an environment error is not evidence.
2. Do not pass `--run` through the workspace script; it already has it.
3. For a JSON report use `-- --reporter=json --outputFile=<path>`.

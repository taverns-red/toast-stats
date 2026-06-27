---
id: '174'
category: lesson
tags: [monorepo, refactor, tests, verification, process, ci]
auto_load: true
date: 2026-06-27
issues: [1258, 1257]
---

# Lesson 174 — A scope-rename "grep-proof" must also search the regex-escaped-slash form

**Date:** 2026-06-27
**Issue:** #1258 (epic #1257 Sprint 1 — rename `@toastmasters/*` → `@taverns-red/*`)
**PR:** #1259

## What happened

The atomic rename of three internal workspace packages off `@toastmasters/*`
was driven (and gated) by the literal grep
`git grep "@toastmasters/" -- '*.ts' '*.tsx' '**/package.json' package.json`
and applied with `sed 's|@toastmasters/|@taverns-red/|g'`. Both reported the
tree clean and the full per-workspace suite (5661 tests) went green.

The fresh-context `/review` pass then found **two** surviving references that
both the grep and the sed structurally could not see — they were written with
a **regex-escaped slash** inside JS test assertions:

- `scripts/lib/__tests__/ciConfigGuard.test.ts` —
  `expect(ci).toMatch(/typecheck.*@toastmasters\/collector-cli/)`. The CI gate
  it guards now emitted `@taverns-red/collector-cli`, so this assertion was
  **red** — but only under `npm run test:scripts` (a separate `scripts/vitest.config.ts`
  gate that `npm run test --workspaces` does **not** run). Locally-green,
  CI-red.
- `packages/mcp-server/src/__tests__/no-analytics-core-dependency.test.ts` —
  the import-scanning regex still pinned `@toastmasters\/analytics-core`. It
  passed (nothing imports it) but had gone **toothless**: it now guarded a dead
  scope, so a real future `@taverns-red/analytics-core` import would slip past.

Root cause: the needle `@toastmasters/` (literal slash) does not match the
bytes `@toastmasters\/` (backslash-then-slash), so the file never appeared in
`git grep -l` and `sed` never rewrote it. `git grep '@toastmasters\\/'`
surfaces exactly these and nothing else.

## The transferable principle

**A string-rename that calls a literal grep its acceptance gate is blind to
every place the string is written escaped.** Regex assertions (`toMatch(/…\/…/)`),
JSON-with-escapes, and shell-quoted forms all hide the token from a
slash-literal search. Before declaring a scope/identifier rename complete,
re-run the search for the **escaped** form too — and remember the
`--workspaces` test run and the standalone `scripts/` vitest gate are
**different gates**: a `scripts/lib/__tests__` assertion can stay red while
every workspace suite is green.

## How to apply

- For any `@scope/`-style or path rename, sweep both forms:
  `git grep "@scope/"` **and** `git grep '@scope\\/'` (plus check
  `*.yml`/`*.json` separately — the `*.ts'/'*.tsx'/'package.json` acceptance
  glob omits workflows and configs).
- Run **every** gate, not just `npm run test`. This repo's CI also runs
  `npm run test:scripts` (`scripts/vitest.config.ts`), `test:projects:check`,
  `test:no-page-mounts:check`, lighthouse, and the preview — `--workspaces`
  covers none of the script-level ones.
- A guard test that pins a forbidden token must be updated to the **new** value
  when the thing it forbids is renamed, or it silently guards a ghost. Prefer
  forbidding the whole legacy scope (built from fragments, e.g.
  `'@' + 'oldscope/'`, so the guard file itself stays grep-clean).
- This is exactly what fresh-context `/review` is for: the author's grep
  defined the author's blind spot; an independent reviewer re-derived the
  search and caught both misses.

## Related

- [[151-a-long-lived-worktree-has-stale-node-modules-after-a-new-workspace-package-merges]]
  and [[092-workspace-package-dist-is-gitignored-and-not-auto-rebuilt]] — the
  R16/`npm install` build-and-install discipline this rename also leaned on.
- [[164-bundledependencies-is-a-no-op-for-workspace-symlinked-deps-inline-at-build-time]]
  — the same mcp-server package; verifying esbuild still inlined the renamed
  workspace dep was part of this sprint's GREEN.

---
id: '164'
category: lesson
tags: [monorepo, build, npm, verification, mcp]
auto_load: true
date: 2026-06-12
issues: [1163, 1162]
---

# Lesson 164 — `bundleDependencies` is a no-op for workspace-symlinked deps; a publishable workspace-dependent package must inline at build time

**Date:** 2026-06-12
**Issue:** #1163 (epic #1162 Sprint 1 — rename + make `toast-stats-mcp` publishable)
**PR:** _(record on merge)_

## What happened

Making `packages/mcp-server` publishable hit the structural problem that its
runtime imports include `@toastmasters/shared-contracts` — a **private,
unpublished** workspace package. A clean `npm install <tarball>` cannot
resolve it from any registry.

The standard npm answer, `bundleDependencies`, was tested with a canary
before being designed in: with npm 11.12.1 in this workspace monorepo,
`npm pack --dry-run --json` showed **zero** `node_modules/*` files in the
tarball — npm silently skips bundling deps that are workspace symlinks
(long-standing npm/cli behavior). The field would have shipped a manifest
that _claims_ bundling while the artifact stays broken, and `npm pack`
exits 0 either way.

The shipped design instead:

- esbuild bundles `src/bin.ts` → a single self-contained `dist/bin.js`
  (shebang preserved), inlining the workspace dep; public registry deps
  (`@modelcontextprotocol/sdk`, `zod`) stay `--external` and remain in
  `dependencies`.
- The workspace dep moves to `devDependencies` (build-time only), making
  "every entry in `dependencies` is registry-resolvable" the pinned,
  testable publishable invariant.
- The only honest gate is a **pack smoke**: `npm pack` → install the
  tarball into a clean temp dir → boot the _installed_ bin over real stdio
  (env-overridable bin path in the existing smoke test). It failed before
  the bundling (ERR_MODULE_NOT_FOUND) and passes after — run per-PR in CI.

## The transferable principle

**"Publishable" for a package that imports private workspace siblings is a
build-output property, not a manifest property — npm's own bundling feature
silently no-ops on workspace symlinks, so the dependency must be erased at
build time (bundler inline), and the only gate that proves it is installing
the packed tarball into a clean dir and booting the installed artifact.**
Manifest-level fixes (`bundleDependencies`, `files`, `publishConfig`) all
exit 0 whether or not the artifact actually works.

## How to apply

- Before designing around `bundleDependencies` in a workspaces monorepo,
  canary it: `npm pack --dry-run --json | jq '.[0].files[].path'` and look
  for `node_modules/` entries. Zero = the feature is inert for you.
- Publishable invariant as a unit test: assert `dependencies` keys are
  exactly the registry-resolvable set; workspace deps live in
  `devDependencies`.
- Gate with a pack smoke (pack → clean-dir install → boot installed bin),
  not with tarball-content listing alone — a file list can't prove imports
  resolve.
- Ship the bin-only surface when nothing consumes the library barrel:
  `files: [dist/bin.js, README.md]` keeps the unbundled (broken-import)
  tsc module tree out of the registry.

## Related

- [[150-tdd-scaffolding-a-new-workspace-package-has-two-gate-traps]] — the
  same package's earlier infra traps (typecheck no-inputs, enumerated CI).
- [[092-workspace-package-dist-is-gitignored-and-not-auto-rebuilt]] — R16,
  the build-before-test discipline this sprint leaned on throughout.

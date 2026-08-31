---
date: 2026-08-31
tier: lesson
summary: In a dual ESM+CJS build, node16/nodenext take the emit format from the SOURCE package.json, not from outDir — so the CJS config compiles clean, exits 0, and writes ESM into dist/cjs; only the emitted bytes can tell you the format is right
tags: [typescript, build, tsconfig, monorepo, deps, silent-failure, verification]
---

# A dual-emit CJS build takes its format from the source `package.json`, not `outDir`

**Date:** 2026-08-31
**Issue:** #1489 (TypeScript 7 removed `moduleResolution: node10`, blocking #1455)
**Tags:** typescript, build, tsconfig, monorepo, deps, silent-failure, verification

## What happened

TypeScript 7.0.2 removed `moduleResolution: "node"` (`node10`), so every `tsc`
resolving a config that still set it failed with `TS5108` — including the root
`prepare` step, which is why *every* job on the dev-deps bump was red.

`shared-contracts` and `analytics-core` compile the same `"type": "module"`
sources twice: `tsconfig.esm.json` → `dist/esm`, `tsconfig.cjs.json` →
`dist/cjs`, then a marker `{"type":"commonjs"}` is written into `dist/cjs/`.

The obvious replacement for `node10` is `node16`/`nodenext`. It is wrong here,
and **it is wrong silently**:

```
$ tsc -p tsconfig.cjs.json     # module+moduleResolution: node16
$ echo $?
0
$ head -3 dist/cjs/index.js
export { SCHEMA_VERSION, ... } from './version.js';
```

`node16`/`nodenext` derive CJS-vs-ESM emit from the **nearest `package.json` to
the SOURCE file** (`"type": "module"`), not from `outDir`. So the CJS build
emits ESM into `dist/cjs`, exits 0, and every `require()` consumer later dies on
`SyntaxError: Unexpected token 'export'`. Because `dist/` is gitignored and
never auto-rebuilt (R16), that surfaces as a baffling consumer error weeks
later rather than as a red build.

`bundler` is the answer, and not by accident: TypeScript added
`--module commonjs --moduleResolution bundler`
([microsoft/TypeScript#62320](https://github.com/microsoft/TypeScript/pull/62320))
precisely because removing `node10` left *no* resolution mode legal alongside
`module: commonjs`. `moduleResolution` picks the resolver; `module` pins the
emit; only `bundler` lets you set them independently.

## How to apply

- **When a build's exit code cannot express the property you care about, assert
  the artifact.** "Did it compile?" and "did it emit the right module format?"
  are different questions, and `tsc` only answers the first. A dual-emit
  package needs a check that reads `dist/esm` for `import`/`export`, reads
  `dist/cjs` for `require`/`exports`, and actually `require()`s and `import()`s
  each entry point — assuming the CJS path works is how it stays broken.
  (`scripts/check-dual-build-emit.sh`, wired into CI right after the build.)
- **Falsify the guard before trusting it.** Reverting the config to `node16`
  must make the new check fail. A guard that has only ever been observed green
  is indistinguishable from a guard that cannot fail.
- **A major-version removal is rarely one option.** #1489 was filed as "four
  configs set `moduleResolution: node`"; it was five (an overlooked
  `tsconfig.cjs.json`), and TS 7 also deleted the entire JS compiler API —
  `typescript`'s `"."` export is now just `lib/version.cjs`, so `ts.sys` and
  `ts.createProgram` are gone and anything driving the compiler
  programmatically must move to the `tsc` binary. Enumerate by running the new
  version over every entry point, not by reading the issue's table.
- **A staged deprecation has a due date, and the flag stops helping on it.**
  `ignoreDeprecations: "6.0"` (Lesson 099) was the correct staging move for the
  TS 6 bump; at TS 7 it silences nothing, because the deprecation became a
  removal. Clear the flag in the migration, do not carry it forward.

## Related

- [[ignoredeprecations-is-the-sanctioned-staging-path-for-ts-major-bumps]] —
  the other end of this migration: why the flag was right in TS 6, and the
  breadcrumb that made this task discoverable.
- [[workspace-package-dist-is-gitignored-and-not-auto-rebuilt]] (R16) — the
  reason a wrong emit is quiet: nothing rebuilds `dist/` to expose it.

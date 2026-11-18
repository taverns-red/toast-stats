---
date: 2026-09-08
tier: lesson
summary: A package that declares a plugin but not its host runner invites a silent major split — and the split reports itself as a missing config option, not as a version mismatch
tags: [monorepo, npm-workspaces, dependencies, vitest, test-infra, coverage]
---

# A plugin declared without its host runner invites a version split — which then reports itself as a config error

**Date:** 2026-09-08
**Issue:** #1529 (vitest 4 → 5 migration, unblocking Dependabot #1524)
**Tags:** monorepo, npm-workspaces, dependencies, vitest, test-infra, coverage

## What happened

Dependabot's `vitest` 4 → 5 bump failed CI with a headline that reads like a
missing setting:

```
Vitest caught 14 unhandled errors during the test run.
AssertionError: coverageFilesDirectory is required
```

`coverageFilesDirectory` is not a user-facing option. It is a **vitest-5
internal**: v5's core computes it (`getCoverageFilesDirectory(reportsDirectory,
shard)`) and ships it in the options payload the worker's `takeCoverage`
receives. v4's core never sends that field, so `@vitest/coverage-v8@5`'s
`assert(coverageFilesDirectory, …)` fires once per test file.

Three lines above the error, the runner had already said exactly what was wrong:

```
Loaded  vitest@4.1.11  and  @vitest/coverage-v8@5.0.0 .
Running mixed versions is not supported and may lead into bugs
 RUN  v4.1.11
```

The lockfile hoisted `@vitest/coverage-v8@5.0.0` to the root while leaving a
nested `node_modules/vitest@4.1.11` inside **every** workspace. Each package ran
the v4 runner against the v5 coverage provider.

## Why the split was possible at all

The repo root declared `@vitest/coverage-v8` in `devDependencies` but **not**
`vitest` — while its own `test:scripts` script ran `vitest`, resolved from
whatever happened to be hoisted. A plugin pinned at the root with its host
runner left floating is precisely the shape that lets a partial bump land two
different majors in one tree, and neither `package.json` looks wrong on
inspection.

## The takeaway

**Declare the host alongside every plugin that must version-match it, in the
same manifest.** Coverage providers, ESLint parsers, Babel/PostCSS plugins,
Jest/Vitest transformers: if the pair must agree on a major, the pair must be
pinned in the same place. Otherwise a bump can move one and not the other, and
the failure will surface as a mystery error deep inside the plugin rather than
as a version complaint.

Second-order: **read the lines above a `Test Run Error`.** The 14 errors here
were 14 identical worker-teardown assertions (one per shared-contracts test
file), and the banner that explained them scrolled past three lines earlier. The
error count reflected the file count, not the number of distinct problems.

## The check that would have caught it

Before debugging a runner-plugin failure, ask the tree what it actually
installed — not what `package.json` asked for:

```bash
python3 -c "
import json, glob
for p in glob.glob('**/node_modules/vitest/package.json', recursive=True):
    print(p, json.load(open(p))['version'])
"
```

More than one version, or a nested copy that differs from the hoisted one, is
the answer. A matched tree fixed it with no config change at all.

## Related

- The same migration broke `toHaveNoViolations` typing, and that one was
  genuinely independent: vitest 5 inlined the `expect` package, dropping the
  `JestAssertion extends jest.Matchers` bridge `@types/jest-axe` augments. Two
  breaks in one major; do not let the loud one absorb the quiet one.
- `npm run typecheck` does not cover `npm run typecheck:tests` — the axe break
  was invisible to the former.

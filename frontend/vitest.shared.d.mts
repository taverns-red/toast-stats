/**
 * Types for `vitest.shared.mjs` — the single source of truth for the
 * unit/integration partition and the CI worker cap (#482, #914).
 *
 * The module is plain ESM JavaScript (it is loaded by `vitest.config.ts` and by
 * `scripts/check-test-projects.mjs`, which is not compiled). Its guard test
 * `src/__tests__/config/maxWorkers.guard.test.ts` imports it, so once the test
 * tree came under tsc (#1368) the import needed declarations rather than an
 * implicit `any`.
 */

/** Vitest `maxWorkers`: `'50%'` under CI, a fixed 3 forks locally. */
export function resolveMaxWorkers(
  env?: { CI?: string | undefined } | undefined
): string | number

/** Globs that route a test file into the heavier `integration` project. */
export const integrationGlobs: string[]

/** Excludes shared by every project, including quarantined files. */
export const baseExclude: string[]

/**
 * Which Playwright smoke specs the PR-preview job runs (#2141).
 *
 * Every `frontend/e2e/*.smoke.ts` used to need its own hand-written step in
 * `.github/workflows/pr-preview.yml`. Six specs were written without one
 * (district-growth among them) and ran only on the author's machine. The
 * named steps stay — each carries its rationale and several are pinned by
 * contract tests — and a last catch-all step runs every spec no named step
 * runs, so a new spec is in CI the day it lands.
 *
 * Pure: the caller reads the workflow and lists the spec files.
 */
import { parse } from 'yaml'

/** The catch-all step's name. Its own `run` never counts as naming a spec. */
export const CATCH_ALL_STEP = 'Remaining smoke specs against preview'

/** The `specs` value of the shards that run every spec no shard names. */
export const REMAINING = '@remaining'

/** The Playwright projects of `frontend/playwright.config.ts`: the engines. */
export const PROJECTS = ['smoke', 'webkit'] as const

/** One entry of `jobs.smoke.strategy.matrix.include` (#2453). */
export interface SmokeShard {
  shard: string
  /** Whitespace-separated spec paths, or {@link REMAINING}. */
  specs: string
  /** One Playwright project; absent = both engines. */
  project?: string
  /** `i/N`: Playwright `--shard`, run fully parallel; absent = whole. */
  split?: string
  /** Playwright `--workers`; absent = the config default. */
  workers?: string
}

/** The smoke job's matrix entries. Not implemented yet (#2453 red). */
export function smokeShards(_workflowYaml: string): SmokeShard[] {
  return []
}

/** The smoke job's env. Not implemented yet (#2453 red). */
export function smokeJobEnv(_workflowYaml: string): Record<string, string> {
  return {}
}

/** Coverage problems of a shard plan. Not implemented yet (#2453 red). */
export function shardCoverageProblems(
  _shards: readonly SmokeShard[],
  _specs: readonly string[]
): string[] {
  return ['not implemented']
}

/** A spec path as a step's `run` names it, relative to `frontend/`. */
const SPEC_PATH = /\be2e\/[\w./-]+\.smoke\.ts\b/g

interface Step {
  name?: string
  run?: string
}
interface Workflow {
  jobs?: Record<string, { steps?: Step[] }>
}

/**
 * Specs named by a `playwright test` step of the workflow, other than the
 * catch-all. Reads each step's `run` only, so a spec mentioned in a YAML
 * comment is not counted as run.
 */
export function namedSmokeSpecs(workflowYaml: string): string[] {
  const wf = parse(workflowYaml) as Workflow
  const named = new Set<string>()
  for (const job of Object.values(wf.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (step.name === CATCH_ALL_STEP) continue
      const run = step.run ?? ''
      if (!/\bplaywright test\b/.test(run)) continue
      for (const m of run.match(SPEC_PATH) ?? []) named.add(m)
    }
  }
  return [...named].sort()
}

/** The specs no named step runs, sorted: what the catch-all step runs. */
export function unlistedSmokeSpecs(
  specs: readonly string[],
  named: readonly string[]
): string[] {
  const done = new Set(named)
  return [...new Set(specs)].filter(s => !done.has(s)).sort()
}

/**
 * Spec paths (`e2e/...`) from file paths relative to `frontend/e2e`, matching
 * the Playwright config's `testMatch: '**\/*.smoke.ts'`.
 */
export function toSpecPaths(relFiles: readonly string[]): string[] {
  return relFiles
    .map(f => f.split('\\').join('/'))
    .filter(f => f.endsWith('.smoke.ts'))
    .map(f => `e2e/${f}`)
    .sort()
}

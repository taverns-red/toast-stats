/**
 * Which Playwright smoke specs the PR-preview workflow runs (#2141, #2453).
 *
 * Every `frontend/e2e/*.smoke.ts` once needed its own hand-written step in
 * `.github/workflows/pr-preview.yml`, and six were written without one
 * (#2141). Since #2453 the smokes run as a matrix of parallel shards: each
 * entry names its specs (with their rationale in a comment above it), and the
 * `@remaining` entries run every spec no entry names, so a new spec is in CI
 * the day it lands. {@link shardCoverageProblems} is the tripwire that no
 * spec, engine or split part falls out of the plan.
 *
 * Pure: the caller reads the workflow and lists the spec files.
 */
import { parse } from 'yaml'

/** The `specs` value of the shards that run every spec no shard names. */
export const REMAINING = '@remaining'

/** The Playwright projects of `frontend/playwright.config.ts`: the engines. */
export const PROJECTS = ['smoke', 'webkit'] as const

/** The matrix job in `pr-preview.yml` that runs the smokes (#2453). */
export const SMOKE_JOB = 'smoke'

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

interface Workflow {
  jobs?: Record<
    string,
    {
      env?: Record<string, string>
      strategy?: { matrix?: { include?: Record<string, unknown>[] } }
    }
  >
}

const str = (v: unknown): string | undefined =>
  v === undefined || v === null ? undefined : String(v)

/** The smoke job's matrix entries, as written. */
export function smokeShards(workflowYaml: string): SmokeShard[] {
  const wf = parse(workflowYaml) as Workflow
  const include = wf.jobs?.[SMOKE_JOB]?.strategy?.matrix?.include ?? []
  return include.map(e => ({
    shard: String(e['shard'] ?? ''),
    specs: String(e['specs'] ?? ''),
    project: str(e['project']),
    split: str(e['split']),
    workers: str(e['workers']),
  }))
}

/** The smoke job's `env` (BASE_URL lives there). */
export function smokeJobEnv(workflowYaml: string): Record<string, string> {
  const wf = parse(workflowYaml) as Workflow
  return wf.jobs?.[SMOKE_JOB]?.env ?? {}
}

const specList = (specs: string): string[] =>
  specs.split(/\s+/).filter(s => s !== '')

/**
 * Specs named by a smoke shard, other than the {@link REMAINING} ones. Reads
 * the matrix values only, so a spec mentioned in a YAML comment is not
 * counted as run.
 */
export function namedSmokeSpecs(workflowYaml: string): string[] {
  const named = new Set<string>()
  for (const s of smokeShards(workflowYaml))
    for (const spec of specList(s.specs))
      if (spec !== REMAINING) named.add(spec)
  return [...named].sort()
}

/**
 * Everything that would make the shard plan drop or double a test, as
 * readable lines; `[]` means every spec runs in every project exactly once.
 *
 * Entries with the same specs and project are one Playwright run split by
 * `--shard`; it only counts when its parts are exactly 1/N..N/N. Playwright
 * guarantees those parts partition the run (R20: the split is the tool's own,
 * not re-implemented here).
 */
export function shardCoverageProblems(
  shards: readonly SmokeShard[],
  specs: readonly string[]
): string[] {
  const problems: string[] = []
  const all = new Set(specs)
  const projects: readonly string[] = PROJECTS

  const names = new Map<string, number>()
  for (const s of shards) names.set(s.shard, (names.get(s.shard) ?? 0) + 1)
  for (const [name, n] of names)
    if (n > 1) problems.push(`shard name "${name}" is used ${n} times`)

  const named = new Set<string>()
  for (const s of shards)
    for (const spec of specList(s.specs))
      if (spec !== REMAINING) named.add(spec)
  for (const spec of [...named].sort())
    if (!all.has(spec)) problems.push(`${spec} does not exist`)
  const remaining = unlistedSmokeSpecs(specs, [...named])

  // One Playwright run = the same spec list in the same project(s).
  const runs = new Map<
    string,
    { specs: string[]; projects: string[]; splits: string[]; shards: string[] }
  >()
  for (const s of shards) {
    const project = s.project?.trim() || ''
    if (project && !projects.includes(project)) {
      problems.push(`shard "${s.shard}": unknown project "${project}"`)
      continue
    }
    const split = s.split?.trim() || ''
    if (split && !/^\d+\/\d+$/.test(split)) {
      problems.push(`shard "${s.shard}": malformed split "${split}"`)
      continue
    }
    const list = [
      ...new Set(
        specList(s.specs).flatMap(x => (x === REMAINING ? remaining : [x]))
      ),
    ].sort()
    const key = `${list.join(' ')}|${project}`
    const run = runs.get(key) ?? {
      specs: list,
      projects: project ? [project] : [...projects],
      splits: [],
      shards: [],
    }
    run.splits.push(split)
    run.shards.push(s.shard)
    runs.set(key, run)
  }

  const count = new Map<string, number>()
  for (const run of runs.values()) {
    if (!completeSplit(run.splits)) {
      problems.push(
        `incomplete split [${run.splits.join(', ')}] in shards ` +
          `${run.shards.join(', ')}: some of its tests never run`
      )
      continue
    }
    for (const spec of run.specs)
      for (const p of run.projects) {
        const k = `${spec} (${p})`
        count.set(k, (count.get(k) ?? 0) + 1)
      }
  }
  for (const spec of [...all].sort())
    for (const p of projects) {
      const n = count.get(`${spec} (${p})`) ?? 0
      if (n === 0) problems.push(`${spec} (${p}) is not run by any shard`)
      if (n > 1) problems.push(`${spec} (${p}) is run ${n} times`)
    }
  return problems
}

/** `['']` (whole) or exactly `1/N..N/N`, once each. */
function completeSplit(splits: readonly string[]): boolean {
  if (splits.length === 1 && splits[0] === '') return true
  if (splits.includes('')) return false
  const parsed = splits.map(s => s.split('/').map(Number) as [number, number])
  const n = parsed[0]![1]
  if (parsed.some(([, t]) => t !== n) || parsed.length !== n) return false
  const parts = new Set(parsed.map(([i]) => i))
  for (let i = 1; i <= n; i++) if (!parts.has(i)) return false
  return true
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

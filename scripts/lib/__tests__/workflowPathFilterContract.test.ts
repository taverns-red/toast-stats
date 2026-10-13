/**
 * Workflow contract: a path-filtered workflow triggers on every repo file its
 * steps run (#2005).
 *
 * A workflow with an `on.<event>.paths` (or `paths-ignore`) filter only runs
 * when a changed file passes it. If a step runs a repo script or config that
 * the filter does not match, a PR changing only that file merges without the
 * gate it defines ever running. This bit three times — `lighthouserc.mobile.js`
 * (#1994), `scripts/lighthouse-cdn-server.mjs` (#2000), and
 * `scripts/check-critical-path.ts` / `scripts/check-map-route-budget.ts`
 * (#2005) — so this test generalises the per-file guard in
 * `lighthouseConfigPathFilter.test.ts` to every workflow:
 *
 * for each workflow with a path filter, every existing repo file referenced in
 * a step's `run:` script or `with:` inputs (resolved against the step's
 * `working-directory`) must pass that workflow's filter for every filtered
 * event. Exemptions are listed in `EXEMPT` with a reason; nothing is skipped
 * silently.
 *
 * Indirection through `npm run <script>` is deliberately out of scope: the
 * files a package.json script runs are not visible in the workflow text.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import picomatch from 'picomatch'
import { parse } from 'yaml'

const ROOT = process.cwd()
const WORKFLOWS = path.join(ROOT, '.github/workflows')

/**
 * `<workflow>: <repo-relative file>` -> reason it may fall outside the filter.
 */
const EXEMPT: Record<string, string> = {
  'docs.yml: package.json':
    'only read for the pinned prettier version; a package.json change is not ' +
    "in ci.yml's paths-ignore, so ci.yml's format check (which covers " +
    '**/*.md) runs on it instead',
}

interface Step {
  run?: string
  with?: Record<string, unknown>
  'working-directory'?: string
}
interface Job {
  steps?: Step[]
  defaults?: { run?: { 'working-directory'?: string } }
}
interface EventFilter {
  paths?: string[]
  'paths-ignore'?: string[]
}
interface Workflow {
  on?: Record<string, EventFilter | null> | string | string[]
  defaults?: { run?: { 'working-directory'?: string } }
  jobs?: Record<string, Job>
}

const workflows = fs
  .readdirSync(WORKFLOWS)
  .filter(f => /\.ya?ml$/.test(f))
  .sort()
  .map(f => ({
    file: f,
    wf: parse(fs.readFileSync(path.join(WORKFLOWS, f), 'utf-8')) as Workflow,
  }))

/** Events of a workflow that carry a path filter. */
function filteredEvents(wf: Workflow): [string, EventFilter][] {
  if (!wf.on || typeof wf.on !== 'object' || Array.isArray(wf.on)) return []
  return Object.entries(wf.on).filter(
    (e): e is [string, EventFilter] =>
      !!e[1] &&
      typeof e[1] === 'object' &&
      (Array.isArray(e[1].paths) || Array.isArray(e[1]['paths-ignore']))
  )
}

const match = (glob: string, file: string) =>
  picomatch(glob, { dot: true })(file)

/**
 * GitHub's semantics: `paths` patterns are evaluated in order, a later
 * `!pattern` re-excluding what an earlier one included; `paths-ignore`
 * excludes any file it matches.
 */
function passes(filter: EventFilter, file: string): boolean {
  if (filter.paths) {
    let included = false
    for (const p of filter.paths) {
      if (p.startsWith('!')) {
        if (match(p.slice(1), file)) included = false
      } else if (match(p, file)) included = true
    }
    return included
  }
  return !(filter['paths-ignore'] ?? []).some(p => match(p, file))
}

/**
 * Path-like tokens: start of token, optional ./, segments, then a file name
 * with an extension (`check.ts`) or a dotfile (`.nvmrc`).
 */
const PATH_TOKEN =
  /(?<![\w./${}-])(?:\.\/)?(?:[\w.-]+\/)*(?:[\w-][\w.-]*\.[A-Za-z]\w*|\.[A-Za-z][\w.-]*)(?![\w/-])/g

/** Existing repo files referenced by a string, relative to `cwd`. */
function filesIn(text: string, cwd: string): string[] {
  return [...text.matchAll(PATH_TOKEN)]
    .map(m => path.posix.normalize(path.posix.join(cwd, m[0])))
    .filter(p => !p.startsWith('..'))
    .filter(p => {
      const abs = path.join(ROOT, p)
      return fs.existsSync(abs) && fs.statSync(abs).isFile()
    })
}

/** Every repo file a workflow's steps reference. */
function filesRunBy(wf: Workflow): string[] {
  const out = new Set<string>()
  for (const job of Object.values(wf.jobs ?? {})) {
    const jobCwd =
      job.defaults?.run?.['working-directory'] ??
      wf.defaults?.run?.['working-directory'] ??
      '.'
    for (const step of job.steps ?? []) {
      const cwd = step['working-directory'] ?? jobCwd
      if (step.run) filesIn(step.run, cwd).forEach(f => out.add(f))
      for (const v of Object.values(step.with ?? {})) {
        // `with:` inputs resolve against the workspace root, not the step cwd.
        if (typeof v === 'string') filesIn(v, '.').forEach(f => out.add(f))
      }
    }
  }
  return [...out].sort()
}

const filtered = workflows.filter(w => filteredEvents(w.wf).length > 0)

describe('workflow path filters cover the files their steps run (#2005)', () => {
  it('finds the path-filtered workflows', () => {
    expect(filtered.map(w => w.file)).toEqual(
      expect.arrayContaining([
        'ci.yml',
        'docs.yml',
        'lighthouse-ci.yml',
        'pr-preview.yml',
      ])
    )
  })

  it('extracts the scripts lighthouse-ci.yml runs', () => {
    const lh = workflows.find(w => w.file === 'lighthouse-ci.yml')!
    expect(filesRunBy(lh.wf)).toEqual(
      expect.arrayContaining([
        'lighthouserc.js',
        'scripts/check-critical-path.ts',
        'scripts/check-map-route-budget.ts',
      ])
    )
  })

  it('extracts dotfiles from with: inputs', () => {
    const lh = workflows.find(w => w.file === 'lighthouse-ci.yml')!
    expect(filesRunBy(lh.wf)).toContain('.nvmrc')
  })

  it('resolves run: paths against working-directory', () => {
    const pr = workflows.find(w => w.file === 'pr-preview.yml')!
    expect(filesRunBy(pr.wf)).toContain('frontend/playwright.config.ts')
  })

  it('applies negated paths patterns in order', () => {
    const f = { paths: ['scripts/**', '!scripts/x.ts'] }
    expect(passes(f, 'scripts/y.ts')).toBe(true)
    expect(passes(f, 'scripts/x.ts')).toBe(false)
    expect(passes({ 'paths-ignore': ['**/*.md'] }, 'a/b.md')).toBe(false)
  })

  it.each(filtered.map(w => [w.file, w.wf] as const))(
    '%s triggers on every file it runs',
    (file, wf) => {
      const missing = filteredEvents(wf).flatMap(([event, filter]) =>
        filesRunBy(wf)
          .filter(f => !passes(filter, f))
          .filter(f => !(`${file}: ${f}` in EXEMPT))
          .map(f => `${event}: ${f}`)
      )
      expect(missing).toEqual([])
    }
  )

  it('every exemption is still needed', () => {
    const live = new Set(
      filtered.flatMap(({ file, wf }) =>
        filteredEvents(wf).flatMap(([, filter]) =>
          filesRunBy(wf)
            .filter(f => !passes(filter, f))
            .map(f => `${file}: ${f}`)
        )
      )
    )
    expect(Object.keys(EXEMPT).filter(k => !live.has(k))).toEqual([])
  })
})

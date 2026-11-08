/**
 * Contract: every `frontend/e2e/*.smoke.ts` runs in the PR-preview workflow,
 * in BOTH engines, exactly once (#2141, #2453).
 *
 * Six specs (district-growth, district-education, district-survival,
 * clubs-coach-column, kpi-tier-labels, staging) once had no step in
 * `pr-preview.yml`, so they ran only locally (#2141). Since #2453 the smokes
 * run as a matrix of parallel shards (`jobs.smoke.strategy.matrix.include`).
 * A spec is either named by a shard or picked up by the `@remaining` shards,
 * which run what `scripts/unlisted-smoke-specs.ts` prints.
 *
 * Sharding adds two new ways to drop coverage silently, and this file is the
 * tripwire for both (R20):
 *   - a spec split with `--shard=i/N` across N matrix entries loses tests if
 *     any one of the N entries is deleted or renumbered;
 *   - an entry filtered to one Playwright project (`--project=smoke`) drops
 *     the other engine unless another entry runs it.
 * So coverage is checked per spec AND per project, and a split only counts
 * when all N parts of it are present.
 *
 * Lesson 082: a gate that is never invoked protects nothing, so this checks
 * the wiring, not just the files.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  PROJECTS,
  REMAINING,
  namedSmokeSpecs,
  shardCoverageProblems,
  smokeShards,
  toSpecPaths,
  unlistedSmokeSpecs,
  type SmokeShard,
} from '../smokeSpecCoverage'

const ROOT = process.cwd()
const PR_PREVIEW = path.join(ROOT, '.github/workflows/pr-preview.yml')
const E2E = path.join(ROOT, 'frontend/e2e')

interface Step {
  name?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
  'working-directory'?: string
}
interface Job {
  name?: string
  needs?: string | string[]
  if?: string
  env?: Record<string, string>
  strategy?: { 'fail-fast'?: boolean; matrix?: unknown }
  steps?: Step[]
}

const wfText = fs.readFileSync(PR_PREVIEW, 'utf-8')
const jobs = (parse(wfText) as { jobs: Record<string, Job> }).jobs
const specs = toSpecPaths(
  fs.readdirSync(E2E, { recursive: true, encoding: 'utf-8' })
)

describe('smoke spec selection (pure)', () => {
  const wf = `
jobs:
  smoke:
    strategy:
      matrix:
        include:
          # e2e/commented.smoke.ts is only a comment
          - shard: one
            specs: e2e/one.smoke.ts
          - shard: folded
            specs: >-
              e2e/two.smoke.ts
              e2e/three.smoke.ts
          - shard: rest
            specs: '${REMAINING}'
`
  it('reads the matrix shards', () => {
    expect(smokeShards(wf).map(s => s.shard)).toEqual(['one', 'folded', 'rest'])
  })

  it('reads specs from the shards, ignoring the remaining sentinel', () => {
    expect(namedSmokeSpecs(wf)).toEqual([
      'e2e/one.smoke.ts',
      'e2e/three.smoke.ts',
      'e2e/two.smoke.ts',
    ])
  })

  it('returns the specs no shard names, sorted and de-duplicated', () => {
    expect(
      unlistedSmokeSpecs(
        [
          'e2e/z.smoke.ts',
          'e2e/one.smoke.ts',
          'e2e/a.smoke.ts',
          'e2e/a.smoke.ts',
        ],
        ['e2e/one.smoke.ts']
      )
    ).toEqual(['e2e/a.smoke.ts', 'e2e/z.smoke.ts'])
  })

  it('maps e2e-relative files to spec paths, smoke specs only', () => {
    expect(
      toSpecPaths(['b.smoke.ts', 'helpers/x.ts', 'sub\\c.smoke.ts', 'a.json'])
    ).toEqual(['e2e/b.smoke.ts', 'e2e/sub/c.smoke.ts'])
  })
})

describe('shard coverage tripwire (pure, #2453)', () => {
  const all = ['e2e/a.smoke.ts', 'e2e/b.smoke.ts', 'e2e/c.smoke.ts']
  const s = (shard: string, x: Partial<SmokeShard>): SmokeShard => ({
    shard,
    specs: '',
    ...x,
  })

  it('accepts whole, complete-split and per-project coverage', () => {
    expect(
      shardCoverageProblems(
        [
          s('a', { specs: 'e2e/a.smoke.ts' }),
          s('b1', { specs: 'e2e/b.smoke.ts', split: '1/2' }),
          s('b2', { specs: 'e2e/b.smoke.ts', split: '2/2' }),
          s('c-chromium', { specs: 'e2e/c.smoke.ts', project: 'smoke' }),
          s('c-webkit', { specs: 'e2e/c.smoke.ts', project: 'webkit' }),
        ],
        all
      )
    ).toEqual([])
  })

  it('flags a spec no shard runs', () => {
    const p = shardCoverageProblems(
      [s('a', { specs: 'e2e/a.smoke.ts e2e/b.smoke.ts' })],
      all
    )
    expect(p.join('\n')).toMatch(/e2e\/c\.smoke\.ts \(smoke\) is not run/)
  })

  it('lets the remaining shards pick up every unnamed spec', () => {
    expect(
      shardCoverageProblems(
        [
          s('a', { specs: 'e2e/a.smoke.ts' }),
          s('r1', { specs: REMAINING, split: '1/2' }),
          s('r2', { specs: REMAINING, split: '2/2' }),
        ],
        all
      )
    ).toEqual([])
  })

  it('flags a split with a part missing', () => {
    const p = shardCoverageProblems(
      [
        s('a', { specs: 'e2e/a.smoke.ts e2e/c.smoke.ts' }),
        s('b1', { specs: 'e2e/b.smoke.ts', split: '1/3' }),
        s('b3', { specs: 'e2e/b.smoke.ts', split: '3/3' }),
      ],
      all
    ).join('\n')
    expect(p).toMatch(/incomplete split/)
    expect(p).toMatch(/e2e\/b\.smoke\.ts \(smoke\) is not run/)
  })

  it('flags a split whose parts disagree on N', () => {
    const p = shardCoverageProblems(
      [
        s('a', { specs: 'e2e/a.smoke.ts e2e/c.smoke.ts' }),
        s('b1', { specs: 'e2e/b.smoke.ts', split: '1/2' }),
        s('b2', { specs: 'e2e/b.smoke.ts', split: '2/3' }),
      ],
      all
    ).join('\n')
    expect(p).toMatch(/incomplete split/)
  })

  it('flags a project-filtered entry whose other engine never runs', () => {
    const p = shardCoverageProblems(
      [
        s('ab', { specs: 'e2e/a.smoke.ts e2e/b.smoke.ts' }),
        s('c', { specs: 'e2e/c.smoke.ts', project: 'smoke' }),
      ],
      all
    ).join('\n')
    expect(p).toMatch(/e2e\/c\.smoke\.ts \(webkit\) is not run/)
  })

  it('flags a spec run twice in the same engine', () => {
    const p = shardCoverageProblems(
      [
        s('abc', { specs: 'e2e/a.smoke.ts e2e/b.smoke.ts e2e/c.smoke.ts' }),
        s('a-again', { specs: 'e2e/a.smoke.ts', project: 'webkit' }),
      ],
      all
    ).join('\n')
    expect(p).toMatch(/e2e\/a\.smoke\.ts \(webkit\) is run 2 times/)
  })

  it('flags a named spec that does not exist, and duplicate shard names', () => {
    const p = shardCoverageProblems(
      [
        s('x', { specs: 'e2e/a.smoke.ts e2e/b.smoke.ts e2e/c.smoke.ts' }),
        s('x', { specs: 'e2e/gone.smoke.ts' }),
      ],
      all
    ).join('\n')
    expect(p).toMatch(/e2e\/gone\.smoke\.ts does not exist/)
    expect(p).toMatch(/shard name "x" is used 2 times/)
  })

  it('flags an unknown project and a malformed split', () => {
    const p = shardCoverageProblems(
      [
        s('a', { specs: 'e2e/a.smoke.ts e2e/b.smoke.ts e2e/c.smoke.ts' }),
        s('bad', { specs: 'e2e/a.smoke.ts', project: 'firefox' }),
        s('bad2', { specs: 'e2e/a.smoke.ts', split: 'half' }),
      ],
      all
    ).join('\n')
    expect(p).toMatch(/unknown project "firefox"/)
    expect(p).toMatch(/malformed split "half"/)
  })
})

describe('every smoke spec runs in pr-preview.yml, both engines (#2141, #2453)', () => {
  const shards = smokeShards(wfText)
  const named = namedSmokeSpecs(wfText)

  it('finds the smoke specs and the shards', () => {
    expect(specs.length).toBeGreaterThan(30)
    expect(shards.length).toBeGreaterThan(10)
  })

  it('the Playwright projects are the two engines', () => {
    expect([...PROJECTS]).toEqual(['smoke', 'webkit'])
  })

  it('runs every spec in every engine exactly once, every split complete', () => {
    expect(shardCoverageProblems(shards, specs)).toEqual([])
  })

  it('has remaining shards, so a new spec runs the day it lands', () => {
    expect(shards.some(s => s.specs.trim() === REMAINING)).toBe(true)
  })

  it('names no spec that does not exist', () => {
    expect(named.filter(s => !specs.includes(s))).toEqual([])
  })

  it('has spec file names the shard step can word-split', () => {
    for (const s of specs) expect(s).toMatch(/^[\w./-]+$/)
  })
})

describe('the smoke shard job (#2453)', () => {
  const smoke = jobs['smoke']
  const steps = smoke?.steps ?? []
  const run = steps.find(s => /playwright test/.test(s.run ?? ''))

  it('runs after the deploy, only when the heavy suite is on', () => {
    expect(smoke?.needs).toBe('preview')
    expect(smoke?.if).toBe("needs.preview.outputs.heavy == 'true'")
  })

  it('lets every shard finish when one fails', () => {
    expect(smoke?.strategy?.['fail-fast']).toBe(false)
  })

  it("drives the preview job's build served locally, not a default (#2544)", () => {
    // The same build the channel gets; prPreviewLocalBuild.test.ts proves
    // it is downloaded and served before the shards run.
    expect(smoke?.env?.['BASE_URL']).toBe('http://127.0.0.1:4173')
  })

  it('hands the matrix entry to the step through env, not inline', () => {
    expect(run, 'a playwright test step').toBeDefined()
    expect(run?.['working-directory']).toBe('frontend')
    expect(run?.env).toEqual({
      SPECS: '${{ matrix.specs }}',
      PROJECT: '${{ matrix.project }}',
      SPLIT: '${{ matrix.split }}',
      WORKERS: '${{ matrix.workers }}',
      // The CDN fixtures the shards read instead of live staging (#2545).
      SMOKE_FIXTURES_DIR: '${{ runner.temp }}/smoke-fixtures',
    })
    expect(run?.run ?? '').not.toContain('${{')
  })

  describe('its run script', () => {
    const script = run?.run ?? ''

    it('expands the remaining sentinel with the selector', () => {
      expect(script).toContain(`"${REMAINING}"`)
      expect(script).toContain('scripts/unlisted-smoke-specs.ts')
    })

    it('exits before playwright when nothing is left', () => {
      // A bare `playwright test` runs EVERY spec a second time.
      const guard = script.indexOf('-z "$specs"')
      expect(guard).toBeGreaterThan(-1)
      expect(script.indexOf('exit 0', guard)).toBeGreaterThan(guard)
      expect(script.indexOf('playwright test')).toBeGreaterThan(guard)
    })

    it("splits only with Playwright's own --shard, fully parallel", () => {
      expect(script).toMatch(/--fully-parallel/)
      expect(script).toMatch(/--shard=\$SPLIT/)
      expect(script).toMatch(/--project=\$PROJECT/)
      expect(script).toMatch(/--workers=\$WORKERS/)
      expect(script).toMatch(
        /playwright test --config playwright\.config\.ts \$specs/
      )
    })
  })

  it('caches the browsers on the Playwright version, then installs both engines', () => {
    const cache = steps.find(s => s.uses?.startsWith('actions/cache@'))
    expect(cache?.with?.['path']).toBe('~/.cache/ms-playwright')
    expect(String(cache?.with?.['key'])).toContain(
      'steps.playwright.outputs.version'
    )
    const install = steps.findIndex(s =>
      /playwright install --with-deps chromium webkit/.test(s.run ?? '')
    )
    expect(install).toBeGreaterThan(steps.indexOf(cache as Step))
    expect(steps.indexOf(run as Step)).toBeGreaterThan(install)
  })

  it('uploads the failing shard results under a per-shard, per-attempt name', () => {
    const upload = steps.find(s =>
      s.uses?.startsWith('actions/upload-artifact')
    )
    expect(upload?.if).toBe('failure()')
    expect(String(upload?.with?.['name'])).toContain('${{ matrix.shard }}')
    expect(String(upload?.with?.['name'])).toContain(
      '${{ github.run_attempt }}'
    )
    expect(steps.indexOf(upload as Step)).toBeGreaterThan(
      steps.indexOf(run as Step)
    )
  })
})

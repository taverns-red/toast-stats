/**
 * The education rollup reaches prod (#1810, data from #1801; ADR-015 step 5).
 *
 * `derived/education-rollup/{<PY>,index}.json` is built in the
 * `education-rollup` job, AFTER the pipeline job promoted, so the run's
 * manifest promoter never sees it (and derived/ is not a promoted prefix
 * anyway: staging path == prod path, mirrored, never promoted). It reaches
 * prod the way the report sidecars do (#1763 PR 2, #2117):
 *
 * - the job mirrors it when the build succeeded AND this run promoted its
 *   snapshot date AND skip_promotion is off;
 * - a later run's promote-reports job re-tries it (--if-changed), only
 *   when prod's copy differs from staging's (the carry did, until #1767).
 * Both go through scripts/pipeline/mirror-education-rollup.sh, which copies
 * exactly the objects staging's index names (each one the build recorded in
 * the run manifest), the index LAST (R15), and only when the reports date
 * the rollup was built from (`asOf`) is a date prod indexes — a rollup of a
 * held day's reports must not ship ahead of that day.
 * The script runs for real against the gcloud shim (D10).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  findProdWriteSteps,
  prodWriteReasons,
  topLevelConjuncts,
  SKIP_CLAUSE_DOWNSTREAM,
  type Workflow,
} from '../prodWriteGuard.js'

const REPO = process.cwd()
const MIRROR = path.join(REPO, 'scripts/pipeline/mirror-education-rollup.sh')
const SHIM_DIR = path.join(REPO, 'scripts/lib/__tests__/fixtures/gcloud-shim')
const STG = 'stg-bucket'
const PROD = 'prod-bucket'
const PREFIX = 'derived/education-rollup/'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  'continue-on-error'?: boolean
}

const workflow = parse(
  fs.readFileSync(
    path.join(REPO, '.github/workflows/data-pipeline.yml'),
    'utf-8'
  )
) as Workflow & { jobs: Record<string, { steps?: Step[] }> }
const rollupSteps = (workflow.jobs['education-rollup']?.steps ?? []) as Step[]
const MIRROR_STEP = '[rollup] Mirror the education rollup into prod (#1810)'
const at = (pred: (s: Step) => boolean) => rollupSteps.findIndex(pred)
const mirrorStep = rollupSteps.find(s => s.name === MIRROR_STEP)

describe('the education-rollup job mirrors its build into prod (#1810)', () => {
  it('the build step reports success as an output, and only success', () => {
    const build = rollupSteps.find(s =>
      (s.run ?? '').includes('build-education-rollup.sh')
    )
    expect(build?.id).toBe('education')
    // The build is non-fatal (`|| ::warning::`), so success must be its own
    // signal: set only on the success branch.
    expect(build?.run).toMatch(
      /build-education-rollup\.sh "\$\{GCS_BUCKET\}"[^\n]*\n?[^\n]*&& echo "built=true" >> "\$GITHUB_OUTPUT"/
    )
  })

  it('mirrors only when built, this snapshot date promoted, and skip_promotion is off', () => {
    const expr = mirrorStep?.if ?? ''
    const c = topLevelConjuncts(expr)
    expect(c).toContain("steps.education.outputs.built == 'true'")
    expect(c).toContain(SKIP_CLAUSE_DOWNSTREAM)
    expect(c).toContain('contains⟨group⟩')
    expect(expr.replace(/\s+/g, ' ')).toContain(
      "contains(format(',{0},', needs.pipeline.outputs.promoted_dates), format(',{0},', needs.pipeline.outputs.snapshot_date))"
    )
    expect(mirrorStep?.['continue-on-error']).toBe(true)
    expect(mirrorStep?.run).toContain(
      'bash scripts/pipeline/mirror-education-rollup.sh "${GCS_BUCKET}" "${GCS_BUCKET_PRODUCTION}"'
    )
  })

  it('runs after the build and before the run manifest is republished', () => {
    const build = at(s => s.id === 'education')
    const mirror = at(s => s.name === MIRROR_STEP)
    const publish = at(s => s.name === '[rollup] Publish run manifest')
    expect(build).toBeGreaterThanOrEqual(0)
    expect(mirror).toBeGreaterThan(build)
    expect(publish).toBeGreaterThan(mirror)
  })

  it('the prod-write guard sees the mirror, and it is skip_promotion-guarded', () => {
    expect(
      prodWriteReasons('bash scripts/pipeline/mirror-education-rollup.sh a b')
    ).toEqual(['education rollup mirror → production'])
    const found = findProdWriteSteps(workflow).find(s => s.step === MIRROR_STEP)
    expect(found?.reasons).toEqual(['education rollup mirror → production'])
    expect(found?.guarded).toBe(true)
  })

  it('a later run’s promote-reports re-tries it with --if-changed (#1767)', () => {
    const retry = (workflow.jobs['promote-reports']?.steps ?? []).find(
      s =>
        s.name ===
        '[reports] Mirror the education rollup a held run built (#1810)'
    )
    expect(retry?.run).toBe(
      'bash scripts/pipeline/mirror-education-rollup.sh "${GCS_BUCKET}" "${GCS_BUCKET_PRODUCTION}" --if-changed'
    )
    const found = findProdWriteSteps(workflow).find(
      s => s.job === 'promote-reports' && s.step === retry?.name
    )
    expect(found?.guarded).toBe(true)
  })
})

describe('mirror-education-rollup.sh (shim)', () => {
  let tmp: string
  let root: string
  let log: string

  const ROLLUP_META = 'content-type=application/json\n'
  const put = (bucket: string, rel: string, body: string, meta = '') => {
    const f = path.join(root, bucket, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
    const m = path.join(root, '.meta', bucket, rel)
    fs.mkdirSync(path.dirname(m), { recursive: true })
    fs.writeFileSync(m, meta)
  }
  const read = (bucket: string, rel: string) => {
    const f = path.join(root, bucket, rel)
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null
  }
  const meta = (bucket: string, rel: string) =>
    fs.readFileSync(path.join(root, '.meta', bucket, rel), 'utf-8')
  const tree = (bucket: string): Record<string, string> => {
    const base = path.join(root, bucket)
    const out: Record<string, string> = {}
    for (const e of fs.readdirSync(base, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!e.isFile()) continue
      const abs = path.join(e.parentPath, e.name)
      out[path.relative(base, abs)] = fs.readFileSync(abs, 'utf-8')
    }
    return out
  }
  const index = (asOf: string | null, pys: string[], tag = 'a') =>
    JSON.stringify({
      _format: { version: '1.0.0', type: 'education-rollup-index' },
      asOf,
      programYears: pys.map(py => ({
        programYear: py,
        path: `${PREFIX}${py}.json`,
      })),
      tag,
    })
  const datesJson = (dates: string[]) =>
    JSON.stringify({ dates, count: dates.length })

  const run = (
    args: string[] = [STG, PROD],
    env: Record<string, string> = {}
  ) =>
    spawnSync('bash', [MIRROR, ...args], {
      cwd: REPO,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${SHIM_DIR}:${process.env.PATH}`,
        GCLOUD: path.join(SHIM_DIR, 'gcloud'),
        SHIM_ROOT: root,
        SHIM_LOG: log,
        GITHUB_STEP_SUMMARY: path.join(tmp, 'summary.md'),
        ...env,
      },
    })
  const calls = () =>
    fs.existsSync(log) ? fs.readFileSync(log, 'utf-8').split('\n') : []

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-education-'))
    root = path.join(tmp, 'gcs')
    log = path.join(tmp, 'gcloud.log')
    fs.mkdirSync(path.join(root, STG), { recursive: true })
    fs.mkdirSync(path.join(root, PROD), { recursive: true })
    put(PROD, 'v1/dates.json', datesJson(['2026-10-15', '2026-10-16']))
    put(STG, `${PREFIX}2018-2019.json`, '{"py":"2018-2019"}', ROLLUP_META)
    put(STG, `${PREFIX}2026-2027.json`, '{"py":"2026-2027"}', ROLLUP_META)
    put(
      STG,
      `${PREFIX}index.json`,
      index('2026-10-16', ['2018-2019', '2026-2027']),
      ROLLUP_META
    )
    // A stray object the index does not name is never copied.
    put(STG, `${PREFIX}scratch.json`, '{}', ROLLUP_META)
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('copies the objects the index names, bytes and headers as built, index last', () => {
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    for (const f of ['2018-2019.json', '2026-2027.json', 'index.json']) {
      expect(read(PROD, PREFIX + f)).toBe(read(STG, PREFIX + f))
      expect(meta(PROD, PREFIX + f)).toBe(ROLLUP_META)
    }
    expect(read(PROD, `${PREFIX}scratch.json`)).toBeNull()
    const cps = calls().filter(l => l.startsWith('storage cp '))
    expect(cps).toHaveLength(2)
    expect(cps[0]).toContain(`gs://${STG}/${PREFIX}2018-2019.json`)
    expect(cps[0]).not.toContain('index.json')
    expect(cps[1]).toBe(
      `storage cp gs://${STG}/${PREFIX}index.json gs://${PROD}/${PREFIX}`
    )
    expect(fs.readFileSync(path.join(tmp, 'summary.md'), 'utf-8')).toContain(
      'Mirrored the education rollup'
    )
  })

  it('writes only prod derived/education-rollup/, never rsyncs, moves or deletes', () => {
    const before = tree(STG)
    expect(run().status).toBe(0)
    expect(tree(STG)).toEqual(before)
    const all = calls()
    expect(all.some(l => /^storage (rsync|rm|mv)\b/.test(l))).toBe(false)
    for (const l of all.filter(l => l.startsWith('storage cp '))) {
      expect(l.trimEnd().endsWith(`gs://${PROD}/${PREFIX}`)).toBe(true)
    }
    expect(Object.keys(tree(PROD)).sort()).toEqual([
      `${PREFIX}2018-2019.json`,
      `${PREFIX}2026-2027.json`,
      `${PREFIX}index.json`,
      'v1/dates.json',
    ])
  })

  it('holds a rollup built from reports of a date prod does not index', () => {
    put(STG, `${PREFIX}index.json`, index('2026-10-17', ['2018-2019']))
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, `${PREFIX}index.json`)).toBeNull()
    expect(read(PROD, `${PREFIX}2018-2019.json`)).toBeNull()
    expect(fs.readFileSync(path.join(tmp, 'summary.md'), 'utf-8')).toMatch(
      /not mirrored.*2026-10-17/
    )
  })

  it('holds a rollup with no reports date at all', () => {
    put(STG, `${PREFIX}index.json`, index(null, ['2018-2019']))
    expect(run().status).toBe(0)
    expect(read(PROD, `${PREFIX}index.json`)).toBeNull()
  })

  it('no staging rollup is nothing to mirror, not an error', () => {
    fs.rmSync(path.join(root, STG, PREFIX), { recursive: true })
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, `${PREFIX}index.json`)).toBeNull()
  })

  it('--if-changed copies nothing when prod already has this index', () => {
    expect(run().status).toBe(0)
    fs.rmSync(log)
    const r = run([STG, PROD, '--if-changed'])
    expect(r.status, r.stderr).toBe(0)
    expect(calls().filter(l => l.startsWith('storage cp '))).toEqual([])
  })

  it('--if-changed copies when prod has an older index, or none', () => {
    put(PROD, `${PREFIX}index.json`, index('2026-10-15', ['2018-2019'], 'old'))
    expect(run([STG, PROD, '--if-changed']).status).toBe(0)
    expect(read(PROD, `${PREFIX}index.json`)).toBe(
      read(STG, `${PREFIX}index.json`)
    )
    fs.rmSync(path.join(root, PROD, PREFIX), { recursive: true })
    expect(run([STG, PROD, '--if-changed']).status).toBe(0)
    expect(read(PROD, `${PREFIX}2026-2027.json`)).not.toBeNull()
  })

  it('refuses an index naming a path outside derived/education-rollup/', () => {
    put(
      STG,
      `${PREFIX}index.json`,
      JSON.stringify({
        asOf: '2026-10-16',
        programYears: [{ path: 'v1/dates.json' }],
      })
    )
    const before = tree(PROD)
    expect(run().status).toBe(1)
    expect(tree(PROD)).toEqual(before)
  })

  it('fails on an unreadable prod date index and copies nothing', () => {
    fs.rmSync(path.join(root, PROD, 'v1/dates.json'))
    const r = run()
    expect(r.status).toBe(1)
    expect(read(PROD, `${PREFIX}index.json`)).toBeNull()
  })

  it('fails on a transport error reading the staging index', () => {
    const r = run([STG, PROD], {
      SHIM_FAIL_MATCH: `^cat gs://${STG}/${PREFIX}index\\.json`,
    })
    expect(r.status).toBe(1)
  })

  it('a failed year copy never writes the index', () => {
    const r = run([STG, PROD], { SHIM_FAIL_MATCH: '^cp .*2018-2019' })
    expect(r.status).not.toBe(0)
    expect(read(PROD, `${PREFIX}index.json`)).toBeNull()
  })

  it('refuses bad usage', () => {
    expect(run([STG]).status).toBe(2)
    expect(run([STG, STG]).status).toBe(2)
    expect(run([STG, PROD, '--always']).status).toBe(2)
  })

  it('the --if-changed retry copies a rollup prod lacks', () => {
    const r = spawnSync('bash', [MIRROR, STG, PROD, '--if-changed'], {
      cwd: REPO,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${SHIM_DIR}:${process.env.PATH}`,
        GCLOUD: path.join(SHIM_DIR, 'gcloud'),
        SHIM_ROOT: root,
        SHIM_LOG: log,
      },
    })
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, `${PREFIX}index.json`)).toBe(
      read(STG, `${PREFIX}index.json`)
    )
  })
})

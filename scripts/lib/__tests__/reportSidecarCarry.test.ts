/**
 * Report sidecars under scoped promotion (#1763, ADR-015 step 5, PR 2).
 *
 * `place-reports` writes snapshots/<date>/district_<id>_reports.json to
 * staging after the pipeline job promoted, outside the run manifest. Before
 * #1763 the whole-prefix rsync carried every sidecar a held run left behind
 * on the next promoting run. With that rsync gone they must reach prod by
 * an explicit, gated step, or they silently stop:
 *
 * - the mirror keys off THIS snapshot date having promoted, not the whole
 *   run (a scoped run can promote the date and hold another);
 * - the carry copies, for the newest dates prod indexes, every sidecar
 *   staging has and prod lacks. It runs the real script against the gcloud
 *   shim (fixtures/gcloud-shim/gcloud).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { parse } from 'yaml'
import {
  findProdWriteSteps,
  topLevelConjuncts,
  SKIP_CLAUSE_DOWNSTREAM,
  type Workflow,
} from '../prodWriteGuard.js'

const REPO = process.cwd()
const CARRY = path.join(REPO, 'scripts/pipeline/carry-report-sidecars.sh')
const SHIM_DIR = path.join(REPO, 'scripts/lib/__tests__/fixtures/gcloud-shim')
const STG = 'stg-bucket'
const PROD = 'prod-bucket'

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
) as Workflow & {
  jobs: Record<string, { steps?: Step[]; outputs?: Record<string, string> }>
}
const placeSteps = (workflow.jobs['place-reports']?.steps ?? []) as Step[]
const stepNamed = (name: string) => placeSteps.find(s => s.name === name)
const MIRROR = '[reports] Mirror placed datasets into prod'
const CARRY_STEP = '[reports] Carry missing report sidecars into prod'

describe('place-reports under scoped promotion (#1763)', () => {
  it('mirrors when this snapshot date promoted, even if the run held another', () => {
    const expr = stepNamed(MIRROR)?.if ?? ''
    const c = topLevelConjuncts(expr)
    expect(c).toContain("steps.place.outputs.placed == 'true'")
    expect(c).toContain(SKIP_CLAUSE_DOWNSTREAM)
    // A top-level conjunct (collapsed to `contains⟨group⟩` by the parser).
    expect(c).toContain('contains⟨group⟩')
    expect(expr.replace(/\s+/g, ' ')).toContain(
      "&& contains(format(',{0},', needs.pipeline.outputs.promoted_dates), format(',{0},', needs.pipeline.outputs.snapshot_date)) &&"
    )
    expect(stepNamed(MIRROR)?.if).not.toContain(
      "needs.pipeline.outputs.promoted == 'true'"
    )
  })

  it('carries the sidecars a held run left, after the mirror, whatever this run did', () => {
    const carry = stepNamed(CARRY_STEP)
    expect(carry?.run).toContain(
      'bash scripts/pipeline/carry-report-sidecars.sh "${GCS_BUCKET}" "${GCS_BUCKET_PRODUCTION}"'
    )
    const c = topLevelConjuncts(carry?.if ?? '')
    expect(c).toContain(SKIP_CLAUSE_DOWNSTREAM)
    // Not keyed on this run promoting: a held run's sidecars are its point.
    expect(carry?.if).not.toContain('promoted')
    // A prod-side hiccup must not undo or fail the placement.
    expect(carry?.['continue-on-error']).toBe(true)
    const idx = (n: string) => placeSteps.findIndex(s => s.name === n)
    expect(idx(CARRY_STEP)).toBeGreaterThan(idx(MIRROR))
  })

  it('the prod-write guard sees the carry, and it is skip_promotion-guarded', () => {
    const found = findProdWriteSteps(workflow).find(s => s.step === CARRY_STEP)
    expect(found?.reasons).toEqual(['report sidecar carry → production'])
    expect(found?.guarded).toBe(true)
  })
})

describe('carry-report-sidecars.sh (shim)', () => {
  let tmp: string
  let root: string
  let log: string

  const put = (bucket: string, rel: string, body: Buffer, meta = '') => {
    const f = path.join(root, bucket, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
    const m = path.join(root, '.meta', bucket, rel)
    fs.mkdirSync(path.dirname(m), { recursive: true })
    fs.writeFileSync(m, meta)
  }
  const read = (bucket: string, rel: string) => {
    const f = path.join(root, bucket, rel)
    return fs.existsSync(f) ? fs.readFileSync(f) : null
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
      out[path.relative(base, abs)] = fs.readFileSync(abs).toString('base64')
    }
    return out
  }
  const SIDE_META =
    'content-encoding=gzip\ncontent-type=application/json\ncache-control=public, max-age=3600, must-revalidate\n'
  const sidecar = (id: string, v: string) =>
    zlib.gzipSync(Buffer.from(JSON.stringify({ districtId: id, v })))
  const datesJson = (dates: string[]) =>
    Buffer.from(JSON.stringify({ dates, count: dates.length }))

  const run = (
    args: string[] = [STG, PROD],
    env: Record<string, string> = {}
  ) =>
    spawnSync('bash', [CARRY, ...args], {
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

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-sidecars-'))
    root = path.join(tmp, 'gcs')
    log = path.join(tmp, 'gcloud.log')
    fs.mkdirSync(path.join(root, STG), { recursive: true })
    fs.mkdirSync(path.join(root, PROD), { recursive: true })
    // Prod indexes 10-14 and 10-15; 10-16 was held (staging only).
    put(PROD, 'v1/dates.json', datesJson(['2026-10-14', '2026-10-15']))
    for (const d of ['2026-10-14', '2026-10-15']) {
      put(PROD, `snapshots/${d}/district_61.json`, Buffer.from('{}'))
      put(STG, `snapshots/${d}/district_61.json`, Buffer.from('{}'))
    }
    // 10-14: prod already has its sidecar (a different -Z upload of it).
    put(
      STG,
      'snapshots/2026-10-14/district_61_reports.json',
      sidecar('61', 'a'),
      SIDE_META
    )
    put(
      PROD,
      'snapshots/2026-10-14/district_61_reports.json',
      sidecar('61', 'prod'),
      SIDE_META
    )
    // 10-15: the run that placed these held, so prod never got them.
    put(
      STG,
      'snapshots/2026-10-15/district_61_reports.json',
      sidecar('61', 'b'),
      SIDE_META
    )
    put(
      STG,
      'snapshots/2026-10-15/district_F_reports.json',
      sidecar('F', 'c'),
      SIDE_META
    )
    // 10-16: not indexed by prod, so never carried (its snapshot is held).
    put(
      STG,
      'snapshots/2026-10-16/district_61_reports.json',
      sidecar('61', 'd'),
      SIDE_META
    )
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('copies only the sidecars prod lacks, for dates prod indexes, bytes and headers as placed', () => {
    const before = tree(PROD)
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    const after = tree(PROD)
    const changed = Object.keys(after)
      .filter(k => after[k] !== before[k])
      .sort()
    expect(changed).toEqual([
      'snapshots/2026-10-15/district_61_reports.json',
      'snapshots/2026-10-15/district_F_reports.json',
    ])
    for (const p of changed) {
      expect(read(PROD, p)).toEqual(read(STG, p))
      expect(meta(PROD, p)).toBe(SIDE_META)
    }
    // Prod's own copy of 10-14 is left alone; 10-16 gets no directory.
    expect(
      zlib
        .gunzipSync(
          read(PROD, 'snapshots/2026-10-14/district_61_reports.json')!
        )
        .toString()
    ).toContain('prod')
    expect(fs.existsSync(path.join(root, PROD, 'snapshots/2026-10-16'))).toBe(
      false
    )
    expect(fs.readFileSync(path.join(tmp, 'summary.md'), 'utf-8')).toContain(
      'Carried **2** report sidecar(s)'
    )
  })

  it('never rsyncs, moves or deletes, and converges on a re-run', () => {
    expect(run().status).toBe(0)
    const once = tree(PROD)
    expect(run().status).toBe(0)
    expect(tree(PROD)).toEqual(once)
    const calls = fs.readFileSync(log, 'utf-8')
    expect(calls).not.toMatch(/^storage (rsync|rm|mv)\b/m)
    // Writes go to prod only; staging is read.
    const writes = calls.split('\n').filter(l => l.startsWith('storage cp '))
    expect(
      writes.every(l =>
        l.trimEnd().endsWith(`gs://${PROD}/snapshots/2026-10-15/`)
      )
    ).toBe(true)
  })

  it('looks back only the requested number of prod dates', () => {
    const r = run([STG, PROD, '1'])
    expect(r.status, r.stderr).toBe(0)
    expect(
      read(PROD, 'snapshots/2026-10-15/district_F_reports.json')
    ).not.toBeNull()
    const r2 = run([STG, PROD, '1'])
    expect(r2.status).toBe(0)
  })

  it('carries reports-rollups.json (#2012) like a sidecar, and no other file', () => {
    const ROLLUPS = 'snapshots/2026-10-15/reports-rollups.json'
    put(STG, ROLLUPS, sidecar('rollups', 'r'), SIDE_META)
    put(
      STG,
      'snapshots/2026-10-16/reports-rollups.json',
      sidecar('rollups', 's'),
      SIDE_META
    )
    put(
      STG,
      'snapshots/2026-10-15/region-rollups.json',
      sidecar('region', 't'),
      SIDE_META
    )
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(read(PROD, ROLLUPS)).toEqual(read(STG, ROLLUPS))
    expect(meta(PROD, ROLLUPS)).toBe(SIDE_META)
    // Held date: not indexed by prod. A promoted file: the manifest's job.
    expect(fs.existsSync(path.join(root, PROD, 'snapshots/2026-10-16'))).toBe(
      false
    )
    expect(read(PROD, 'snapshots/2026-10-15/region-rollups.json')).toBeNull()
  })

  it('a date directory staging lacks is no sidecars, not an error', () => {
    put(PROD, 'v1/dates.json', datesJson(['2026-10-13', '2026-10-15']))
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(
      read(PROD, 'snapshots/2026-10-15/district_F_reports.json')
    ).not.toBeNull()
  })

  it('fails on an unreadable prod index and copies nothing', () => {
    fs.rmSync(path.join(root, PROD, 'v1/dates.json'))
    const before = tree(PROD)
    const r = run()
    expect(r.status).toBe(1)
    expect(tree(PROD)).toEqual(before)
  })

  it('fails on a listing transport error rather than reading it as empty', () => {
    const r = run([STG, PROD], {
      SHIM_FAIL_MATCH: `^ls gs://${PROD}/snapshots/2026-10-15/`,
    })
    expect(r.status).toBe(1)
    expect(
      read(PROD, 'snapshots/2026-10-15/district_F_reports.json')
    ).toBeNull()
  })

  it('fails when a copy fails', () => {
    const r = run([STG, PROD], { SHIM_FAIL_MATCH: '^cp ' })
    expect(r.status).not.toBe(0)
  })

  it('refuses bad usage', () => {
    expect(run([STG]).status).toBe(2)
    expect(run([STG, STG]).status).toBe(2)
    expect(run([STG, PROD, 'x']).status).toBe(2)
  })
})

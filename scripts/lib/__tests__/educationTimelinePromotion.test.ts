/**
 * The education timeline reaches prod the way the rollup does (#2591, epic
 * #2590; the rollup's path is #1810 / #2222).
 *
 * `derived/education-timeline/<PY>.json` is built beside the rollup, in the
 * same job, and named by the rollup index's additive `timelines` rows. The
 * `promote-reports` job then:
 *
 *   1. plans it with the rollup (only the timelines the index names, under
 *      the same reports-date hold), downloading it without clashing with the
 *      rollup year of the same name (`2026-2027.json` is in both prefixes);
 *   2. content-gates it (schema, the program year its path names);
 *   3. promotes it with `--education-rollup`: years and timelines, then the
 *      index LAST (R15), so prod never names a timeline it does not hold.
 *
 * The sample is the build script's own output (education-rollup-output/).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runPlanReportSidecars } from '../reportSidecarPlanRunner.js'
import { runPromoteRunManifest } from '../promoteRunManifestRunner.js'
import { planManifestPromotion } from '../manifestPromotion.js'
import { planEducationRollup } from '../educationRollupPlan.js'
import {
  checkObject,
  classifyObject,
  type CheckContext,
  type ObjectKind,
  type StoredObject,
} from '../promotionContentGate.js'
import { parseRunManifest, type RunManifestEntry } from '../runManifest.js'

const REPO = process.cwd()
const SAMPLE = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/education-rollup-output'
)
const sample = (rel: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(SAMPLE, rel), 'utf-8')) as Record<
    string,
    unknown
  >
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STG = 'stg-bucket'
const PROD = 'prod-bucket'
const RU = 'derived/education-rollup/'
const TL = 'derived/education-timeline/'
const INDEX = `${RU}index.json`
const Y26 = `${RU}2026-2027.json`
const T26 = `${TL}2026-2027.json`
const META = 'content-type=application/json\n'
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const entry = (p: string): RunManifestEntry => ({
  path: p,
  sha256: sha(p),
  date: null,
  stage: 'education-rollup',
})

const index = (asOf: string | null, timelines: string[]) =>
  JSON.stringify({
    _format: { version: '1.0.0', type: 'education-rollup-index' },
    asOf,
    programYears: [{ programYear: '2026-2027', path: Y26 }],
    timelines: timelines.map(py => ({
      programYear: py,
      path: `${TL}${py}.json`,
    })),
  })

describe('planEducationRollup — the timelines the index names (#2591)', () => {
  const dates = ['2026-10-12']
  it('promotes years, then the named timelines, then the index', () => {
    expect(
      planEducationRollup({
        stagingIndex: index('2026-10-12', ['2025-2026', '2026-2027']),
        prodIndex: null,
        prodIndexedDates: dates,
      })
    ).toMatchObject({
      action: 'promote',
      paths: [Y26, `${TL}2025-2026.json`, T26, INDEX],
    })
  })

  it('an index with no timelines is the previous release’s plan', () => {
    expect(
      planEducationRollup({
        stagingIndex: index('2026-10-12', []),
        prodIndex: null,
        prodIndexedDates: dates,
      }).paths
    ).toEqual([Y26, INDEX])
  })

  it('refuses a timeline path outside derived/education-timeline/<PY>.json', () => {
    for (const bad of ['v1/dates.json', `${RU}2026-2027.json`, `${TL}x.json`]) {
      expect(() =>
        planEducationRollup({
          stagingIndex: JSON.stringify({
            asOf: '2026-10-12',
            programYears: [{ path: Y26 }],
            timelines: [{ path: bad }],
          }),
          prodIndex: null,
          prodIndexedDates: dates,
        })
      ).toThrow()
    }
  })
})

describe('planManifestPromotion — the education timeline (#2591)', () => {
  const base = {
    entries: [entry(Y26), entry(T26), entry(INDEX)],
    held: { all: false, dates: [] },
    indexDates: null,
    prodDates: null,
  }
  it('is never promoted from the pipeline’s own run manifest', () => {
    const plan = planManifestPromotion(base)
    expect(plan.objectCount).toBe(0)
    expect(plan.excluded.map(e => e.path)).toEqual([Y26, T26, INDEX].sort())
  })

  it('with educationRollup: years and timelines in the rollup phase, the index last', () => {
    const plan = planManifestPromotion({ ...base, educationRollup: true })
    expect(plan.batches).toEqual([
      { phase: 'rollup', dir: RU, paths: [Y26] },
      { phase: 'rollup', dir: TL, paths: [T26] },
      { phase: 'entry', dir: RU, paths: [INDEX] },
    ])
  })

  it('refuses any other object under derived/education-timeline/', () => {
    for (const bad of [`${TL}scratch.json`, `${TL}2026-2027/x.json`]) {
      expect(() =>
        planManifestPromotion({
          ...base,
          entries: [entry(bad)],
          educationRollup: true,
        })
      ).toThrow(/derived\/education-timeline/)
    }
  })
})

describe('content gate — the education timeline (#2591)', () => {
  const ctx: CheckContext = {
    latestSnapshotDate: null,
    availableDates: [],
    clubHistoryShards: { staging: [], prod: [] },
  }
  const stored = (value: unknown): StoredObject => ({
    bytes: new Uint8Array(Buffer.from(JSON.stringify(value))),
  })
  const check = (kind: ObjectKind, value: unknown, p: string) =>
    checkObject({ path: p, kind }, stored(value), null, ctx)

  it('has its own kind; other objects under the prefix are plain json', () => {
    expect(classifyObject(T26)).toBe('education-timeline')
    expect(classifyObject(`${TL}scratch.json`)).toBe('json')
  })

  it('passes the build’s own timeline', () => {
    expect(
      check('education-timeline', sample('timeline/2026-2027.json'), T26)
    ).toBeNull()
  })

  it('holds a timeline that fails the schema, or carries a stray field', () => {
    const v = sample('timeline/2026-2027.json')
    delete v.world
    expect(check('education-timeline', v, T26)).toMatch(
      /schema validation failed/
    )
    const w = { ...sample('timeline/2026-2027.json'), clubs: [] }
    expect(check('education-timeline', w, T26)).toMatch(
      /schema validation failed/
    )
  })

  it('holds a timeline served under another program year’s path', () => {
    expect(
      check(
        'education-timeline',
        sample('timeline/2026-2027.json'),
        `${TL}2025-2026.json`
      )
    ).toMatch(/programYear is "2026-2027", but its path names 2025-2026/)
  })

  it('the rollup index: passes with timelines, holds a row pointing elsewhere or twice', () => {
    const idx = (): Record<string, unknown> => sample('index.json')
    const run = (v: unknown) => check('education-rollup-index', v, INDEX)
    expect(run(idx())).toBeNull()
    const moved = idx()
    ;(moved.timelines as Array<Record<string, unknown>>)[0]!.path =
      'v1/dates.json'
    expect(run(moved)).toMatch(/timelines\[0\] \(2026-2027\) points at/)
    const twice = idx()
    const rows = twice.timelines as unknown[]
    rows.push(rows[0])
    expect(run(twice)).toMatch(/names 2026-2027 twice/)
  })
})

describe('plan + promote with a timeline (shim)', () => {
  let tmp: string
  let root: string
  let runManifest: string
  let rollupManifest: string
  let rollupVerdict: string
  let output: string

  const put = (bucket: string, rel: string, body: string) => {
    const f = path.join(root, bucket, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
    const m = path.join(root, '.meta', bucket, rel)
    fs.mkdirSync(path.dirname(m), { recursive: true })
    fs.writeFileSync(m, META)
  }
  const read = (bucket: string, rel: string) => {
    const f = path.join(root, bucket, rel)
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null
  }
  const env = () =>
    ({
      PATH: process.env.PATH,
      GCLOUD: SHIM,
      SHIM_ROOT: root,
      SHIM_DOWNLOAD_DECOMPRESS: '1',
      GCS_BUCKET: STG,
      GCS_BUCKET_PRODUCTION: PROD,
      RUN_MANIFEST_FILE: runManifest,
      REPORT_SIDECAR_MANIFEST_FILE: path.join(tmp, 'sidecars', 'written.jsonl'),
      REPORT_SIDECAR_VERDICT_FILE: path.join(tmp, 'sidecars', 'verdict.json'),
      EDUCATION_ROLLUP_MANIFEST_FILE: rollupManifest,
      EDUCATION_ROLLUP_VERDICT_FILE: rollupVerdict,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: path.join(tmp, 'summary.md'),
      PROMOTED_DATES: '2026-10-12',
    }) as Record<string, string>

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'education-timeline-promo-'))
    root = path.join(tmp, 'gcs')
    runManifest = path.join(tmp, 'run.jsonl')
    rollupManifest = path.join(tmp, 'education-rollup', 'written.jsonl')
    rollupVerdict = path.join(tmp, 'education-rollup', 'verdict.json')
    output = path.join(tmp, 'output.txt')
    fs.mkdirSync(path.join(root, STG), { recursive: true })
    fs.mkdirSync(path.join(root, PROD), { recursive: true })
    put(PROD, 'v1/dates.json', JSON.stringify({ dates: ['2026-10-12'] }))
    // Same file name in both prefixes, different bytes.
    put(STG, Y26, '{"kind":"rollup-year"}')
    put(STG, T26, '{"kind":"timeline"}')
    put(STG, INDEX, index('2026-10-12', ['2026-2027']))
    put(STG, `${TL}scratch.json`, '{}')
    // The run's own lines: a sidecar this run placed (the plan needs a run).
    fs.writeFileSync(
      runManifest,
      JSON.stringify({
        path: 'snapshots/2026-10-12/district_61_reports.json',
        sha256: sha('{"districtId":"61"}'),
        date: '2026-10-12',
        stage: 'place-reports',
      }) + '\n'
    )
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  const planAndPromote = async () => {
    let err = ''
    const planned = await runPlanReportSidecars({
      env: env(),
      err: s => {
        err += s
      },
    })
    const promoted = await runPromoteRunManifest(
      ['--execute', '--education-rollup'],
      {
        env: {
          ...env(),
          RUN_MANIFEST_FILE: rollupManifest,
          COMPLETENESS_GATE_FILE: rollupVerdict,
        },
        out: () => {},
        err: s => {
          err += s
        },
      }
    )
    return { planned, promoted, err }
  }

  it('plans the timeline with its own bytes (not the same-named year’s) and promotes it before the index', async () => {
    const r = await planAndPromote()
    expect(r.planned, r.err).toBe(0)
    const rows = parseRunManifest(fs.readFileSync(rollupManifest, 'utf-8'))
    expect(rows.map(e => e.path)).toEqual([Y26, T26, INDEX])
    expect(rows.find(e => e.path === T26)?.sha256).toBe(
      sha('{"kind":"timeline"}')
    )
    expect(rows.find(e => e.path === Y26)?.sha256).toBe(
      sha('{"kind":"rollup-year"}')
    )
    expect(r.promoted, r.err).toBe(0)
    expect(read(PROD, T26)).toBe('{"kind":"timeline"}')
    expect(read(PROD, Y26)).toBe('{"kind":"rollup-year"}')
    expect(read(PROD, INDEX)).toBe(read(STG, INDEX))
    // The stray object the index does not name is never promoted.
    expect(read(PROD, `${TL}scratch.json`)).toBeNull()
  })
})

/**
 * The education timeline reaches prod the way the rollup does (#2591, epic
 * #2590; the rollup's path is #1810 / #2222).
 *
 * `derived/education-timeline/<PY>/{world,region-<n>,district-<id>}.json` is
 * built beside the rollup, in the same job, and named by the rollup index's
 * additive `timelines` rows (a PY prefix each). The `promote-reports` job
 * then:
 *
 *   1. plans it with the rollup: it lists the entity files under each named
 *      prefix and takes only those matching the three name patterns, under
 *      the same reports-date hold, downloading them without clashing with
 *      the rollup year of the same name (`2026-2027.json` is in the rollup
 *      prefix, `2026-2027/` here);
 *   2. content-gates each file (schema, and the PY and entity its path names);
 *   3. promotes them with `--education-rollup`: years and timeline files,
 *      then the index LAST (R15), so prod never names a timeline it does not
 *      hold.
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
import {
  planEducationRollup,
  refuseInconsistentTimelines,
  timelinePrefixes,
} from '../educationRollupPlan.js'
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
const P26 = `${TL}2026-2027`
const W26 = `${P26}/world.json`
const R26 = `${P26}/region-01.json`
const D26 = `${P26}/district-49.json`
const P25 = `${TL}2025-2026`
const W25 = `${P25}/world.json`
const META = 'content-type=application/json\n'
/** A stand-in entity file: distinct bytes, and the `asOf` the gate reads. */
const body = (kind: string, asOf = '2026-10-12') =>
  JSON.stringify({ kind, asOf })
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const entry = (p: string): RunManifestEntry => ({
  path: p,
  sha256: sha(p),
  date: null,
  stage: 'education-rollup',
})

const index = (
  asOf: string | null,
  prefixes: string[],
  rowAsOf: string | null = asOf
) =>
  JSON.stringify({
    _format: { version: '1.0.0', type: 'education-rollup-index' },
    asOf,
    programYears: [{ programYear: '2026-2027', path: Y26 }],
    timelines: prefixes.map(prefix => ({
      programYear: prefix.slice(-9),
      prefix,
      asOf: rowAsOf,
    })),
  })

describe('planEducationRollup — the timeline files under the named prefixes (#2591)', () => {
  const dates = ['2026-10-12']
  it('promotes years, then the matching entity files, then the index', () => {
    expect(
      planEducationRollup({
        stagingIndex: index('2026-10-12', [P25, P26]),
        prodIndex: null,
        prodIndexedDates: dates,
        timelineObjects: [D26, W26, R26, W25],
      })
    ).toMatchObject({
      action: 'promote',
      paths: [Y26, W25, D26, R26, W26, INDEX].map(p => p),
    })
  })

  it('takes only the three name patterns, and only under a named prefix', () => {
    const plan = planEducationRollup({
      stagingIndex: index('2026-10-12', [P26]),
      prodIndex: null,
      prodIndexedDates: dates,
      timelineObjects: [
        W26,
        `${P26}/scratch.json`,
        `${P26}/district-.json`,
        `${P26}/world.json.bak`,
        W25, // a PY the index does not name
      ],
    })
    expect(plan.paths).toEqual([Y26, W26, INDEX])
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

  it('refuses a timelines row that is not derived/education-timeline/<PY>', () => {
    for (const bad of ['v1', `${RU}2026-2027`, `${TL}2026-2027/`, `${TL}x`]) {
      const stagingIndex = JSON.stringify({
        asOf: '2026-10-12',
        programYears: [{ path: Y26 }],
        timelines: [{ prefix: bad }],
      })
      expect(() => timelinePrefixes(stagingIndex), bad).toThrow()
      expect(() =>
        planEducationRollup({
          stagingIndex,
          prodIndex: null,
          prodIndexedDates: dates,
        })
      ).toThrow()
    }
  })
})

describe('refuseInconsistentTimelines — a mixed set is never promoted (review fix 3)', () => {
  const idx = index('2026-10-12', [P26])
  const files = (m: Record<string, string | null>) => new Map(Object.entries(m))
  it('passes a set whose world matches the row and no file is newer', () => {
    expect(
      refuseInconsistentTimelines(
        idx,
        files({ [W26]: '2026-10-12', [D26]: '2026-10-11', [R26]: '2026-10-12' })
      ).size
    ).toBe(0)
  })
  it('refuses a set with a file newer than the index row', () => {
    const r = refuseInconsistentTimelines(
      idx,
      files({ [W26]: '2026-10-12', [D26]: '2026-10-13' })
    )
    expect([...r.keys()]).toEqual(['2026-2027'])
    expect(r.get('2026-2027')).toMatch(/district-49\.json.*2026-10-13/)
  })
  it('refuses a set whose world.json is not at the row asOf', () => {
    const r = refuseInconsistentTimelines(
      idx,
      files({ [W26]: '2026-10-11', [D26]: '2026-10-11' })
    )
    expect(r.get('2026-2027')).toMatch(/world\.json.*2026-10-11/)
  })
  it('refuses a set with no world.json, or a file with no readable asOf', () => {
    expect(
      refuseInconsistentTimelines(idx, files({ [D26]: '2026-10-12' })).size
    ).toBe(1)
    expect(
      refuseInconsistentTimelines(
        idx,
        files({ [W26]: '2026-10-12', [D26]: null })
      ).size
    ).toBe(1)
  })
  it('judges each PY on its own; a PY with nothing to promote is not mentioned', () => {
    const two = index('2026-10-12', [P25, P26])
    const r = refuseInconsistentTimelines(
      two,
      files({ [W26]: '2026-10-12', [D26]: '2026-10-12' })
    )
    expect(r.size).toBe(0)
  })
})

describe('planManifestPromotion — the education timeline (#2591)', () => {
  const base = {
    entries: [entry(Y26), entry(W26), entry(D26), entry(INDEX)],
    held: { all: false, dates: [] },
    indexDates: null,
    prodDates: null,
  }
  it('is never promoted from the pipeline’s own run manifest', () => {
    const plan = planManifestPromotion(base)
    expect(plan.objectCount).toBe(0)
    expect(plan.excluded.map(e => e.path).sort()).toEqual(
      [Y26, W26, D26, INDEX].sort()
    )
  })

  it('with educationRollup: years and timeline files in the rollup phase, the index last', () => {
    const plan = planManifestPromotion({ ...base, educationRollup: true })
    expect(plan.batches).toEqual([
      { phase: 'rollup', dir: RU, paths: [Y26] },
      { phase: 'rollup', dir: `${P26}/`, paths: [D26, W26] },
      { phase: 'entry', dir: RU, paths: [INDEX] },
    ])
  })

  it('refuses anything under derived/education-timeline/ that is not an entity file', () => {
    for (const bad of [
      `${TL}scratch.json`,
      `${TL}2026-2027.json`,
      `${P26}/scratch.json`,
      `${P26}/district-.json`,
      `${P26}/district-1/2.json`,
      `${P26}/world.json.bak`,
      `${TL}2026-2028/world.json`,
    ]) {
      expect(
        () =>
          planManifestPromotion({
            ...base,
            entries: [entry(bad)],
            educationRollup: true,
          }),
        bad
      ).toThrow(/derived\/education-timeline/)
    }
  })

  it('the refusal names the layout it accepts (review fix 5)', () => {
    expect(() =>
      planManifestPromotion({
        ...base,
        entries: [entry(`${P26}/scratch.json`)],
        educationRollup: true,
      })
    ).toThrow(/only <PY>\/\{world,region-<n>,district-<id>\}\.json/)
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
  const entity = (name: string) => sample(`timeline/2026-2027/${name}`)

  it('has its own kind; other objects under the prefix are plain json', () => {
    for (const p of [W26, R26, D26])
      expect(classifyObject(p)).toBe('education-timeline')
    expect(classifyObject(`${P26}/scratch.json`)).toBe('json')
  })

  it('passes the build’s own entity files', () => {
    expect(check('education-timeline', entity('world.json'), W26)).toBeNull()
    expect(
      check('education-timeline', entity('region-01.json'), R26)
    ).toBeNull()
    expect(
      check('education-timeline', entity('district-49.json'), D26)
    ).toBeNull()
  })

  it('holds a file that fails the schema, or carries a stray field', () => {
    const v = entity('world.json')
    delete v.points
    expect(check('education-timeline', v, W26)).toMatch(
      /schema validation failed/
    )
    const w = { ...entity('world.json'), clubs: [] }
    expect(check('education-timeline', w, W26)).toMatch(
      /schema validation failed/
    )
  })

  it('holds a file served under another program year’s path', () => {
    expect(
      check(
        'education-timeline',
        entity('world.json'),
        `${TL}2025-2026/world.json`
      )
    ).toMatch(/programYear is "2026-2027", but its path names 2025-2026/)
  })

  it('holds a file served under another entity’s path', () => {
    expect(
      check(
        'education-timeline',
        entity('district-49.json'),
        `${P26}/district-61.json`
      )
    ).toMatch(/entity is district 49, but its path names district 61/)
    expect(
      check('education-timeline', entity('district-49.json'), W26)
    ).toMatch(/entity is district 49, but its path names world/)
  })

  it('the rollup index: passes with timelines, holds a row pointing elsewhere or twice', () => {
    const idx = (): Record<string, unknown> => sample('index.json')
    const run = (v: unknown) => check('education-rollup-index', v, INDEX)
    expect(run(idx())).toBeNull()
    const moved = idx()
    ;(moved.timelines as Array<Record<string, unknown>>)[0]!.prefix =
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
    // Different bytes in every object, so a mix-up cannot pass.
    put(STG, Y26, '{"kind":"rollup-year"}')
    put(STG, W26, body('world'))
    put(STG, D26, body('district-49'))
    put(STG, R26, body('region-01'))
    put(STG, INDEX, index('2026-10-12', [P26]))
    // Strays under the named prefix are never promoted; neither is a PY the
    // index does not name.
    put(STG, `${P26}/scratch.json`, '{}')
    put(STG, W25, '{"kind":"unnamed-year"}')
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

  it('a partial upload (world.json behind the index row) holds the PY timeline set; the rest promotes (review fix 3)', async () => {
    put(STG, W26, body('world', '2026-10-11'))
    const r = await planAndPromote()
    expect(r.planned, r.err).toBe(0)
    expect(r.err).toMatch(/2026-2027.*world\.json/)
    const rows = parseRunManifest(fs.readFileSync(rollupManifest, 'utf-8'))
    expect(rows.map(e => e.path).sort()).toEqual([Y26, INDEX].sort())
    expect(r.promoted, r.err).toBe(0)
    expect(read(PROD, Y26)).toBe('{"kind":"rollup-year"}')
    expect(read(PROD, INDEX)).toBe(read(STG, INDEX))
    for (const p of [W26, D26, R26]) expect(read(PROD, p), p).toBeNull()
  })

  it('plans the named entity files with their own bytes and promotes them before the index', async () => {
    const r = await planAndPromote()
    expect(r.planned, r.err).toBe(0)
    const rows = parseRunManifest(fs.readFileSync(rollupManifest, 'utf-8'))
    expect(rows.map(e => e.path).sort()).toEqual(
      [Y26, D26, R26, W26, INDEX].sort()
    )
    expect(rows.find(e => e.path === W26)?.sha256).toBe(sha(body('world')))
    expect(rows.find(e => e.path === Y26)?.sha256).toBe(
      sha('{"kind":"rollup-year"}')
    )
    expect(r.promoted, r.err).toBe(0)
    expect(read(PROD, W26)).toBe(body('world'))
    expect(read(PROD, D26)).toBe(body('district-49'))
    expect(read(PROD, R26)).toBe(body('region-01'))
    expect(read(PROD, Y26)).toBe('{"kind":"rollup-year"}')
    expect(read(PROD, INDEX)).toBe(read(STG, INDEX))
    expect(read(PROD, `${P26}/scratch.json`)).toBeNull()
    expect(read(PROD, W25)).toBeNull()
  })
})

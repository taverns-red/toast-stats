/**
 * The education rollup reaches prod only through the manifest promote
 * (#2222, ADR-015 step 9 follow-up; data from #1801, rules from #1810).
 *
 * `derived/education-rollup/{<PY>,index}.json` is built in the
 * `education-rollup` job, after the pipeline job promoted. It used to be
 * mirrored straight to prod by mirror-education-rollup.sh, unchecked. Now
 * the `promote-reports` job:
 *
 *   1. plans it into the report-sidecar manifest
 *      (scripts/plan-report-sidecars.ts), keeping the mirror's rules: only
 *      the objects staging's index names, only when the reports date the
 *      rollup was read from (`asOf`) is a date prod indexes, and nothing
 *      when prod already has staging's index;
 *   2. content-gates it (the education-rollup kinds);
 *   3. promotes it with scripts/promote-run-manifest.ts --execute
 *      --education-rollup: the years first, the index LAST (R15).
 *
 * The planner and the promoter run here for real against the gcloud shim
 * (two buckets in one SHIM_ROOT), in process.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  runApplyEducationRollupHold,
  runApplySidecarContentGate,
  runPlanReportSidecars,
} from '../reportSidecarPlanRunner.js'
import { runPromoteRunManifest } from '../promoteRunManifestRunner.js'
import {
  planManifestPromotion,
  type PromotionInputs,
} from '../manifestPromotion.js'
import {
  educationRollupDateHold,
  planEducationRollup,
} from '../educationRollupPlan.js'
import { evaluateContentGate } from '../promotionContentGate.js'
import { parseRunManifest, type RunManifestEntry } from '../runManifest.js'

const REPO = process.cwd()
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STG = 'stg-bucket'
const PROD = 'prod-bucket'
const PREFIX = 'derived/education-rollup/'
const INDEX = `${PREFIX}index.json`
const Y18 = `${PREFIX}2018-2019.json`
const Y26 = `${PREFIX}2026-2027.json`
const ROLLUP_META = 'content-type=application/json\n'

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const entry = (p: string, stage = 'education-rollup'): RunManifestEntry => ({
  path: p,
  sha256: sha(p),
  date: null,
  stage,
})

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

describe('planEducationRollup (pure)', () => {
  const dates = ['2026-10-15', '2026-10-16']

  it('promotes the years the index names, then the index', () => {
    expect(
      planEducationRollup({
        stagingIndex: index('2026-10-16', ['2018-2019', '2026-2027']),
        prodIndex: null,
        prodIndexedDates: dates,
      })
    ).toMatchObject({
      action: 'promote',
      asOf: '2026-10-16',
      paths: [Y18, Y26, INDEX],
    })
  })

  it('holds a rollup of reports from a date prod does not index, or none', () => {
    for (const asOf of ['2026-10-17', null]) {
      const p = planEducationRollup({
        stagingIndex: index(asOf, ['2018-2019']),
        prodIndex: null,
        prodIndexedDates: dates,
      })
      expect(p.action).toBe('held')
      expect(p.paths).toEqual([])
      expect(p.reason).toContain(String(asOf ?? 'none'))
    }
  })

  it('is current when prod already has staging’s index, byte for byte', () => {
    const i = index('2026-10-16', ['2018-2019'])
    expect(
      planEducationRollup({
        stagingIndex: i,
        prodIndex: i,
        prodIndexedDates: dates,
      }).action
    ).toBe('current')
    expect(
      planEducationRollup({
        stagingIndex: i,
        prodIndex: index('2026-10-15', ['2018-2019'], 'old'),
        prodIndexedDates: dates,
      }).action
    ).toBe('promote')
  })

  it('no staging index is nothing to promote', () => {
    expect(
      planEducationRollup({
        stagingIndex: null,
        prodIndex: null,
        prodIndexedDates: dates,
      }).action
    ).toBe('none')
  })

  it('refuses an index naming a path outside derived/education-rollup/<PY>.json', () => {
    for (const bad of [
      JSON.stringify({
        asOf: '2026-10-16',
        programYears: [{ path: 'v1/dates.json' }],
      }),
      JSON.stringify({ asOf: '2026-10-16' }),
      'not json',
    ]) {
      expect(() =>
        planEducationRollup({
          stagingIndex: bad,
          prodIndex: null,
          prodIndexedDates: dates,
        })
      ).toThrow()
    }
  })
})

/**
 * #2222 M2 (and L1): the rollup is built from staging's reports of its
 * `asOf` date. When the sidecar plan holds that date (this run wrote it and
 * did not promote it) or the sidecars' content gate holds it (a refused
 * report), a rollup read from those reports must not ship ahead of them.
 */
describe('educationRollupDateHold (pure)', () => {
  const applied = (heldDates: string[]) => ({
    heldDates,
    contentGate: 'applied' as const,
  })

  it('holds a rollup whose reports date the sidecar verdict holds', () => {
    expect(
      educationRollupDateHold('2026-10-16', applied(['2026-10-16']))
    ).toMatch(/2026-10-16/)
    expect(
      educationRollupDateHold('2026-10-16', {
        heldDates: ['2026-10-16'],
        contentGate: 'none',
      })
    ).toMatch(/2026-10-16/)
  })

  it('keeps it when only other dates are held, or none', () => {
    expect(
      educationRollupDateHold('2026-10-16', applied(['2026-10-15']))
    ).toBeNull()
    expect(educationRollupDateHold('2026-10-16', applied([]))).toBeNull()
    expect(
      educationRollupDateHold('2026-10-16', {
        heldDates: [],
        contentGate: 'none',
      })
    ).toBeNull()
  })

  it('fails closed: no sidecar verdict, an unapplied content gate, or no asOf', () => {
    expect(educationRollupDateHold('2026-10-16', null)).not.toBeNull()
    expect(
      educationRollupDateHold('2026-10-16', {
        heldDates: [],
        contentGate: 'pending',
      })
    ).not.toBeNull()
    expect(
      educationRollupDateHold('2026-10-16', { heldDates: [] })
    ).not.toBeNull()
    expect(educationRollupDateHold(null, applied([]))).not.toBeNull()
  })
})

describe('planManifestPromotion — the education rollup (#2222)', () => {
  const base = (over: Partial<PromotionInputs> = {}): PromotionInputs => ({
    entries: [entry(Y18), entry(Y26), entry(INDEX)],
    held: { all: false, dates: [] },
    indexDates: null,
    prodDates: null,
    ...over,
  })

  it('is never promoted from the pipeline’s own run manifest', () => {
    const plan = planManifestPromotion(base())
    expect(plan.objectCount).toBe(0)
    expect(plan.excluded.map(e => e.path)).toEqual([Y18, Y26, INDEX])
    expect(plan.excluded[0]!.reason).toMatch(/#2222/)
  })

  it('with educationRollup: the years in their own phase, the index in the entry phase', () => {
    const plan = planManifestPromotion(base({ educationRollup: true }))
    expect(plan.batches).toEqual([
      { phase: 'rollup', dir: PREFIX, paths: [Y18, Y26] },
      { phase: 'entry', dir: PREFIX, paths: [INDEX] },
    ])
    expect(plan.objectCount).toBe(3)
    expect(plan.globals.paths).toEqual([])
  })

  it('a held date does not hold it (its asOf rule is the planner’s), but no verdict does', () => {
    const entries = [
      entry(Y18),
      entry(INDEX),
      {
        ...entry('snapshots/2026-10-17/district_61_reports.json'),
        date: '2026-10-17',
      },
    ]
    const held = planManifestPromotion(
      base({
        entries,
        educationRollup: true,
        held: { all: false, dates: ['2026-10-17'] },
      })
    )
    expect(held.batches.flatMap(b => b.paths)).toEqual([Y18, INDEX])
    const all = planManifestPromotion(
      base({ entries, educationRollup: true, held: { all: true, dates: [] } })
    )
    expect(all.objectCount).toBe(0)
  })

  it('refuses any other object under derived/', () => {
    expect(() =>
      planManifestPromotion(
        base({
          entries: [entry(`${PREFIX}scratch.json`)],
          educationRollup: true,
        })
      )
    ).toThrow(/derived\/education-rollup/)
  })
})

describe('plan-report-sidecars + promote-run-manifest --education-rollup (shim)', () => {
  let tmp: string
  let root: string
  let runManifest: string
  let sidecarManifest: string
  let rollupManifest: string
  let rollupVerdict: string
  let verdictFile: string
  let summaryFile: string
  let output: string
  let shimLog: string

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
  const outputs = (): Record<string, string> =>
    Object.fromEntries(
      (fs.existsSync(output) ? fs.readFileSync(output, 'utf-8') : '')
        .split('\n')
        .filter(Boolean)
        .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
    )
  const calls = () =>
    fs.existsSync(shimLog) ? fs.readFileSync(shimLog, 'utf-8').split('\n') : []

  const env = (extra: Record<string, string> = {}) =>
    ({
      PATH: process.env.PATH,
      GCLOUD: SHIM,
      SHIM_ROOT: root,
      SHIM_LOG: shimLog,
      SHIM_DOWNLOAD_DECOMPRESS: '1',
      GCS_BUCKET: STG,
      GCS_BUCKET_PRODUCTION: PROD,
      RUN_MANIFEST_FILE: runManifest,
      REPORT_SIDECAR_MANIFEST_FILE: sidecarManifest,
      REPORT_SIDECAR_VERDICT_FILE: verdictFile,
      EDUCATION_ROLLUP_MANIFEST_FILE: rollupManifest,
      EDUCATION_ROLLUP_VERDICT_FILE: rollupVerdict,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summaryFile,
      ...extra,
    }) as Record<string, string>

  const plan = async (extra: Record<string, string> = {}) => {
    let err = ''
    const status = await runPlanReportSidecars({
      env: env({ PROMOTED_DATES: '2026-10-16', ...extra }),
      err: s => {
        err += s
      },
    })
    return { status, err }
  }
  const promote = async (extra: Record<string, string> = {}) => {
    let err = ''
    const status = await runPromoteRunManifest(
      ['--execute', '--education-rollup'],
      {
        env: env({
          RUN_MANIFEST_FILE: rollupManifest,
          COMPLETENESS_GATE_FILE: rollupVerdict,
          ...extra,
        }),
        out: () => {},
        err: s => {
          err += s
        },
      }
    )
    return { status, err }
  }
  const manifestAt = (f: string) =>
    fs.existsSync(f) ? parseRunManifest(fs.readFileSync(f, 'utf-8')) : []
  /** The education rollup's own manifest (#2222 M1). */
  const planned = () => manifestAt(rollupManifest)
  const SIDECAR = 'snapshots/2026-10-16/district_61_reports.json'

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'education-rollup-promo-'))
    root = path.join(tmp, 'gcs')
    runManifest = path.join(tmp, 'run.jsonl')
    sidecarManifest = path.join(tmp, 'sidecars', 'written.jsonl')
    rollupManifest = path.join(tmp, 'education-rollup', 'written.jsonl')
    rollupVerdict = path.join(tmp, 'education-rollup', 'verdict.json')
    summaryFile = path.join(tmp, 'summary.md')
    verdictFile = path.join(tmp, 'sidecars', 'verdict.json')
    output = path.join(tmp, 'output.txt')
    shimLog = path.join(tmp, 'gcloud.log')
    fs.mkdirSync(path.join(root, STG), { recursive: true })
    fs.mkdirSync(path.join(root, PROD), { recursive: true })
    put(
      PROD,
      'v1/dates.json',
      JSON.stringify({ dates: ['2026-10-15', '2026-10-16'] })
    )
    put(STG, Y18, '{"py":"2018-2019"}', ROLLUP_META)
    put(STG, Y26, '{"py":"2026-2027"}', ROLLUP_META)
    put(
      STG,
      INDEX,
      index('2026-10-16', ['2018-2019', '2026-2027']),
      ROLLUP_META
    )
    // A stray object the index does not name is never promoted.
    put(STG, `${PREFIX}scratch.json`, '{}', ROLLUP_META)
    // The run's own lines: the build's (ignored: the plan reads staging).
    fs.writeFileSync(
      runManifest,
      [
        JSON.stringify({
          path: 'snapshots/2026-10-16/district_61.json',
          sha256: sha('{}'),
          date: '2026-10-16',
          stage: 'daily',
        }),
        JSON.stringify(entry(INDEX, 'education-rollup')),
        // A sidecar this run placed: it must promote whatever the rollup does.
        JSON.stringify({
          path: SIDECAR,
          sha256: sha('{"districtId":"61"}'),
          date: '2026-10-16',
          stage: 'place-reports',
        }),
      ].join('\n') + '\n'
    )
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('plans the years the index names and the index, hashed as served, and only reads', async () => {
    const before = { stg: tree(STG), prod: tree(PROD) }
    const r = await plan()
    expect(r.status, r.err).toBe(0)
    const rollup = planned().filter(e => e.path.startsWith(PREFIX))
    expect(rollup.map(e => e.path)).toEqual([Y18, Y26, INDEX])
    expect(rollup.find(e => e.path === Y18)!.sha256).toBe(
      sha('{"py":"2018-2019"}')
    )
    expect(rollup.every(e => e.stage === 'education-rollup')).toBe(true)
    // Its own manifest: the sidecar manifest holds only the sidecars.
    expect(manifestAt(sidecarManifest).map(e => e.path)).toEqual([SIDECAR])
    expect(outputs()).toMatchObject({
      objects: '1',
      rollup_objects: '3',
      education_rollup: 'promote',
    })
    expect({ stg: tree(STG), prod: tree(PROD) }).toEqual(before)
  })

  it('end to end: the years, then the index, bytes and headers as built', async () => {
    expect((await plan()).status).toBe(0)
    fs.rmSync(shimLog)
    const r = await promote()
    expect(r.status, r.err).toBe(0)
    for (const f of [Y18, Y26, INDEX]) {
      expect(read(PROD, f)).toBe(read(STG, f))
      expect(fs.readFileSync(path.join(root, '.meta', PROD, f), 'utf-8')).toBe(
        ROLLUP_META
      )
    }
    expect(read(PROD, `${PREFIX}scratch.json`)).toBeNull()
    const cps = calls().filter(l => l.startsWith('storage cp '))
    expect(cps).toHaveLength(2)
    expect(cps[0]).toContain(`gs://${STG}/${Y18}`)
    expect(cps[0]).not.toContain('index.json')
    expect(cps[1]).toBe(
      `storage cp gs://${STG}/${INDEX} gs://${PROD}/${PREFIX}`
    )
  })

  it('holds a rollup built from reports of a date prod does not index', async () => {
    put(STG, INDEX, index('2026-10-17', ['2018-2019']), ROLLUP_META)
    const r = await plan()
    expect(r.status, r.err).toBe(0)
    expect(planned().filter(e => e.path.startsWith(PREFIX))).toEqual([])
    expect(outputs().education_rollup).toBe('held')
    expect(r.err).toMatch(/2026-10-17/)
  })

  it('a later run promotes it once its reports date is indexed', async () => {
    put(STG, INDEX, index('2026-10-17', ['2018-2019']), ROLLUP_META)
    expect((await plan()).status).toBe(0)
    put(
      PROD,
      'v1/dates.json',
      JSON.stringify({ dates: ['2026-10-16', '2026-10-17'] })
    )
    fs.rmSync(output)
    expect((await plan({ PROMOTED_DATES: '' })).status).toBe(0)
    expect(outputs().education_rollup).toBe('promote')
    expect((await promote()).status).toBe(0)
    expect(read(PROD, INDEX)).toBe(read(STG, INDEX))
  })

  it('converges: nothing to plan when prod already has staging’s index', async () => {
    expect((await plan()).status).toBe(0)
    expect((await promote()).status).toBe(0)
    fs.rmSync(output)
    expect((await plan()).status).toBe(0)
    expect(outputs()).toMatchObject({
      rollup_objects: '0',
      education_rollup: 'current',
    })
    expect(fs.existsSync(rollupManifest)).toBe(false)
  })

  it('no staging rollup is nothing to promote, not an error', async () => {
    fs.rmSync(path.join(root, STG, PREFIX), { recursive: true })
    const r = await plan()
    expect(r.status, r.err).toBe(0)
    expect(outputs().education_rollup).toBe('none')
  })

  // #2222 M1: a rollup problem holds only the rollup, as the old
  // continue-on-error mirror did; the sidecars are planned regardless.
  const expectRollupOnlyHeld = (r: { status: number; err: string }) => {
    expect(r.status, r.err).toBe(0)
    expect(outputs()).toMatchObject({
      objects: '1',
      rollup_objects: '0',
      education_rollup: 'error',
    })
    expect(manifestAt(sidecarManifest).map(e => e.path)).toEqual([SIDECAR])
    expect(fs.existsSync(rollupManifest)).toBe(false)
    expect(r.err).toMatch(/::warning title=Education rollup::/)
    expect(fs.readFileSync(summaryFile, 'utf-8')).toMatch(
      /Education rollup \(#2222\)\*\*: error/
    )
  }

  it('a bad index holds only the rollup: the sidecars still plan', async () => {
    put(
      STG,
      INDEX,
      JSON.stringify({
        asOf: '2026-10-16',
        programYears: [{ path: 'v1/dates.json' }],
      })
    )
    expectRollupOnlyHeld(await plan())
  })

  it('an index that is not JSON holds only the rollup', async () => {
    put(STG, INDEX, 'not json')
    expectRollupOnlyHeld(await plan())
  })

  it('a transport error reading staging’s index holds only the rollup', async () => {
    expectRollupOnlyHeld(
      await plan({ SHIM_FAIL_MATCH: `^cat gs://${STG}/${PREFIX}index\\.json` })
    )
  })

  it('a transport error reading prod’s index holds only the rollup', async () => {
    expectRollupOnlyHeld(
      await plan({
        SHIM_FAIL_MATCH: `^cat gs://${PROD}/${PREFIX}index\\.json`,
      })
    )
  })

  it('a failed rollup download holds only the rollup', async () => {
    expectRollupOnlyHeld(await plan({ SHIM_FAIL_MATCH: `^cp .*${PREFIX}` }))
  })

  it('an earlier plan’s rollup manifest never survives a plan that holds it', async () => {
    expect((await plan()).status).toBe(0)
    expect(fs.existsSync(rollupManifest)).toBe(true)
    put(STG, INDEX, index('2026-10-17', ['2018-2019']), ROLLUP_META)
    expect((await plan()).status).toBe(0)
    expect(fs.existsSync(rollupManifest)).toBe(false)
  })

  it('a failed year copy never writes the index', async () => {
    expect((await plan()).status).toBe(0)
    const r = await promote({ SHIM_FAIL_MATCH: '^cp .*2018-2019' })
    expect(r.status).not.toBe(0)
    expect(read(PROD, INDEX)).toBeNull()
  })

  // #2222 M2/L1: after the sidecars' per-date content gate (#2227), the
  // rollup of a held reports date leaves the rollup manifest.
  describe('a held reports date holds its rollup (#2222 M2)', () => {
    let gateFile: string
    const C15 = 'snapshots/2026-10-15/district_61_reports.json'
    beforeEach(() => {
      gateFile = path.join(tmp, 'sidecars', 'content-gate.json')
      // Carried: staging holds it for an indexed date, prod lacks it.
      put(STG, C15, '{"districtId":"61"}')
    })

    function writeGate(failing: Record<string, string>) {
      const sidecars = manifestAt(sidecarManifest)
      const result = evaluateContentGate({
        changedCount: 0,
        manifestCount: sidecars.length,
        results: sidecars.map(e => ({
          path: e.path,
          kind: 'district-reports' as const,
          failure: failing[e.path] ?? null,
        })),
      })
      fs.mkdirSync(path.dirname(gateFile), { recursive: true })
      fs.writeFileSync(gateFile, JSON.stringify(result, null, 2))
    }
    const applyGate = async () => {
      let err = ''
      const status = await runApplySidecarContentGate({
        env: env({ CONTENT_GATE_FILE: gateFile }),
        err: s => {
          err += s
        },
      })
      return { status, err }
    }
    const rollupHold = async () => {
      let err = ''
      const status = await runApplyEducationRollupHold({
        env: env(),
        err: s => {
          err += s
        },
      })
      return { status, err }
    }
    const expectRollupHeld = (r: { status: number; err: string }) => {
      expect(r.status, r.err).toBe(0)
      expect(outputs()).toMatchObject({
        rollup_objects: '0',
        education_rollup: 'held',
      })
      expect(fs.existsSync(rollupManifest)).toBe(false)
      expect(r.err).toMatch(/::warning title=Education rollup::/)
      expect(fs.readFileSync(summaryFile, 'utf-8')).toMatch(
        /Education rollup held/
      )
    }

    it('a content-held reports date holds the rollup built from it', async () => {
      expect((await plan()).status).toBe(0)
      expect(outputs().rollup_objects).toBe('3')
      writeGate({ [SIDECAR]: 'district-reports: place text holds a link' })
      expect((await applyGate()).status).toBe(0)
      fs.rmSync(output)
      const r = await rollupHold()
      expectRollupHeld(r)
      expect(r.err).toMatch(/2026-10-16/)
      // And nothing of it reaches prod.
      await promote()
      expect(read(PROD, INDEX)).toBeNull()
      expect(read(PROD, Y18)).toBeNull()
    })

    it('a content hold of another date leaves the rollup to promote', async () => {
      expect((await plan()).status).toBe(0)
      writeGate({ [C15]: 'district-reports: place text holds a link' })
      expect((await applyGate()).status).toBe(0)
      fs.rmSync(output)
      const r = await rollupHold()
      expect(r.status, r.err).toBe(0)
      expect(outputs()).toMatchObject({
        rollup_objects: '3',
        education_rollup: 'promote',
      })
      expect((await promote()).status).toBe(0)
      expect(read(PROD, INDEX)).toBe(read(STG, INDEX))
    })

    it('a re-run that wrote its reports date and did not promote it holds the rollup (L1)', async () => {
      // Prod already indexes 2026-10-16, but this run's promote of it held.
      expect((await plan({ PROMOTED_DATES: '' })).status).toBe(0)
      writeGate({})
      expect((await applyGate()).status).toBe(0)
      fs.rmSync(output)
      expectRollupHeld(await rollupHold())
    })

    it('holds it when the sidecars were planned but their content gate never applied', async () => {
      expect((await plan()).status).toBe(0)
      fs.rmSync(output)
      expectRollupHeld(await rollupHold())
    })

    it('holds it when there is no sidecar verdict (the sidecar plan failed)', async () => {
      expect((await plan()).status).toBe(0)
      fs.rmSync(verdictFile)
      fs.rmSync(output)
      expectRollupHeld(await rollupHold())
    })

    it('with no sidecar to gate, the rollup of a promoted date promotes', async () => {
      fs.writeFileSync(
        runManifest,
        JSON.stringify({
          path: 'snapshots/2026-10-16/district_61.json',
          sha256: sha('{}'),
          date: '2026-10-16',
          stage: 'daily',
        }) + '\n'
      )
      fs.rmSync(path.join(root, STG, C15))
      expect((await plan()).status).toBe(0)
      expect(outputs().objects).toBe('0')
      fs.rmSync(output)
      const r = await rollupHold()
      expect(r.status, r.err).toBe(0)
      expect(outputs()).toMatchObject({
        rollup_objects: '3',
        education_rollup: 'promote',
      })
    })

    it('no rollup manifest is nothing to hold', async () => {
      put(STG, INDEX, index('2026-10-17', ['2018-2019']), ROLLUP_META)
      expect((await plan()).status).toBe(0)
      fs.rmSync(output)
      const r = await rollupHold()
      expect(r.status, r.err).toBe(0)
      expect(outputs().rollup_objects).toBe('0')
    })
  })
})

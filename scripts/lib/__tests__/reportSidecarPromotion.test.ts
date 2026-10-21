/**
 * Report sidecars reach prod only through the manifest promote (#1767,
 * ADR-015 step 9, D-16).
 *
 * `place-reports` writes snapshots/<date>/district_<id>_reports.json after
 * the pipeline job promoted, and `education-rollup` writes the date's
 * reports-rollups.json after that. Both now record their uploads in the run
 * manifest (gcs-upload.sh). The `promote-reports` job then:
 *
 *   1. plans a sidecar manifest (scripts/plan-report-sidecars.ts): the
 *      sidecars this run wrote, plus every sidecar staging holds and prod
 *      lacks for the dates it carries (prod's newest 7 indexed dates and the
 *      dates this run promoted), and a verdict holding every date this run
 *      wrote but did not promote;
 *   2. content-checks exactly that manifest (promotion-content-gate.ts
 *      --manifest-only);
 *   3. promotes it with scripts/promote-run-manifest.ts --execute.
 *
 * Steps 1 and 3 run here for real against the gcloud shim (two buckets in
 * one SHIM_ROOT), the planner and the promoter in process.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import {
  runApplySidecarContentGate,
  runPlanReportSidecars,
} from '../reportSidecarPlanRunner.js'
import { evaluateContentGate } from '../promotionContentGate.js'
import { runPromoteRunManifest } from '../promoteRunManifestRunner.js'
import {
  carryDates,
  heldSidecarDates,
  isReportSidecar,
} from '../reportSidecarPlan.js'
import { parseRunManifest } from '../runManifest.js'

const REPO = process.cwd()
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STG = 'stg-bucket'
const PROD = 'prod-bucket'
const SIDE_META =
  'content-encoding=gzip\ncontent-type=application/json\ncache-control=public, max-age=3600, must-revalidate\n'

let tmp: string
let root: string
let runManifest: string
let sidecarManifest: string
let verdictFile: string
let output: string
let shimLog: string

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** Put a -Z sidecar; returns its uncompressed bytes. */
function put(bucket: string, p: string, body: string): Buffer {
  const raw = Buffer.from(body)
  const f = path.join(root, bucket, p)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, zlib.gzipSync(raw))
  const m = path.join(root, '.meta', bucket, p)
  fs.mkdirSync(path.dirname(m), { recursive: true })
  fs.writeFileSync(m, SIDE_META)
  return raw
}
function putPlain(bucket: string, p: string, body: string) {
  const f = path.join(root, bucket, p)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, body)
}
const read = (bucket: string, p: string): Buffer | null => {
  const f = path.join(root, bucket, p)
  return fs.existsSync(f) ? fs.readFileSync(f) : null
}
const served = (bucket: string, p: string): string | null => {
  const b = read(bucket, p)
  return b ? zlib.gunzipSync(b).toString() : null
}
function tree(bucket: string): Record<string, string> {
  const out: Record<string, string> = {}
  const base = path.join(root, bucket)
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name)
      if (e.isDirectory()) walk(f)
      else out[path.relative(base, f)] = sha(fs.readFileSync(f))
    }
  }
  if (fs.existsSync(base)) walk(base)
  return out
}

const line = (p: string, raw: Buffer, stage: string) =>
  JSON.stringify({
    path: p,
    sha256: sha(raw),
    date: /^snapshots\/(\d{4}-\d{2}-\d{2})\//.exec(p)?.[1] ?? null,
    stage,
  })

function env(extra: Record<string, string> = {}) {
  return {
    PATH: process.env.PATH,
    GCLOUD: SHIM,
    SHIM_ROOT: root,
    SHIM_LOG: shimLog,
    // The 588 pin: a download inflates the one Content-Encoding layer.
    SHIM_DOWNLOAD_DECOMPRESS: '1',
    GCS_BUCKET: STG,
    GCS_BUCKET_PRODUCTION: PROD,
    RUN_MANIFEST_FILE: runManifest,
    REPORT_SIDECAR_MANIFEST_FILE: sidecarManifest,
    REPORT_SIDECAR_VERDICT_FILE: verdictFile,
    GITHUB_OUTPUT: output,
    ...extra,
  } as Record<string, string>
}

async function plan(extra: Record<string, string> = {}) {
  let err = ''
  const status = await runPlanReportSidecars({
    env: env(extra),
    err: s => {
      err += s
    },
  })
  return { status, err }
}

async function promote() {
  let err = ''
  const status = await runPromoteRunManifest(['--execute'], {
    env: env({
      RUN_MANIFEST_FILE: sidecarManifest,
      COMPLETENESS_GATE_FILE: verdictFile,
    }),
    out: () => {},
    err: s => {
      err += s
    },
  })
  return { status, err }
}

const outputs = (): Record<string, string> =>
  Object.fromEntries(
    (fs.existsSync(output) ? fs.readFileSync(output, 'utf-8') : '')
      .split('\n')
      .filter(Boolean)
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  )

// Prod indexes 10-13..10-16. The run wrote 10-16 (promoted, with its placed
// sidecars and reports rollup) and 10-17 (held; not in prod).
const R16 = 'snapshots/2026-10-16/district_61_reports.json'
const F16 = 'snapshots/2026-10-16/district_F_reports.json'
const ROLL16 = 'snapshots/2026-10-16/reports-rollups.json'
const R17 = 'snapshots/2026-10-17/district_61_reports.json'
const C15 = 'snapshots/2026-10-15/district_61_reports.json'
const P14 = 'snapshots/2026-10-14/district_61_reports.json'

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'report-sidecars-'))
  root = path.join(tmp, 'gcs')
  runManifest = path.join(tmp, 'run.jsonl')
  sidecarManifest = path.join(tmp, 'sidecars', 'written.jsonl')
  verdictFile = path.join(tmp, 'sidecars', 'verdict.json')
  output = path.join(tmp, 'output.txt')
  shimLog = path.join(tmp, 'gcloud.log')
  fs.mkdirSync(path.join(root, STG), { recursive: true })
  fs.mkdirSync(path.join(root, PROD), { recursive: true })

  putPlain(
    PROD,
    'v1/dates.json',
    JSON.stringify({
      dates: ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'],
    })
  )
  for (const d of ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']) {
    putPlain(PROD, `snapshots/${d}/district_61.json`, '{}')
    putPlain(STG, `snapshots/${d}/district_61.json`, '{}')
  }
  putPlain(STG, 'snapshots/2026-10-17/district_61.json', '{}')

  // 10-16: the run placed these; prod has an older copy of one (a re-place).
  const r16 = put(STG, R16, '{"districtId":"61","v":"new"}')
  const f16 = put(STG, F16, '{"districtId":"F","v":"new"}')
  const roll16 = put(STG, ROLL16, '{"rollup":"16"}')
  put(PROD, R16, '{"districtId":"61","v":"old"}')
  // 10-17: placed by the run, but the run held the date.
  const r17 = put(STG, R17, '{"districtId":"61","v":"held"}')
  // 10-15: an earlier held run's sidecar, now that prod indexes the date.
  put(STG, C15, '{"districtId":"61","v":"carry"}')
  // 10-14: prod already has its own copy; never touched by a carry.
  put(STG, P14, '{"districtId":"61","v":"staging"}')
  put(PROD, P14, '{"districtId":"61","v":"prod"}')

  fs.writeFileSync(
    runManifest,
    [
      line('snapshots/2026-10-16/district_61.json', Buffer.from('{}'), 'daily'),
      line('snapshots/2026-10-17/district_61.json', Buffer.from('{}'), 'daily'),
      line('v1/latest.json', Buffer.from('{}'), 'daily'),
      line(R16, r16, 'place-reports'),
      line(F16, f16, 'place-reports'),
      line(R17, r17, 'place-reports'),
      line(ROLL16, roll16, 'reports-rollups'),
      line('derived/education-rollup/index.json', Buffer.from('{}'), 'edu'),
    ].join('\n') + '\n'
  )
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('pure helpers', () => {
  it('recognises exactly the sidecars and the reports rollup', () => {
    expect(isReportSidecar(R16)).toBe(true)
    expect(isReportSidecar(ROLL16)).toBe(true)
    expect(isReportSidecar('snapshots/2026-10-16/district_61.json')).toBe(false)
    expect(isReportSidecar('snapshots/2026-10-16/region-rollups.json')).toBe(
      false
    )
    expect(isReportSidecar('incoming/x/district_61_reports.json')).toBe(false)
  })

  it('holds every date the run wrote and did not promote', () => {
    const entries = parseRunManifest(fs.readFileSync(runManifest, 'utf-8'))
    expect(heldSidecarDates(entries, ['2026-10-16'])).toEqual(['2026-10-17'])
    expect(heldSidecarDates(entries, [])).toEqual(['2026-10-16', '2026-10-17'])
  })

  it('carries prod’s newest N indexed dates plus the promoted ones', () => {
    expect(
      carryDates(['2026-10-01', '2026-10-02', '2026-10-03'], ['2026-09-01'], 2)
    ).toEqual(['2026-09-01', '2026-10-02', '2026-10-03'])
  })
})

describe('plan-report-sidecars + promote-run-manifest (shim)', () => {
  it('plans the run’s sidecars and the carry, and only reads', async () => {
    const before = { stg: tree(STG), prod: tree(PROD) }
    const r = await plan({ PROMOTED_DATES: '2026-10-16' })
    expect(r.status, r.err).toBe(0)
    const planned = parseRunManifest(fs.readFileSync(sidecarManifest, 'utf-8'))
    expect(planned.map(e => e.path).sort()).toEqual(
      [C15, F16, R16, R17, ROLL16].sort()
    )
    // A carried object's hash is of the bytes a browser is served.
    const carried = planned.find(e => e.path === C15)!
    expect(carried.sha256).toBe(
      sha(Buffer.from('{"districtId":"61","v":"carry"}'))
    )
    expect(carried.stage).toBe('carry-reports')
    expect(JSON.parse(fs.readFileSync(verdictFile, 'utf-8'))).toMatchObject({
      promote: false,
      heldDates: ['2026-10-17'],
    })
    expect(outputs()).toMatchObject({
      objects: '5',
      carried: '1',
      held_dates: '2026-10-17',
    })
    expect({ stg: tree(STG), prod: tree(PROD) }).toEqual(before)
    const calls = fs.readFileSync(shimLog, 'utf-8').split('\n')
    expect(
      calls.some(c => / gs:\/\/[^ ]+\/?$/.test(c) && c.startsWith('storage cp'))
    ).toBe(false)
  })

  it('end to end: the promoted date’s sidecars and the carry reach prod; the held date’s do not', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    const before = tree(PROD)
    const r = await promote()
    expect(r.status, r.err).toBe(0)
    const after = tree(PROD)
    const changed = Object.keys(after)
      .filter(k => after[k] !== before[k])
      .sort()
    expect(changed).toEqual([C15, F16, R16, ROLL16].sort())
    expect(served(PROD, R16)).toContain('"new"')
    expect(fs.readFileSync(path.join(root, '.meta', PROD, R16), 'utf-8')).toBe(
      SIDE_META
    )
    // Held: no directory for 10-17; prod's own 10-14 copy left alone.
    expect(fs.existsSync(path.join(root, PROD, 'snapshots/2026-10-17'))).toBe(
      false
    )
    expect(served(PROD, P14)).toContain('"prod"')
  })

  it('a held date prod already indexes keeps its sidecars out of prod', async () => {
    // A re-derive of 10-15 that the completeness gate held.
    fs.appendFileSync(
      runManifest,
      line(
        'snapshots/2026-10-15/district_61.json',
        Buffer.from('{}'),
        'rebuild'
      ) + '\n'
    )
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    expect(JSON.parse(fs.readFileSync(verdictFile, 'utf-8')).heldDates).toEqual(
      ['2026-10-15', '2026-10-17']
    )
    expect((await promote()).status).toBe(0)
    expect(read(PROD, C15)).toBeNull()
    expect(served(PROD, F16)).toContain('"new"')
  })

  it('nothing promoted: the run’s own date is held, the carry still runs', async () => {
    const r = await plan({ PROMOTED_DATES: '' })
    expect(r.status, r.err).toBe(0)
    expect(JSON.parse(fs.readFileSync(verdictFile, 'utf-8')).heldDates).toEqual(
      ['2026-10-16', '2026-10-17']
    )
    expect((await promote()).status).toBe(0)
    expect(served(PROD, R16)).toContain('"old"')
    expect(read(PROD, F16)).toBeNull()
    expect(served(PROD, C15)).toContain('"carry"')
  })

  it('carries a promoted date older than the newest-N window (#2144)', async () => {
    putPlain(
      PROD,
      'v1/dates.json',
      JSON.stringify({ dates: ['2026-10-14', '2026-10-15', '2026-10-16'] })
    )
    put(
      STG,
      'snapshots/2026-10-13/district_F_reports.json',
      '{"districtId":"F"}'
    )
    const r = await plan({
      PROMOTED_DATES: '2026-10-13,2026-10-16',
      CARRY_DAYS: '1',
    })
    expect(r.status, r.err).toBe(0)
    const planned = parseRunManifest(fs.readFileSync(sidecarManifest, 'utf-8'))
    const paths = planned.map(e => e.path)
    expect(paths).toContain('snapshots/2026-10-13/district_F_reports.json')
    // Outside the window and not promoted: left for a later run.
    expect(paths).not.toContain(C15)
  })

  it('converges: a re-run after the promote carries nothing new', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    expect((await promote()).status).toBe(0)
    fs.rmSync(output)
    // The next run wrote nothing of its own.
    fs.writeFileSync(
      runManifest,
      line(
        'snapshots/2026-10-16/district_61.json',
        Buffer.from('{}'),
        'daily'
      ) + '\n'
    )
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    expect(outputs().objects).toBe('0')
    expect(fs.existsSync(sidecarManifest)).toBe(false)
  })

  it('fails closed on a missing or malformed run manifest', async () => {
    fs.rmSync(runManifest)
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(2)
    fs.writeFileSync(runManifest, 'not json\n')
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(2)
    expect(fs.existsSync(sidecarManifest)).toBe(false)
  })

  it('refuses a malformed date list', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16,nope' })).status).toBe(2)
  })

  it('fails on an unreadable prod index, a listing error or a failed download', async () => {
    fs.rmSync(path.join(root, PROD, 'v1/dates.json'))
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(1)
    putPlain(PROD, 'v1/dates.json', JSON.stringify({ dates: ['2026-10-15'] }))
    expect(
      (
        await plan({
          PROMOTED_DATES: '2026-10-16',
          SHIM_FAIL_MATCH: `^ls gs://${PROD}/snapshots/2026-10-15/`,
        })
      ).status
    ).toBe(1)
    expect(
      (await plan({ PROMOTED_DATES: '2026-10-16', SHIM_FAIL_MATCH: '^cp ' }))
        .status
    ).toBe(1)
    expect(fs.existsSync(sidecarManifest)).toBe(false)
  })
})

/**
 * A sidecar that fails the content gate holds only its own date (#2227).
 *
 * The gate (`promotion-content-gate.ts --manifest-only`) is all or nothing:
 * one failure sets content_promote=false. Before #2227 the job then promoted
 * nothing, so one bad sidecar carried from an older date held the run's own
 * ~94 sidecars and reports-rollups.json, every day for up to 7 days. Now
 * `plan-report-sidecars.ts --apply-content-gate` drops the failing dates from
 * the sidecar manifest and adds them to the verdict, and the promoter copies
 * the rest. The gate result is the real evaluateContentGate shape (its
 * failures name the object path, pinned in promotionContentGateIo.test.ts).
 */
describe('a failing sidecar holds only its own date (#2227)', () => {
  let gateFile: string
  beforeEach(() => {
    gateFile = path.join(tmp, 'sidecars', 'content-gate.json')
  })

  function writeGate(failing: Record<string, string>, error?: string) {
    const planned = parseRunManifest(fs.readFileSync(sidecarManifest, 'utf-8'))
    const result = evaluateContentGate({
      changedCount: 0,
      manifestCount: planned.length,
      results: planned.map(e => ({
        path: e.path,
        kind: 'district-reports' as const,
        failure: failing[e.path] ?? null,
      })),
      ...(error ? { error } : {}),
    })
    fs.mkdirSync(path.dirname(gateFile), { recursive: true })
    fs.writeFileSync(gateFile, JSON.stringify(result, null, 2))
  }

  async function hold(extra: Record<string, string> = {}) {
    let err = ''
    const status = await runApplySidecarContentGate({
      env: env({ CONTENT_GATE_FILE: gateFile, ...extra }),
      err: s => {
        err += s
      },
    })
    return { status, err }
  }

  it('a bad carried sidecar holds its date; the run’s own date still promotes', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    writeGate({ [C15]: 'district-reports: place text holds a phone number' })
    fs.rmSync(output)
    const h = await hold()
    expect(h.status, h.err).toBe(0)
    const kept = parseRunManifest(fs.readFileSync(sidecarManifest, 'utf-8'))
    expect(kept.map(e => e.path).sort()).toEqual([F16, R16, R17, ROLL16].sort())
    expect(JSON.parse(fs.readFileSync(verdictFile, 'utf-8'))).toMatchObject({
      promote: false,
      heldDates: ['2026-10-15', '2026-10-17'],
    })
    expect(outputs()).toMatchObject({
      objects: '4',
      content_promote: 'false',
      content_held_dates: '2026-10-15',
      held_dates: '2026-10-15,2026-10-17',
    })

    const before = tree(PROD)
    const p = await promote()
    expect(p.status, p.err).toBe(0)
    const after = tree(PROD)
    expect(
      Object.keys(after)
        .filter(k => after[k] !== before[k])
        .sort()
    ).toEqual([F16, R16, ROLL16].sort())
    // The held date never reaches prod.
    expect(read(PROD, C15)).toBeNull()
    const copies = fs
      .readFileSync(shimLog, 'utf-8')
      .split('\n')
      .filter(c => c.startsWith('storage cp') && c.includes(`gs://${PROD}/`))
    expect(copies.some(c => c.includes('2026-10-15'))).toBe(false)
  })

  it('a bad sidecar of the run’s own date holds that date; the carry still promotes', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    writeGate({ [F16]: 'district-reports: districtId is not "F"' })
    expect((await hold()).status).toBe(0)
    expect(outputs().content_held_dates).toBe('2026-10-16')
    expect((await promote()).status).toBe(0)
    expect(served(PROD, R16)).toContain('"old"')
    expect(read(PROD, F16)).toBeNull()
    expect(read(PROD, ROLL16)).toBeNull()
    expect(served(PROD, C15)).toContain('"carry"')
  })

  it('every date failing: an empty manifest, nothing to promote', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    writeGate({ [C15]: 'bad', [R16]: 'bad', [R17]: 'bad' })
    expect((await hold()).status).toBe(0)
    expect(outputs()).toMatchObject({
      objects: '0',
      content_held_dates: '2026-10-15,2026-10-16,2026-10-17',
    })
    expect(fs.existsSync(sidecarManifest)).toBe(false)
  })

  it('a passing gate changes nothing', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    const planned = fs.readFileSync(sidecarManifest, 'utf-8')
    writeGate({})
    fs.rmSync(output)
    expect((await hold()).status).toBe(0)
    expect(fs.readFileSync(sidecarManifest, 'utf-8')).toBe(planned)
    expect(outputs()).toMatchObject({
      objects: '5',
      content_promote: 'true',
      content_held_dates: '',
      held_dates: '2026-10-17',
    })
  })

  it('fails closed: a gate that could not run, or no gate result, holds every date', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    const planned = fs.readFileSync(sidecarManifest, 'utf-8')
    writeGate({}, 'listing failed')
    expect((await hold()).status).toBe(0)
    expect(outputs()).toMatchObject({
      objects: '0',
      content_promote: 'false',
      content_held_dates: '2026-10-15,2026-10-16,2026-10-17',
    })
    expect(fs.existsSync(sidecarManifest)).toBe(false)

    fs.mkdirSync(path.dirname(sidecarManifest), { recursive: true })
    fs.writeFileSync(sidecarManifest, planned)
    fs.rmSync(gateFile)
    fs.rmSync(output)
    expect((await hold()).status).toBe(0)
    expect(outputs()).toMatchObject({ objects: '0', content_promote: 'false' })
  })

  it('fails closed on a failure it cannot place under a planned date', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    writeGate({})
    const g = JSON.parse(fs.readFileSync(gateFile, 'utf-8'))
    g.promote = false
    g.failures = [{ path: 'v1/latest.json', reason: 'not planned' }]
    fs.writeFileSync(gateFile, JSON.stringify(g))
    fs.rmSync(output)
    expect((await hold()).status).toBe(0)
    expect(outputs()).toMatchObject({ objects: '0', content_promote: 'false' })
  })

  it('reports the held objects in the step summary', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    writeGate({ [C15]: 'district-reports: place text holds a phone number' })
    const summaryFile = path.join(tmp, 'summary.md')
    expect((await hold({ GITHUB_STEP_SUMMARY: summaryFile })).status).toBe(0)
    const md = fs.readFileSync(summaryFile, 'utf-8')
    expect(md).toContain('2026-10-15')
    expect(md).toContain(C15)
    expect(md).toContain('place text holds a phone number')
    expect(md).toMatch(/other dates? (still )?promote/)
  })

  it('needs the planned manifest and verdict', async () => {
    expect((await plan({ PROMOTED_DATES: '2026-10-16' })).status).toBe(0)
    writeGate({})
    fs.rmSync(verdictFile)
    expect((await hold()).status).toBe(2)
  })
})

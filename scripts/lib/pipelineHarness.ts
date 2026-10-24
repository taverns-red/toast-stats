/**
 * Local pipeline harness (#1768, ADR-015 step 10, plan P3-2, decision D10).
 *
 * Runs the data pipeline's canonical modes end to end against the gcloud
 * shim (scripts/lib/__tests__/fixtures/gcloud-shim/gcloud), with a staging
 * AND a production bucket in one SHIM_ROOT, and then checks what landed in
 * prod by its bytes and parsed shape, not by the plan of operations (#1706).
 *
 * The sequence mirrors data-pipeline.yml's steps for the mode:
 *   sync-stores.sh → process-dates.sh <mode> → publish-stores.sh
 *   (→ rescrape-historical's raw upload) → partial-failure-gate.sh →
 *   publish the run manifest → completeness gate → content gate →
 *   promote-run-manifest.ts --execute.
 * The two gates and the promoter run in-process through the same library
 * entry points their CLIs call, over `shimGateBucket` (the SDK's recorded
 * listing shape, fixtures/gcs-get-files/with-fields.json). The count and
 * value gates, the CDN-manifest/index steps and the identity/education
 * builders are inline YAML or TS tools that read the real bucket: stubbed or
 * not modelled here (ADR-015 "Harness requirements" lists the shim as
 * incremental; each step may extend it).
 *
 * No network: GCLOUD and a PATH-first `gcloud` both resolve to the shim,
 * and `gsutil` resolves to a stub that fails.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import {
  runCompletenessGate,
  type CompletenessGateResult,
} from './dateCompletenessGate.js'
import type { ContentGateResult } from './promotionContentGate.js'
import { runContentGate, type GateBucket } from './promotionContentGateIo.js'
import { runPromoteRunManifest } from './promoteRunManifestRunner.js'
import {
  manifestSnapshotDates,
  parseRunManifest,
  type RunManifestEntry,
} from './runManifest.js'

export const HARNESS_STAGING = 'harness-staging'
export const HARNESS_PROD = 'harness-prod'
export const HARNESS_DISTRICTS = ['02', '61', '201'] as const
/** The corpus's two dates: the prior PY's close and a current-PY daily. */
export const FIXTURE_DATES = {
  historical: '2026-06-30',
  daily: '2026-10-23',
} as const

export type HarnessMode = 'daily' | 'rescrape' | 'rescrape-historical'
export const HARNESS_MODES: readonly HarnessMode[] = [
  'daily',
  'rescrape',
  'rescrape-historical',
]

const REPO = path.resolve(__dirname, '../..')
const FIXTURES = path.join(REPO, 'scripts/lib/__tests__/fixtures')
export const SHIM = path.join(FIXTURES, 'gcloud-shim/gcloud')
const STUBS = path.join(FIXTURES, 'process-dates')
const HARNESS_CLI = path.join(FIXTURES, 'pipeline-harness/collector-cli')
const TSX = path.join(REPO, 'node_modules/.bin/tsx')
/** Prefixes the CDN serves: every object under them is stored `-Z`. */
const CDN_PREFIXES = ['snapshots/', 'time-series/']

export interface World {
  /** The run's scratch directory. */
  dir: string
  /** SHIM_ROOT: both buckets and their `.meta` trees. */
  root: string
  /** The runner's CACHE_DIR. */
  cache: string
  /** PATH-first directory: `gcloud` is the shim, `gsutil` fails. */
  bin: string
}

export interface BucketObject {
  bytes: Buffer
  contentEncoding?: string
  /** The shim's metadata file, verbatim (headers, custom metadata). */
  meta: string
}

// ── Buckets on disk ─────────────────────────────────────────────────────────

/** Every object of one shim bucket, by path. */
export function readBucket(
  root: string,
  bucket: string
): Map<string, BucketObject> {
  const base = path.join(root, bucket)
  const out = new Map<string, BucketObject>()
  if (!fs.existsSync(base)) return out
  const names = fs
    .readdirSync(base, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(base, path.join(e.parentPath, e.name)))
    .sort()
  for (const name of names) {
    const metaFile = path.join(root, '.meta', bucket, name)
    const meta = fs.existsSync(metaFile)
      ? fs.readFileSync(metaFile, 'utf-8')
      : ''
    out.set(name, {
      bytes: fs.readFileSync(path.join(base, name)),
      contentEncoding: /^content-encoding=gzip$/m.test(meta)
        ? 'gzip'
        : undefined,
      meta,
    })
  }
  return out
}

function putObject(
  root: string,
  bucket: string,
  name: string,
  bytes: Buffer,
  meta: string
): void {
  const obj = path.join(root, bucket, name)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, bytes)
  const m = path.join(root, '.meta', bucket, name)
  fs.mkdirSync(path.dirname(m), { recursive: true })
  fs.writeFileSync(m, meta)
}

const CDN_META =
  'content-encoding=gzip\ncontent-type=application/json\n' +
  'cache-control=public, max-age=3600, must-revalidate\n'

/** Store a local file as `gcloud storage cp -Z` with the CDN headers does. */
function putCdn(root: string, bucket: string, name: string, file: string) {
  putObject(root, bucket, name, zlib.gzipSync(fs.readFileSync(file)), CDN_META)
}

// ── Gzip layers ─────────────────────────────────────────────────────────────

const isGzip = (b: Buffer) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b

/** Gzip layers on stored bytes. Throws when a layer does not decode. */
export function gzipLayers(bytes: Buffer): number {
  let n = 0
  let b = bytes
  while (isGzip(b)) {
    b = zlib.gunzipSync(b)
    n++
  }
  return n
}

function peel(bytes: Buffer): Buffer {
  let b = bytes
  while (isGzip(b)) b = zlib.gunzipSync(b)
  return b
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

// ── The SDK seam: a GateBucket over the shim tree ───────────────────────────

const CRC32C_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

/** Base64 big-endian CRC32C, as the JSON API's `crc32c`. */
function crc32c(b: Buffer): string {
  let c = 0xffffffff
  for (const byte of b) c = CRC32C_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  const out = Buffer.alloc(4)
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0)
  return out.toString('base64')
}

/**
 * A GateBucket over one shim bucket, answering like @google-cloud/storage
 * 8.2.0: with `fields`, plain JSON-API items `{name, size (string),
 * md5Hash, crc32c[, contentEncoding]}` (absent when unset), else File-like
 * `{name, metadata}`; with a delimiter, one level, the sub-prefixes in the
 * raw response (the third tuple element). Downloads return stored bytes.
 * Pinned key for key to fixtures/gcs-get-files/with-fields.json.
 */
export function shimGateBucket(root: string, bucket: string): GateBucket {
  const item = (name: string, o: BucketObject) => {
    const it: Record<string, string> = {
      name,
      size: String(o.bytes.length),
      md5Hash: createHash('md5').update(o.bytes).digest('base64'),
      crc32c: crc32c(o.bytes),
    }
    if (o.contentEncoding) it.contentEncoding = o.contentEncoding
    return it
  }
  return {
    async getFiles(query) {
      const prefix = String(query.prefix ?? '')
      const all = readBucket(root, bucket)
      const items: unknown[] = []
      const prefixes = new Set<string>()
      for (const [name, o] of all) {
        if (!name.startsWith(prefix)) continue
        const rest = name.slice(prefix.length)
        if (query.delimiter === '/' && rest.includes('/')) {
          prefixes.add(prefix + rest.slice(0, rest.indexOf('/') + 1))
          continue
        }
        const it = item(name, o)
        items.push(query.fields ? it : { name, metadata: it })
      }
      return [
        items,
        null,
        { kind: 'storage#objects', prefixes: [...prefixes].sort() },
      ]
    },
    file(name) {
      return {
        async download() {
          const o = readBucket(root, bucket).get(name)
          if (!o) throw new Error(`No such object: ${name}`)
          return [new Uint8Array(o.bytes)]
        },
      }
    },
  }
}

// ── The fixture corpus ──────────────────────────────────────────────────────

function sh(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd = REPO
): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf-8' })
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: (r.stderr ?? '') + (r.error ? String(r.error) : ''),
  }
}

/**
 * One date directory as the harness collector-cli writes it: the recorded
 * district files (unenriched, or after the FAC merge), metadata.json,
 * manifest.json and analytics/. Built BY the stub so a re-derived file
 * left unchanged is byte-identical to the seeded one.
 */
function buildDate(scratch: string, date: string, enriched: boolean): string {
  const cache = path.join(scratch, `${date}-${enriched ? 'fac' : 'plain'}`)
  for (const id of HARNESS_DISTRICTS) {
    fs.mkdirSync(path.join(cache, 'raw-csv', date, `district-${id}`), {
      recursive: true,
    })
  }
  const env = { ...process.env, CACHE_DIR: cache }
  const run = (args: string[]) => {
    const r = sh(HARNESS_CLI, args, env)
    if (r.status !== 0) throw new Error(`seed ${args[0]}: ${r.stderr}`)
  }
  run(['transform', '--date', date, '--force', '--verbose'])
  const snap = path.join(cache, 'snapshots', date)
  if (enriched) {
    const fac = path.join(cache, 'fac')
    fs.mkdirSync(fac, { recursive: true })
    for (const id of HARNESS_DISTRICTS)
      writeFac(path.join(fac, `district_${id}.json`), id)
    run([
      'merge-find-a-club',
      '--fac-dir',
      fac,
      '--snapshot-dir',
      snap,
      '--verbose',
    ])
  }
  run(['compute-analytics', '--date', date, '--verbose'])
  return snap
}

/** The recorded fetch-find-a-club output (#1758), keyed to `id`. */
function writeFac(file: string, id: string): void {
  const v = JSON.parse(
    fs.readFileSync(path.join(STUBS, 'raw-fac/district_61.json'), 'utf-8')
  ) as Record<string, unknown>
  fs.writeFileSync(file, JSON.stringify({ ...v, district: id }))
}

function seedDate(
  root: string,
  bucket: string,
  date: string,
  snapDir: string
): void {
  const files = fs
    .readdirSync(snapDir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(snapDir, path.join(e.parentPath, e.name)))
  for (const f of files) {
    putCdn(root, bucket, `snapshots/${date}/${f}`, path.join(snapDir, f))
  }
}

/** A club-trends store document (ClubTrendsStoreData) with weekly points. */
function clubTrends(id: string, py: string, from: string, to: string): Buffer {
  const dates: string[] = []
  const end = new Date(`${to}T00:00:00Z`)
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d <= end;
    d = new Date(d.getTime() + 7 * 86400000)
  ) {
    dates.push(d.toISOString().slice(0, 10))
  }
  if (dates[dates.length - 1] !== to) dates.push(to)
  return Buffer.from(
    JSON.stringify({
      districtId: id,
      programYear: py,
      updatedAt: `${to}T12:00:00.000Z`,
      clubs: {
        '00001': {
          clubId: '00001',
          clubName: 'Harness Club',
          divisionId: 'A',
          divisionName: 'Division A',
          areaId: '01',
          areaName: 'Area 01',
          membershipBase: 20,
          membershipTrend: dates.map((date, i) => ({
            date,
            count: 20 + (i % 3),
          })),
          dcpGoalsTrend: dates.map((date, i) => ({
            date,
            goalsAchieved: Math.min(10, i >> 2),
          })),
        },
      },
    })
  )
}

export interface SeedOptions {
  /** One club-trends object of the current PY is truncated (#1702 class). */
  truncatedStore?: boolean
}

/**
 * A fresh world: the shim root with both buckets seeded from the corpus.
 *
 * - 3 districts × 2 dates (FIXTURE_DATES), in staging and in prod;
 * - historical: staging has no raw for district 201 (its snapshot is
 *   there), and persisted FAC (raw-fac/) for all three; staging and prod
 *   hold the FAC-enriched files, except district 61's, written before its
 *   merge (unenriched in both);
 * - daily: raw for all three, no raw-fac; prod holds the enriched files
 *   (26-key clubs) while staging holds the stripped 17-key ones a non-daily
 *   re-run wrote (D-1, #1758), district 61's from an earlier collection;
 * - club-trends: 2025-2026 spans the whole PY; 2026-2027 runs from July
 *   to the day before the daily, district 61's object stored with two gzip
 *   layers (#1702); with `truncatedStore`, district 02's is cut short;
 * - v1/dates.json and v1/latest.json, identical in both buckets.
 */
export function createWorld(dir: string, opts: SeedOptions = {}): World {
  const root = path.join(dir, 'gcs')
  const cache = path.join(dir, 'cache')
  const bin = path.join(dir, 'bin')
  const scratch = path.join(dir, 'seed')
  for (const d of [root, cache, bin, scratch])
    fs.mkdirSync(d, { recursive: true })
  fs.symlinkSync(SHIM, path.join(bin, 'gcloud'))
  fs.writeFileSync(
    path.join(bin, 'gsutil'),
    '#!/usr/bin/env bash\necho "harness: gsutil is not available (no network)" >&2\nexit 2\n',
    { mode: 0o755 }
  )
  const { historical: H, daily: D } = FIXTURE_DATES

  const hEnriched = buildDate(scratch, H, true)
  const hPlain = buildDate(scratch, H, false)
  const dEnriched = buildDate(scratch, D, true)
  const dPlain = buildDate(scratch, D, false)
  // District 61's historical file predates its FAC merge in both buckets.
  fs.copyFileSync(
    path.join(hPlain, 'district_61.json'),
    path.join(hEnriched, 'district_61.json')
  )
  for (const bucket of [HARNESS_STAGING, HARNESS_PROD]) {
    fs.mkdirSync(path.join(root, bucket), { recursive: true })
    seedDate(root, bucket, H, hEnriched)
  }
  // Staging's stripped daily copy of district 61 is an earlier collection
  // than the one a re-scrape writes, so a re-scrape of it is a new upload.
  const d61 = path.join(dPlain, 'district_61.json')
  fs.writeFileSync(
    d61,
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(d61, 'utf-8')),
      collectedAt: `${D}T03:00:00.000Z`,
    })
  )
  seedDate(root, HARNESS_PROD, D, dEnriched)
  seedDate(root, HARNESS_STAGING, D, dPlain)

  const csv = (id: string) =>
    Buffer.from(`District,Club Number,Club Name\n${id},1,Harness Club\n`)
  for (const id of HARNESS_DISTRICTS) {
    if (id !== '201') {
      putObject(
        root,
        HARNESS_STAGING,
        `raw-csv/${H}/district-${id}/club-performance.csv`,
        csv(id),
        ''
      )
    }
    putObject(
      root,
      HARNESS_STAGING,
      `raw-csv/${D}/district-${id}/club-performance.csv`,
      csv(id),
      ''
    )
    const fac = path.join(scratch, `fac-${id}.json`)
    writeFac(fac, id)
    putObject(
      root,
      HARNESS_STAGING,
      `raw-fac/${H}/district_${id}.json`,
      fs.readFileSync(fac),
      'content-type=application/json\n'
    )
  }

  for (const id of HARNESS_DISTRICTS) {
    putObject(
      root,
      HARNESS_STAGING,
      `club-trends/2025-2026/district_${id}.json`,
      clubTrends(id, '2025-2026', '2025-07-01', '2026-06-30'),
      ''
    )
    const current = clubTrends(id, '2026-2027', '2026-07-01', '2026-10-22')
    if (id === '61') {
      // Two layers, as #1702's double `-Z` round trip left them.
      putObject(
        root,
        HARNESS_STAGING,
        `club-trends/2026-2027/district_${id}.json`,
        zlib.gzipSync(zlib.gzipSync(current)),
        'content-encoding=gzip\n'
      )
    } else if (id === '02' && opts.truncatedStore) {
      putObject(
        root,
        HARNESS_STAGING,
        `club-trends/2026-2027/district_${id}.json`,
        current.subarray(0, current.length >> 1),
        ''
      )
    } else {
      putObject(
        root,
        HARNESS_STAGING,
        `club-trends/2026-2027/district_${id}.json`,
        current,
        ''
      )
    }
  }

  const v1 = {
    'v1/dates.json': {
      _format: { version: '1.0.0', type: 'dates-index' },
      dates: [H, D],
    },
    'v1/latest.json': {
      _format: { version: '1.0.0', type: 'manifest' },
      latestSnapshotDate: D,
    },
  }
  for (const bucket of [HARNESS_STAGING, HARNESS_PROD]) {
    for (const [name, v] of Object.entries(v1)) {
      putObject(
        root,
        bucket,
        name,
        Buffer.from(JSON.stringify(v)),
        'content-type=application/json\ncache-control=no-cache\n'
      )
    }
  }
  fs.rmSync(scratch, { recursive: true, force: true })
  return { dir, root, cache, bin }
}

// ── The prod-twin assertion library ─────────────────────────────────────────

/**
 * Every way prod departs from "a twin of staging, or untouched":
 * - each promoted path is in prod, and every object that changed in prod was
 *   promoted by this run, with staging's exact stored bytes (sha256) and
 *   encoding;
 * - every object decodes: exactly one gzip layer under the CDN prefixes,
 *   none beyond the declared encoding elsewhere; and a `.json` parses.
 * Returns the violations, one line each (empty = pass).
 */
export function prodTwinViolations(
  world: World,
  prodBefore: Map<string, BucketObject>,
  promoted: readonly string[]
): string[] {
  const prod = readBucket(world.root, HARNESS_PROD)
  const staging = readBucket(world.root, HARNESS_STAGING)
  const promotedSet = new Set(promoted)
  const out: string[] = []
  for (const p of promoted) {
    if (!prod.has(p)) out.push(`${p}: promoted but absent from prod`)
  }
  for (const [p, o] of prod) {
    const prev = prodBefore.get(p)
    const changed = !prev || !prev.bytes.equals(o.bytes) || prev.meta !== o.meta
    if (changed) {
      if (!promotedSet.has(p)) {
        out.push(`${p}: changed in prod but not promoted by this run`)
      }
      const s = staging.get(p)
      if (!s) out.push(`${p}: in prod but not in staging`)
      else {
        if (sha256(s.bytes) !== sha256(o.bytes)) {
          out.push(
            `${p}: sha256 ${sha256(o.bytes).slice(0, 12)} differs from staging ${sha256(s.bytes).slice(0, 12)}`
          )
        }
        if (s.contentEncoding !== o.contentEncoding) {
          out.push(
            `${p}: content-encoding ${o.contentEncoding ?? 'none'} differs from staging ${s.contentEncoding ?? 'none'}`
          )
        }
      }
    }
    let layers: number
    try {
      layers = gzipLayers(o.bytes)
    } catch (err) {
      out.push(`${p}: does not decode (${(err as Error).message})`)
      continue
    }
    const want = CDN_PREFIXES.some(c => p.startsWith(c))
      ? 1
      : o.contentEncoding === 'gzip'
        ? 1
        : 0
    if (layers !== want) {
      out.push(`${p}: ${layers} gzip layers, want exactly ${want}`)
    }
    if (p.endsWith('.json')) {
      try {
        JSON.parse(peel(o.bytes).toString('utf-8'))
      } catch {
        out.push(`${p}: does not parse as JSON`)
      }
    }
  }
  return out
}

// ── Running a mode ──────────────────────────────────────────────────────────

export interface StepRecord {
  step: string
  status: number
  stderr: string
}

export interface PipelineRun {
  /** promoted: something reached prod and no date was held. */
  outcome: 'promoted' | 'held' | 'failed'
  failedStep?: string
  steps: StepRecord[]
  /** process-dates.sh's counts JSON. */
  counts?: { succeeded: number; refused: number; failed: number }
  manifest: RunManifestEntry[]
  completeness?: CompletenessGateResult
  content?: ContentGateResult
  /** Object paths the promoter copied to prod (from the shim's argv log). */
  promoted: string[]
}

export interface RunOptions {
  mode: HarnessMode
  date: string
  /** rescrape: an explicit id list (subset), default `discover`. */
  districts?: string
}

/** The PY label a date belongs to (calendar; the corpus avoids July). */
function programYearOf(date: string): string {
  const y = Number(date.slice(0, 4))
  return Number(date.slice(5, 7)) >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

/** Run one mode through the workflow's sequence against the shim. */
export async function runPipeline(
  world: World,
  opts: RunOptions
): Promise<PipelineRun> {
  const runDir = path.join(world.dir, 'run')
  fs.mkdirSync(runDir, { recursive: true })
  const manifestFile = path.join(runDir, 'written.jsonl')
  const removalsFile = path.join(runDir, 'removed.jsonl')
  const verdictFile = path.join(runDir, 'completeness-gate.json')
  const promoteLog = path.join(runDir, 'promote-gcloud.log')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${world.bin}${path.delimiter}${process.env.PATH ?? ''}`,
    GCLOUD: SHIM,
    SHIM_ROOT: world.root,
    // gcloud 588 (the runner's pin) inflates one gzip layer on download.
    SHIM_DOWNLOAD_DECOMPRESS: '1',
    CACHE_DIR: world.cache,
    GCS_BUCKET: HARNESS_STAGING,
    GCS_BUCKET_PRODUCTION: HARNESS_PROD,
    RUN_MANIFEST_FILE: manifestFile,
    RUN_REMOVALS_FILE: removalsFile,
    COMPLETENESS_GATE_FILE: verdictFile,
    GITHUB_STEP_SUMMARY: path.join(runDir, 'summary.md'),
    GITHUB_OUTPUT: path.join(runDir, 'outputs.txt'),
    GITHUB_RUN_ID: 'harness',
    COLLECTOR_CLI: HARNESS_CLI,
    HARNESS_DISTRICTS: HARNESS_DISTRICTS.join(','),
    GUARD_SNAPSHOT_UPLOAD: path.join(STUBS, 'guard-snapshot-upload'),
    RESOLVE_REBUILD_SOURCE: path.join(STUBS, 'resolve-rebuild-source'),
    BUILD_IDENTITY_HISTORY: path.join(STUBS, 'build-identity-history'),
    BUILD_REPORTS_ROLLUPS: path.join(STUBS, 'build-reports-rollups'),
    BUILD_EDUCATION_ROLLUP: path.join(STUBS, 'build-education-rollup'),
    ALLOW_PARTIAL: 'false',
    ALLOW_VALUE_CHANGES: 'false',
  }
  delete env.SHIM_LOG
  const run: PipelineRun = {
    outcome: 'failed',
    steps: [],
    manifest: [],
    promoted: [],
  }
  const step = (
    name: string,
    cmd: string,
    args: string[],
    extra: NodeJS.ProcessEnv = {}
  ) => {
    const r = sh(cmd, args, { ...env, ...extra })
    run.steps.push({
      step: name,
      status: r.status,
      stderr: r.stderr.slice(-4000),
    })
    return r
  }
  const fail = (name: string): PipelineRun => {
    run.outcome = 'failed'
    run.failedStep = name
    return run
  }

  // rescrape-historical: the download step leaves the dashboard's CSVs in
  // the cache (scripts/rescrape-historical.ts); the harness stands in for it.
  if (opts.mode === 'rescrape-historical') {
    for (const id of HARNESS_DISTRICTS) {
      const d = path.join(world.cache, 'raw-csv', opts.date, `district-${id}`)
      fs.mkdirSync(d, { recursive: true })
      fs.writeFileSync(
        path.join(d, 'club-performance.csv'),
        `District,Club Number,Club Name\n${id},1,Harness Club\n`
      )
    }
  }

  // 1. Store sync. Daily pulls only the date's PY of club-trends.
  const stores = [
    'time-series',
    'club-trends',
    'club-race',
    'district-awards-history',
    'district-region-history',
  ]
  const syncEnv: NodeJS.ProcessEnv = {}
  if (opts.mode === 'daily') {
    const scope = sh(
      TSX,
      [
        'scripts/club-trends-sync-scope.ts',
        '--program-year',
        programYearOf(opts.date),
        '--date',
        opts.date,
      ],
      env
    )
    if (scope.status !== 0) return fail('club-trends-sync-scope')
    syncEnv.CLUB_TRENDS_PROGRAM_YEARS = scope.stdout.trim()
  }
  if (
    step(
      'sync-stores',
      'bash',
      ['scripts/pipeline/sync-stores.sh', HARNESS_STAGING, ...stores],
      syncEnv
    ).status !== 0
  ) {
    return fail('sync-stores')
  }

  // 2. The per-date loop.
  const districts =
    opts.mode === 'daily'
      ? HARNESS_DISTRICTS.join(',')
      : opts.mode === 'rescrape'
        ? (opts.districts ?? 'discover')
        : ''
  const pd = step(
    'process-dates',
    'bash',
    [
      'scripts/pipeline/process-dates.sh',
      HARNESS_STAGING,
      opts.mode,
      opts.date,
    ],
    {
      DISTRICTS: districts,
      DATE_RESULTS_FILE: path.join(runDir, 'date-results.jsonl'),
    }
  )
  try {
    run.counts = JSON.parse(pd.stdout)
  } catch {
    run.counts = undefined
  }
  if (pd.status !== 0 || !run.counts) return fail('process-dates')
  if (opts.mode === 'daily' && run.counts.succeeded !== 1)
    return fail('process-dates')

  // 3. Store publish (+ rescrape-historical's raw upload).
  if (
    step('publish-stores', 'bash', [
      'scripts/pipeline/publish-stores.sh',
      HARNESS_STAGING,
      'time-series',
      'club-trends',
      'club-race',
      'district-awards-history',
    ]).status !== 0
  ) {
    return fail('publish-stores')
  }
  if (opts.mode === 'rescrape-historical') {
    if (
      step('historical-raw-csv', 'bash', [
        'scripts/pipeline/gcs-upload.sh',
        'historical-raw-csv',
        'rsync',
        '-r',
        `${world.cache}/raw-csv/`,
        `gs://${HARNESS_STAGING}/raw-csv/`,
      ]).status !== 0
    ) {
      return fail('historical-raw-csv')
    }
  }
  if (opts.mode !== 'daily') {
    if (
      step('partial-failure-gate', 'bash', [
        'scripts/partial-failure-gate.sh',
        opts.mode,
        String(run.counts.failed),
      ]).status !== 0
    ) {
      return fail('partial-failure-gate')
    }
  }

  // 4. Publish the run manifest (the workflow's inline `gcloud storage cp`).
  const manifestText = fs.existsSync(manifestFile)
    ? fs.readFileSync(manifestFile, 'utf-8')
    : ''
  run.manifest = parseRunManifest(manifestText)
  if (run.manifest.length > 0) {
    if (
      step('publish-run-manifest', SHIM, [
        'storage',
        'cp',
        '--content-type=application/x-ndjson',
        manifestFile,
        `gs://${HARNESS_STAGING}/runs/harness/written.jsonl`,
      ]).status !== 0
    ) {
      return fail('publish-run-manifest')
    }
  }

  // 5. Gates, in-process over the SDK seam.
  const staging = shimGateBucket(world.root, HARNESS_STAGING)
  const prod = shimGateBucket(world.root, HARNESS_PROD)
  run.completeness = await runCompletenessGate(
    staging,
    prod,
    manifestSnapshotDates(run.manifest),
    { allowValueChanges: false }
  )
  fs.writeFileSync(verdictFile, JSON.stringify(run.completeness, null, 2))
  run.content = await runContentGate(staging, prod, () => {}, {
    manifest: run.manifest,
  })
  if (!run.content.promote) {
    run.outcome = 'held'
    return run
  }

  // 6. Promote: the real promoter, its gcloud calls on the shim.
  let promoteErr = ''
  const status = await runPromoteRunManifest(['--execute'], {
    env: { ...env, SHIM_LOG: promoteLog },
    out: () => {},
    err: s => (promoteErr += s),
  })
  run.steps.push({ step: 'promote', status, stderr: promoteErr.slice(-4000) })
  if (status !== 0) return fail('promote')
  run.promoted = promotedPaths(promoteLog)

  const held =
    run.completeness.heldDates.length > 0 || !run.completeness.promote
  run.outcome = held || run.promoted.length === 0 ? 'held' : 'promoted'
  return run
}

/** Staging object paths of every `storage cp <srcs…> gs://prod/…` the promoter ran. */
function promotedPaths(logFile: string): string[] {
  if (!fs.existsSync(logFile)) return []
  const src = `gs://${HARNESS_STAGING}/`
  const out: string[] = []
  for (const line of fs.readFileSync(logFile, 'utf-8').split('\n')) {
    const argv = line.split(' ')
    if (argv[0] !== 'storage' || argv[1] !== 'cp') continue
    if (!argv[argv.length - 1]!.startsWith(`gs://${HARNESS_PROD}/`)) continue
    for (const a of argv) if (a.startsWith(src)) out.push(a.slice(src.length))
  }
  return [...new Set(out)].sort()
}

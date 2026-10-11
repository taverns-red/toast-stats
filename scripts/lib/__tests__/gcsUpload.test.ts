/**
 * scripts/pipeline/gcs-upload.sh — every staging upload records itself in
 * the run manifest (#1762, ADR-015 P5, migration step 4).
 *
 * Runs the REAL wrapper against the gcloud shim. The shim logs each object
 * an upload actually wrote, with the sha256 of the uncompressed bytes
 * (SHIM_UPLOAD_LOG); the contract is that the manifest lists exactly those
 * objects with exactly those hashes — every one, and nothing else.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { createHash } from 'node:crypto'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/pipeline/gcs-upload.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const BUCKET = 'test-bucket'

let tmp: string
let root: string
let local: string
let manifest: string
let uploadLog: string

const sha = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex')

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GCLOUD: SHIM,
      SHIM_ROOT: root,
      SHIM_UPLOAD_LOG: uploadLog,
      RUN_MANIFEST_FILE: manifest,
      GCS_BUCKET_PRODUCTION: 'prod-bucket',
      ...env,
    },
  })
}

function writeLocal(rel: string, content: string): string {
  const f = path.join(local, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, content)
  return f
}

interface Entry {
  path: string
  sha256: string
  date: string | null
  stage: string
}

function manifestEntries(): Entry[] {
  if (!fs.existsSync(manifest)) return []
  return fs
    .readFileSync(manifest, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as Entry)
}

/** `path sha` pairs the shim really wrote, sorted. */
function uploaded(): string[] {
  if (!fs.existsSync(uploadLog)) return []
  return fs
    .readFileSync(uploadLog, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(l => l.replace('\t', ' '))
    .sort()
}

const recorded = () =>
  manifestEntries()
    .map(e => `${e.path} ${e.sha256}`)
    .sort()

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcs-upload-'))
  root = path.join(tmp, 'gcs')
  local = path.join(tmp, 'local')
  manifest = path.join(tmp, 'run', 'written.jsonl')
  uploadLog = path.join(tmp, 'uploads.log')
  fs.mkdirSync(path.join(root, BUCKET), { recursive: true })
  fs.mkdirSync(path.join(root, 'prod-bucket'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('gcs-upload.sh: the manifest is exactly what went up (#1762)', () => {
  it('cp of several files into a prefix, -Z: one line per object, sha of the uncompressed bytes', () => {
    const a = writeLocal('snap/district_61.json', '{"a":1}')
    const b = writeLocal('snap/metadata.json', '{"b":2}')
    const r = run([
      'daily-upload',
      'cp',
      '--content-type=application/json',
      '--cache-control=public, max-age=3600, must-revalidate',
      '-Z',
      a,
      b,
      `gs://${BUCKET}/snapshots/2026-10-10/`,
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(uploaded()).toHaveLength(2)
    expect(recorded()).toEqual(uploaded())
    // Stored gzip; the manifest hash is the hash of what a browser decodes.
    const stored = fs.readFileSync(
      path.join(root, BUCKET, 'snapshots/2026-10-10/district_61.json')
    )
    const entry = manifestEntries().find(e => e.path.endsWith('_61.json'))
    expect(entry?.sha256).toBe(sha(zlib.gunzipSync(stored)))
    expect(entry).toMatchObject({
      date: '2026-10-10',
      stage: 'daily-upload',
    })
  })

  it('cp of one file to a full object name; a dateless path records date null', () => {
    const f = writeLocal('latest.json', '{"latestSnapshotDate":"2026-10-10"}')
    const r = run([
      'cdn-manifests',
      'cp',
      '--content-type=application/json',
      f,
      `gs://${BUCKET}/v1/latest.json`,
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(manifestEntries()).toEqual([
      {
        path: 'v1/latest.json',
        sha256: sha('{"latestSnapshotDate":"2026-10-10"}'),
        date: null,
        stage: 'cdn-manifests',
      },
    ])
  })

  it('cp -r of a quoted wildcard records every match', () => {
    writeLocal('rh/61.json', '{"d":"61"}')
    writeLocal('rh/02.json', '{"d":"02"}')
    const r = run([
      'cdn-manifests',
      'cp',
      '--content-type=application/json',
      '-r',
      path.join(local, 'rh/*.json'),
      `gs://${BUCKET}/v1/rank-history/`,
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(uploaded()).toHaveLength(2)
    expect(recorded()).toEqual(uploaded())
  })

  it('rsync -r of a tree records every file under its object path and date', () => {
    writeLocal('raw/2026-10-10/district-61/club-performance.csv', 'Club\n')
    writeLocal('raw/2026-10-09/district-02/club-performance.csv', 'Club,X\n')
    const r = run([
      'historical-raw-csv',
      'rsync',
      '-r',
      `${path.join(local, 'raw')}/`,
      `gs://${BUCKET}/raw-csv/`,
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(uploaded()).toHaveLength(2)
    expect(recorded()).toEqual(uploaded())
    expect(
      manifestEntries()
        .map(e => e.date)
        .sort()
    ).toEqual(['2026-10-09', '2026-10-10'])
  })

  it('appends across calls (one manifest per run)', () => {
    run(['a', 'cp', writeLocal('x.json', '1'), `gs://${BUCKET}/v1/x.json`])
    run(['b', 'cp', writeLocal('y.json', '2'), `gs://${BUCKET}/v1/y.json`])
    expect(manifestEntries().map(e => e.stage)).toEqual(['a', 'b'])
  })

  it('a failed upload records nothing and exits with the gcloud status', () => {
    const f = writeLocal('x.json', '1')
    const r = run(['a', 'cp', f, `gs://${BUCKET}/v1/x.json`], {
      SHIM_FAIL_MATCH: 'v1/x\\.json',
    })
    expect(r.status).not.toBe(0)
    expect(manifestEntries()).toEqual([])
  })

  it('refuses a production destination: prod writes are the promote step only', () => {
    const f = writeLocal('x.json', '1')
    const r = run(['a', 'cp', f, 'gs://prod-bucket/v1/x.json'])
    expect(r.status).toBe(2)
    expect(uploaded()).toEqual([])
  })

  it('refuses to upload when RUN_MANIFEST_FILE is unset: an unrecorded write is invisible to the gate', () => {
    const f = writeLocal('x.json', '1')
    const r = run(['a', 'cp', f, `gs://${BUCKET}/v1/x.json`], {
      RUN_MANIFEST_FILE: '',
    })
    expect(r.status).toBe(2)
    expect(uploaded()).toEqual([])
  })

  it('refuses a missing source before uploading anything (a space-separated flag value reads as one)', () => {
    const f = writeLocal('x.json', '1')
    const r = run([
      'a',
      'cp',
      '--content-type',
      'application/json',
      f,
      `gs://${BUCKET}/v1/x.json`,
    ])
    expect(r.status).toBe(2)
    expect(uploaded()).toEqual([])
  })

  it('refuses a download: it records uploads only', () => {
    const r = run(['a', 'cp', `gs://${BUCKET}/v1/x.json`, local])
    expect(r.status).toBe(2)
  })
})

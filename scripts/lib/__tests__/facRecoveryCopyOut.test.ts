/**
 * scripts/ops/fac-recovery-2239-copy-out.sh (#2239): copies the enriched,
 * soft-deleted generations of snapshots/<date>/district_<id>.json out to
 * the private recovery bucket, per object: restore E over the live L
 * (--if-generation-match=L), server-side cp of the restored R to
 * fac-2239/<date>/ (--no-clobber, then an md5 check against E), restore L
 * back (--if-generation-match=R, then an md5 check against L).
 *
 * Runs the REAL script against the gcloud shim with SHIM_GENERATIONS=1
 * (generations and soft delete, as the JSON API documents them). The keys
 * it reads are pinned to real SDK output: fixtures/gcloud-objects-list/
 * staging-soft-deleted.json (an objects listing) and fixtures/
 * gcloud-buckets/ (buckets describe / get-iam-policy, members anonymised).
 *
 * The kill cases (#2240 review) run through a hook wrapper around the shim
 * (hooks below) that pauses a step, garbles one response or races a
 * third-party write, so the test can interrupt or fail the script exactly
 * between step 1 and step 3.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, spawnSync } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/ops/fac-recovery-2239-copy-out.sh')
const FIXTURES = path.join(REPO, 'scripts/lib/__tests__/fixtures')
const SHIM = path.join(FIXTURES, 'gcloud-shim/gcloud')
const REAL_SOFT = path.join(
  FIXTURES,
  'gcloud-objects-list/staging-soft-deleted.json'
)
const REAL_DESCRIBE = path.join(
  FIXTURES,
  'gcloud-buckets/staging-describe.json'
)
const REAL_IAM = path.join(FIXTURES, 'gcloud-buckets/staging-iam-policy.json')
const STAGING = 'toast-stats-data-staging'
const PROD = 'toast-stats-data-ca'
const DEST = 'toast-stats-fac-recovery-2239'

let tmp: string
let root: string
let shimLog: string
let ghStub: string
let hooks: string
let stateDir: string

type Json = Record<string, unknown>

function md5(bytes: Buffer): string {
  return crypto.createHash('md5').update(bytes).digest('base64')
}

/** A gzip district file of roughly `kb` KiB stored (incompressible body). */
function body(kb: number, seed: string): Buffer {
  let s = ''
  let i = 0
  while (s.length < kb * 1024) {
    s += crypto.createHash('sha256').update(`${seed}${i++}`).digest('base64')
  }
  return zlib.gzipSync(JSON.stringify({ seed, s }))
}

function putLive(bucket: string, name: string, bytes: Buffer, gen: string) {
  const obj = path.join(root, bucket, name)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, bytes)
  const meta = path.join(root, '.meta', bucket, name)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(
    meta,
    `content-encoding=gzip\ncontent-type=application/json\ngeneration=${gen}\n`
  )
}

function putSoft(bucket: string, name: string, bytes: Buffer, gen: string) {
  const obj = path.join(root, '.soft', bucket, `${name}#${gen}`)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, bytes)
  const meta = path.join(root, '.soft-meta', bucket, `${name}#${gen}`)
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  fs.writeFileSync(
    meta,
    `content-encoding=gzip\ncontent-type=application/json\ngeneration=${gen}\nsoft-delete-time=2026-10-07T11:28:03+0000\n`
  )
}

/** Bucket metadata in the recorded shape (the shim serves it). */
function putBucket(
  bucket: string,
  opts: { pap?: string; members?: string[] } = {}
) {
  const dir = path.join(root, '.buckets', bucket)
  fs.mkdirSync(dir, { recursive: true })
  const describe = JSON.parse(fs.readFileSync(REAL_DESCRIBE, 'utf-8')) as Json
  describe.name = bucket
  describe.storage_url = `gs://${bucket}/`
  describe.public_access_prevention = opts.pap ?? 'enforced'
  fs.writeFileSync(path.join(dir, 'describe.json'), JSON.stringify(describe))
  const iam = JSON.parse(fs.readFileSync(REAL_IAM, 'utf-8')) as {
    bindings: Array<{ role: string; members: string[] }>
  }
  // The recorded staging policy, minus its allUsers viewer, plus `members`.
  iam.bindings = iam.bindings.filter(b => !b.members.includes('allUsers'))
  if (opts.members) {
    iam.bindings.push({
      role: 'roles/storage.objectViewer',
      members: opts.members,
    })
  }
  fs.writeFileSync(path.join(dir, 'iam.json'), JSON.stringify(iam))
}

function liveBytes(bucket: string, name: string): Buffer | undefined {
  const f = path.join(root, bucket, name)
  return fs.existsSync(f) ? fs.readFileSync(f) : undefined
}

function liveMeta(bucket: string, name: string): string {
  return fs.readFileSync(path.join(root, '.meta', bucket, name), 'utf-8')
}

interface Seeded {
  name: string
  enriched: Buffer
  E: string
  live: Buffer
  L: string
}

/**
 * One date as #2237's strip left it: live L (stripped, small), the enriched
 * E soft-deleted (2.1x), an older pre-enrichment generation and a later
 * stripped one also soft-deleted, plus a reports sidecar (never copied).
 */
function seedDate(bucket: string, date: string, ids: string[]): Seeded[] {
  fs.mkdirSync(path.join(root, DEST), { recursive: true })
  return ids.map((id, n) => {
    const name = `snapshots/${date}/district_${id}.json`
    const base = 1781615174895950 + n * 10
    const enriched = body(21, `${name}-enriched`)
    const live = body(10, `${name}-live`)
    putSoft(bucket, name, body(10, `${name}-older`), String(base - 5))
    putSoft(bucket, name, enriched, String(base))
    putSoft(
      bucket,
      name,
      body(10, `${name}-stripped1`),
      String(base + 9_757_308_196_904)
    )
    putLive(bucket, name, live, String(base + 10_364_050_235_389))
    const sidecar = `snapshots/${date}/district_${id}_reports.json`
    putLive(bucket, sidecar, body(3, sidecar), String(base + 1))
    putSoft(bucket, sidecar, body(9, `${sidecar}-old`), String(base + 2))
    return {
      name,
      enriched,
      E: String(base),
      live,
      L: String(base + 10_364_050_235_389),
    }
  })
}

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GCLOUD: hooks,
    SHIM: SHIM,
    GH: ghStub,
    SHIM_ROOT: root,
    SHIM_LOG: shimLog,
    SHIM_GENERATIONS: '1',
    HOOK_DIR: tmp,
    STUB_GH_DIR: tmp,
    COPYOUT_LOCK_DIR: path.join(tmp, 'lock'),
    PAUSE_SECONDS: '0',
    ...extra,
  }
}

interface Run {
  status: number | null
  stderr: string
  plan: Json[]
  results: Json[]
  recover: Json[]
  cdn: Json | undefined
  summary: Json | undefined
}

function parse(status: number | null, stdout: string, stderr: string): Run {
  const out = stdout
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as Json)
  return {
    status,
    stderr,
    plan: out.filter(o => o.type === 'plan'),
    results: out.filter(o => o.type === 'result'),
    recover: out.filter(o => o.type === 'recover'),
    cdn: out.find(o => o.type === 'cdn-invalidate'),
    summary: out.find(o => o.type === 'summary'),
  }
}

function run(args: string[], extra: Record<string, string> = {}): Run {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO,
    encoding: 'utf-8',
    env: env(extra),
  })
  return parse(r.status, r.stdout, r.stderr)
}

const withState = (args: string[]) => ['--state-dir', stateDir, ...args]

function calls(): string[] {
  return fs.existsSync(shimLog)
    ? fs.readFileSync(shimLog, 'utf-8').split('\n').filter(Boolean)
    : []
}

const writes = () =>
  calls().filter(l => /^storage (restore|cp|rm|rsync)\b/.test(l))

function journal(): Json[] {
  const f = path.join(stateDir, 'journal.jsonl')
  return fs.existsSync(f)
    ? fs
        .readFileSync(f, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l) as Json)
    : []
}

function waitFor(file: string, ms = 20_000): Promise<void> {
  const until = Date.now() + ms
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (fs.existsSync(file)) return resolve()
      if (Date.now() > until) return reject(new Error(`no ${file}`))
      setTimeout(tick, 25)
    }
    tick()
  })
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fac-copy-out-'))
  root = path.join(tmp, 'gcs')
  shimLog = path.join(tmp, 'gcloud.log')
  stateDir = path.join(tmp, 'state')
  ghStub = path.join(tmp, 'gh')
  // `gh run list ... --status in_progress --json databaseId --jq length`:
  // prints the next line of $STUB_GH_DIR/gh-running (default 0) per call.
  fs.writeFileSync(
    ghStub,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >>"${STUB_GH_DIR}/gh.log"',
      'q="${STUB_GH_DIR}/gh-running"',
      'if [ -s "$q" ]; then head -1 "$q"; tail -n +2 "$q" >"$q.t"; mv "$q.t" "$q"; else echo 0; fi',
    ].join('\n') + '\n'
  )
  fs.chmodSync(ghStub, 0o755)
  // Hooks around the shim, each armed by a file in $HOOK_DIR:
  //   pause-cp            the source→dest cp waits for $HOOK_DIR/go
  //                        (and touches cp-reached first)
  //   garble-after-restore the first source describe after an enriched
  //                        restore prints an HTML error page, exit 0
  //   race-restore-back    before the restore of L, a third party writes
  //                        the live object (a newer generation)
  hooks = path.join(tmp, 'gcloud-hooks')
  fs.writeFileSync(
    hooks,
    [
      '#!/usr/bin/env bash',
      'args="$*"',
      'H="${HOOK_DIR}"',
      'if [ -e "$H/pause-cp" ] && [[ "$args" == "storage cp --no-clobber "* ]]; then',
      '  touch "$H/cp-reached"',
      '  while [ ! -e "$H/go" ]; do sleep 0.05; done',
      'fi',
      // corrupt-journal (holds the journal path): the first source→dest cp
      // appends a complete but unparseable line to it, mid-run.
      'if [ -s "$H/corrupt-journal" ] && [[ "$args" == "storage cp --no-clobber "* ]] && [ ! -e "$H/corrupted" ]; then',
      '  touch "$H/corrupted"; printf "%s\\n" "not json {" >>"$(cat "$H/corrupt-journal")"',
      'fi',
      'if [[ "$args" == "storage restore "* ]] && [ -e "$H/enriched-gen" ] && [[ "$args" == *"#$(cat "$H/enriched-gen") "* ]]; then',
      '  "$SHIM" "$@"; s=$?; touch "$H/restored-enriched"; exit $s',
      'fi',
      'if [ -e "$H/garble-after-restore" ] && [ -e "$H/restored-enriched" ] && [ ! -e "$H/garbled" ] && [[ "$args" == "storage objects describe gs://' +
        STAGING +
        '/"* ]]; then',
      '  touch "$H/garbled"; echo "<html><body>503 Service Unavailable</body></html>"; exit 0',
      'fi',
      'if [ -e "$H/race-restore-back" ] && [ -e "$H/live-gen" ] && [[ "$args" == "storage restore "* ]] && [[ "$args" == *"#$(cat "$H/live-gen") "* ]] && [ ! -e "$H/raced" ]; then',
      '  touch "$H/raced"',
      '  printf "%s" "a newer daily" >"$H/newer.json"',
      '  "$SHIM" storage cp "$H/newer.json" "$(cat "$H/race-url")" >/dev/null 2>&1',
      'fi',
      'exec "$SHIM" "$@"',
    ].join('\n') + '\n'
  )
  fs.chmodSync(hooks, 0o755)
  fs.mkdirSync(path.join(root, STAGING), { recursive: true })
  fs.mkdirSync(path.join(root, PROD), { recursive: true })
  // The happy preflight: a private recovery bucket, staging's allUsers off.
  putBucket(DEST)
  putBucket(STAGING)
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('the shim speaks the recorded SDK shapes', () => {
  it('lists soft-deleted generations with the real keys the script reads', () => {
    const real = JSON.parse(fs.readFileSync(REAL_SOFT, 'utf-8')) as Json[]
    const realKeys = new Set(real.flatMap(e => Object.keys(e)))
    seedDate(STAGING, '2026-06-15', ['61'])
    const r = spawnSync(
      'bash',
      [
        SHIM,
        'storage',
        'objects',
        'list',
        `gs://${STAGING}/snapshots/2026-06-15/district_61.json`,
        '--soft-deleted',
        '--format=json',
      ],
      { encoding: 'utf-8', env: { ...process.env, SHIM_ROOT: root } }
    )
    const shim = JSON.parse(r.stdout) as Json[]
    expect(shim).toHaveLength(3)
    for (const k of Object.keys(shim[0]!)) expect(realKeys.has(k), k).toBe(true)
    expect(typeof real[0]!.generation).toBe('string')
    expect(typeof real[0]!.size).toBe('number')
    expect(typeof shim[0]!.generation).toBe('string')
    expect(typeof shim[0]!.size).toBe('number')
  })

  it('serves the recorded bucket describe / IAM shapes', () => {
    const d = JSON.parse(fs.readFileSync(REAL_DESCRIBE, 'utf-8')) as Json
    expect(d.public_access_prevention).toBe('inherited')
    const iam = JSON.parse(fs.readFileSync(REAL_IAM, 'utf-8')) as {
      bindings: Array<{ members: string[] }>
    }
    // Staging today: public, which --execute must refuse.
    expect(iam.bindings.some(b => b.members.includes('allUsers'))).toBe(true)
  })
})

describe('copy-out: usage and guards', () => {
  it('needs a bucket and at least one date, and one mode', () => {
    expect(run([]).status).toBe(2)
    expect(run([STAGING]).status).toBe(2)
    expect(run([STAGING, '2026-6-15']).status).toBe(2)
    expect(run(['--bogus', STAGING, '2026-06-15']).status).toBe(2)
    expect(run(['--execute', '--pilot', STAGING, '2026-06-15']).status).toBe(2)
    expect(run(['--execute', '--recover', STAGING, '2026-06-15']).status).toBe(
      2
    )
    expect(calls()).toEqual([])
  })

  it(`refuses ${PROD} without --allow-prod, before any call`, () => {
    seedDate(PROD, '2026-05-30', ['01'])
    const r = run([PROD, '2026-05-30'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('--allow-prod')
    expect(calls()).toEqual([])
    expect(run(['--recover', PROD, '2026-05-30']).status).toBe(2)
    const ok = run(['--allow-prod', PROD, '2026-05-30'])
    expect(ok.status, ok.stderr).toBe(0)
    expect(ok.plan).toHaveLength(1)
  })

  it('refuses the recovery bucket itself as the source', () => {
    expect(run([DEST, '2026-06-15']).status).toBe(2)
  })
})

describe('copy-out: preflight, verified and never changed', () => {
  const cases: Array<[string, () => void]> = [
    [
      'the recovery bucket does not exist',
      () => {
        fs.rmSync(path.join(root, '.buckets', DEST), { recursive: true })
      },
    ],
    [
      'the recovery bucket does not enforce public access prevention',
      () => putBucket(DEST, { pap: 'inherited' }),
    ],
    [
      'the recovery bucket grants allAuthenticatedUsers',
      () => putBucket(DEST, { members: ['allAuthenticatedUsers'] }),
    ],
    [
      'staging still grants allUsers (the recorded policy as-is)',
      () => {
        fs.copyFileSync(
          REAL_IAM,
          path.join(root, '.buckets', STAGING, 'iam.json')
        )
      },
    ],
  ]
  for (const [what, arrange] of cases) {
    it(`--execute refuses when ${what}, before any write`, () => {
      seedDate(STAGING, '2026-06-15', ['61'])
      arrange()
      const r = run(withState(['--execute', STAGING, '2026-06-15']))
      expect(r.status).toBe(1)
      expect(writes()).toEqual([])
      expect(r.summary).toMatchObject({ preflight: { ok: false } })
      // The dry run reports the same failed check.
      fs.rmSync(shimLog)
      const d = run([STAGING, '2026-06-15'])
      expect(d.status).toBe(1)
      expect(d.summary).toMatchObject({ preflight: { ok: false } })
      expect(writes()).toEqual([])
    })
  }

  it('changes no IAM and no bucket setting itself', () => {
    seedDate(STAGING, '2026-06-15', ['61', '62'])
    expect(run(withState(['--execute', STAGING, '2026-06-15'])).status).toBe(0)
    expect(
      calls().filter(l =>
        /^storage buckets (?!describe |get-iam-policy )/.test(l)
      )
    ).toEqual([])
    expect(calls().some(l => /iam-policy-binding|set-iam-policy/.test(l))).toBe(
      false
    )
  })

  it('a prod source skips only the source check (its allUsers cannot be off)', () => {
    seedDate(PROD, '2026-05-30', ['01'])
    fs.mkdirSync(path.join(root, '.buckets', PROD), { recursive: true })
    fs.copyFileSync(REAL_IAM, path.join(root, '.buckets', PROD, 'iam.json'))
    const r = run(withState(['--execute', '--allow-prod', PROD, '2026-05-30']))
    expect(r.status, r.stderr).toBe(0)
    expect(r.cdn).toMatchObject({
      commands: [
        "gcloud compute url-maps invalidate-cdn-cache toast-stats-cdn-url-map --path='/snapshots/2026-05-30/*'",
      ],
    })
  })
})

describe('copy-out: dry run (the default)', () => {
  it('prints the plan from a fresh listing and writes nothing', () => {
    const seeded = seedDate(STAGING, '2026-06-15', ['61', '62'])
    const r = run([STAGING, '2026-06-15'])
    expect(r.status, r.stderr).toBe(0)
    expect(writes()).toEqual([])
    expect(r.plan.map(p => p.name)).toEqual(seeded.map(s => s.name))
    expect(r.plan[0]).toMatchObject({
      type: 'plan',
      date: '2026-06-15',
      bucket: STAGING,
      name: seeded[0]!.name,
      action: 'copy',
      enriched: {
        generation: seeded[0]!.E,
        md5: md5(seeded[0]!.enriched),
        size: seeded[0]!.enriched.length,
      },
      live: {
        generation: seeded[0]!.L,
        md5: md5(seeded[0]!.live),
        size: seeded[0]!.live.length,
      },
      destination: `gs://${DEST}/fac-2239/2026-06-15/district_61.json`,
    })
    expect(r.summary).toMatchObject({
      type: 'summary',
      mode: 'dry-run',
      bucket: STAGING,
      dates: 1,
      objects: 2,
      copy: 2,
      done: 0,
      noCandidate: 0,
      conflict: 0,
      manifestMismatch: 0,
      bytes: seeded.reduce((n, s) => n + s.enriched.length, 0),
      preflight: { ok: true },
    })
  })

  it('a district with no generation above 1.5x the live size is no-candidate', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    const name = 'snapshots/2026-06-15/district_99.json'
    putLive(STAGING, name, body(10, 'live99'), '1791979225131339')
    putSoft(STAGING, name, body(12, 'soft99'), '1781615174895000')
    const r = run([STAGING, '2026-06-15'])
    expect(r.status).toBe(0)
    expect(r.plan.find(p => p.name === name)).toMatchObject({
      action: 'no-candidate',
      enriched: null,
    })
    expect(r.summary).toMatchObject({ copy: 1, noCandidate: 1 })
  })

  it('an existing copy with another md5 is a conflict that blocks', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    putLive(
      DEST,
      'fac-2239/2026-06-15/district_61.json',
      body(5, 'other'),
      '1792000000000000'
    )
    const r = run([STAGING, '2026-06-15'])
    expect(r.status).toBe(1)
    expect(r.plan[0]).toMatchObject({ action: 'conflict' })
  })
})

describe('copy-out: --manifest', () => {
  function writeManifest(
    seeded: Seeded[],
    md5Of = (s: Seeded) => md5(s.enriched)
  ) {
    const f = path.join(tmp, 'manifest.json')
    fs.writeFileSync(
      f,
      JSON.stringify(
        seeded.map(s => ({
          group: 'B',
          date: s.name.split('/')[1],
          bucket: STAGING,
          name: s.name,
          generation: s.E,
          size: s.enriched.length,
          md5: md5Of(s),
          hard_delete: '2026-11-06T11:28:03+0000',
        }))
      )
    )
    return f
  }

  it('an md5 that differs from the stored manifest blocks', () => {
    const seeded = seedDate(STAGING, '2026-06-15', ['61'])
    const m = writeManifest(seeded, () => md5(Buffer.from('other')))
    const r = run(['--manifest', m, STAGING, '2026-06-15'])
    expect(r.status).toBe(1)
    expect(r.plan[0]).toMatchObject({ action: 'manifest-mismatch' })
    const x = run(
      withState(['--execute', '--manifest', m, STAGING, '2026-06-15'])
    )
    expect(x.status).toBe(1)
    expect(writes()).toEqual([])
  })

  it('resumes: after a run, the copied objects are done, not mismatched', () => {
    // Step 3 soft-deletes R, a newer, larger generation with E's bytes: the
    // plan now picks R. Same md5, so the manifest still agrees.
    const seeded = seedDate(STAGING, '2026-06-15', ['61', '62'])
    const m = writeManifest(seeded)
    const pilot = run(
      withState(['--pilot', '--manifest', m, STAGING, '2026-06-15'])
    )
    expect(pilot.status, pilot.stderr).toBe(0)
    const again = run(['--manifest', m, STAGING, '2026-06-15'])
    expect(again.status, again.stderr).toBe(0)
    expect(again.plan.map(p => p.action)).toEqual(['done', 'copy'])
    expect(again.plan[0]!.enriched).toMatchObject({
      md5: md5(seeded[0]!.enriched),
    })
    expect(again.plan[0]!.enriched).not.toMatchObject({
      generation: seeded[0]!.E,
    })
    const rest = run(
      withState(['--execute', '--manifest', m, STAGING, '2026-06-15'])
    )
    expect(rest.status, rest.stderr).toBe(0)
    expect(rest.summary).toMatchObject({ copied: 1, done: 2 })
  })
})

describe('copy-out: --execute and --pilot', () => {
  it('copies every enriched generation out and leaves the live bytes as they were', () => {
    const seeded = [
      ...seedDate(STAGING, '2026-06-15', ['61', '62']),
      ...seedDate(STAGING, '2026-10-08', ['61']),
    ]
    const r = run(withState(['--execute', STAGING, '2026-06-15', '2026-10-08']))
    expect(r.status, r.stderr).toBe(0)
    expect(r.summary).toMatchObject({
      type: 'summary',
      mode: 'execute',
      copied: 3,
      done: 3,
      failed: 0,
      stuck: [],
      liveChanged: [],
      interrupted: false,
    })
    for (const s of seeded) {
      const dest = s.name.replace('snapshots/', 'fac-2239/')
      expect(md5(liveBytes(DEST, dest)!)).toBe(md5(s.enriched))
      expect(liveMeta(DEST, dest)).toContain('content-encoding=gzip')
      expect(md5(liveBytes(STAGING, s.name)!)).toBe(md5(s.live))
    }
    const restores = calls().filter(l => l.startsWith('storage restore '))
    expect(restores).toHaveLength(6)
    for (const l of restores) expect(l).toMatch(/ --if-generation-match=\d+$/)
    const s0 = seeded[0]!
    expect(restores).toContain(
      `storage restore gs://${STAGING}/${s0.name}#${s0.E} --if-generation-match=${s0.L}`
    )
    for (const l of calls().filter(l => l.startsWith('storage cp '))) {
      expect(l).toContain('--no-clobber')
    }
    // The CDN paths of every date touched, to invalidate afterwards.
    expect(r.cdn).toEqual({
      type: 'cdn-invalidate',
      commands: [
        "gcloud compute url-maps invalidate-cdn-cache toast-stats-cdn-staging-url-map --path='/snapshots/2026-06-15/*'",
        "gcloud compute url-maps invalidate-cdn-cache toast-stats-cdn-staging-url-map --path='/snapshots/2026-10-08/*'",
      ],
    })
  })

  it('journals each step before it runs, in the state dir, kept after exit', () => {
    const [s] = seedDate(STAGING, '2026-06-15', ['61'])
    expect(run(withState(['--execute', STAGING, '2026-06-15'])).status).toBe(0)
    const events = journal()
      .filter(j => j.name === s!.name)
      .map(j => j.event)
    expect(events).toEqual([
      'step1-begin',
      'step1-ok',
      'step2-begin',
      'step2-ok',
      'step3-begin',
      'done',
    ])
    expect(journal()[0]).toMatchObject({
      bucket: STAGING,
      e: s!.E,
      l: s!.L,
      emd5: md5(s!.enriched),
      lmd5: md5(s!.live),
    })
    expect(fs.existsSync(path.join(stateDir, 'plan.jsonl'))).toBe(true)
  })

  it('--pilot does exactly one object', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    const r = run(withState(['--pilot', STAGING, '2026-06-15']))
    expect(r.status, r.stderr).toBe(0)
    expect(r.summary).toMatchObject({ mode: 'pilot', copied: 1 })
    expect(
      liveBytes(DEST, a!.name.replace('snapshots/', 'fac-2239/'))
    ).toBeDefined()
    expect(
      liveBytes(DEST, b!.name.replace('snapshots/', 'fac-2239/'))
    ).toBeUndefined()
    expect(calls().some(l => l.includes(`${b!.name}#`))).toBe(false)
  })

  it('a rerun finds them done and writes nothing', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    expect(run(withState(['--execute', STAGING, '2026-06-15'])).status).toBe(0)
    fs.rmSync(shimLog)
    const again = run(withState(['--execute', STAGING, '2026-06-15']))
    expect(again.status, again.stderr).toBe(0)
    expect(again.plan[0]).toMatchObject({ action: 'done' })
    expect(writes()).toEqual([])
  })

  it('pauses before a batch while a data-pipeline run is in progress', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    seedDate(STAGING, '2026-10-08', ['61'])
    // Running at the first date's check, twice; clear from then on.
    fs.writeFileSync(path.join(tmp, 'gh-running'), '1\n1\n0\n')
    const r = run(withState(['--execute', STAGING, '2026-06-15', '2026-10-08']))
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toContain('paused')
    expect(r.summary).toMatchObject({ copied: 2 })
    // One check per pause plus one per date.
    const gh = fs
      .readFileSync(path.join(tmp, 'gh.log'), 'utf-8')
      .trim()
      .split('\n')
    expect(gh).toHaveLength(4)
    expect(gh[0]).toContain('--status in_progress')
  })

  it('a failed first restore stops the run, with nothing stuck', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    const r = run(
      withState(['--execute', '--parallel', '1', STAGING, '2026-06-15']),
      {
        SHIM_FAIL_MATCH: `^restore gs://${STAGING}/${a!.name.replace(/[.]/g, '[.]')}#${a!.E}`,
      }
    )
    expect(r.status).toBe(1)
    expect(r.summary).toMatchObject({ copied: 0, failed: 1, stuck: [] })
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.live))
    expect(calls().some(l => l.includes(`${b!.name}#`))).toBe(false)
  })

  it('a failed copy restores L for that object, then stops every worker', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    const r = run(
      withState(['--execute', '--parallel', '1', STAGING, '2026-06-15']),
      {
        SHIM_FAIL_MATCH: `^cp .*gs://${DEST}/fac-2239/2026-06-15/district_61[.]json`,
      }
    )
    expect(r.status).toBe(1)
    expect(r.summary).toMatchObject({ copied: 0, failed: 1, stuck: [] })
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.live))
    expect(journal().map(j => j.event)).toContain('rolled-back')
    expect(calls().some(l => l.includes(`${b!.name}#`))).toBe(false)
  })
})

describe('copy-out: kill cases (#2240 review)', () => {
  it('SIGINT mid-step 2: the in-flight object is put back, nothing new starts, the report prints', async () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    fs.writeFileSync(path.join(tmp, 'pause-cp'), '')
    const child = spawn(
      'bash',
      [
        SCRIPT,
        ...withState(['--execute', '--parallel', '1', STAGING, '2026-06-15']),
      ],
      { cwd: REPO, env: env(), detached: true }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => (stdout += d))
    child.stderr.on('data', d => (stderr += d))
    const exited = new Promise<number | null>(res => child.on('close', res))
    await waitFor(path.join(tmp, 'cp-reached'))
    // Ctrl-C: SIGINT to the whole foreground process group.
    process.kill(-child.pid!, 'SIGINT')
    await new Promise(res => setTimeout(res, 300))
    fs.writeFileSync(path.join(tmp, 'go'), '')
    const status = await exited
    const r = parse(status, stdout, stderr)
    expect(status, stderr).toBe(130)
    expect(r.summary).toMatchObject({ interrupted: true, stuck: [] })
    // The in-flight object finished its three steps: copied, L live again.
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.live))
    expect(
      md5(liveBytes(DEST, a!.name.replace('snapshots/', 'fac-2239/'))!)
    ).toBe(md5(a!.enriched))
    // The next one never started.
    expect(calls().some(l => l.includes(`${b!.name}#`))).toBe(false)
    expect(r.cdn).toBeDefined()
    expect(
      journal()
        .filter(j => j.name === a!.name)
        .at(-1)
    ).toMatchObject({
      event: 'done',
    })
  }, 30_000)

  it('a jq failure after step 1 restores L and stops every worker', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    fs.writeFileSync(path.join(tmp, 'enriched-gen'), a!.E)
    fs.writeFileSync(path.join(tmp, 'garble-after-restore'), '')
    const r = run(
      withState(['--execute', '--parallel', '1', STAGING, '2026-06-15'])
    )
    expect(fs.existsSync(path.join(tmp, 'garbled'))).toBe(true)
    expect(r.status).toBe(1)
    expect(r.summary).toMatchObject({ copied: 0, failed: 1, stuck: [] })
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.live))
    expect(
      journal()
        .filter(j => j.name === a!.name)
        .at(-1)
    ).toMatchObject({
      event: 'rolled-back',
    })
    expect(calls().some(l => l.includes(`${b!.name}#`))).toBe(false)
  })

  it('a precondition failure on restore-back is reported, never forced', () => {
    const [a] = seedDate(STAGING, '2026-06-15', ['61'])
    fs.writeFileSync(path.join(tmp, 'race-restore-back'), '')
    fs.writeFileSync(path.join(tmp, 'live-gen'), a!.L)
    fs.writeFileSync(path.join(tmp, 'race-url'), `gs://${STAGING}/${a!.name}`)
    const r = run(withState(['--execute', STAGING, '2026-06-15']))
    expect(fs.existsSync(path.join(tmp, 'raced'))).toBe(true)
    expect(r.status).toBe(1)
    // The third party's newer write stands.
    expect(liveBytes(STAGING, a!.name)!.toString()).toBe('a newer daily')
    expect(r.summary).toMatchObject({ stuck: [] })
    expect((r.summary!.liveChanged as Json[])[0]).toMatchObject({
      name: a!.name,
    })
    // One restore of L only: the failed one. No retry, no force.
    const backs = calls().filter(
      l => l.startsWith('storage restore ') && l.includes(`#${a!.L} `)
    )
    expect(backs).toHaveLength(1)
    expect(calls().some(l => l.includes('--allow-overwrite'))).toBe(false)
  })
})

describe('copy-out: --recover (#2240 R-1..R-3)', () => {
  /** A hard crash after step 1: E is live (and, as in GCS, still soft-deleted). */
  function crashAfterStep1(s: Seeded) {
    const r = spawnSync(
      'bash',
      [
        SHIM,
        'storage',
        'restore',
        `gs://${STAGING}/${s.name}#${s.E}`,
        `--if-generation-match=${s.L}`,
      ],
      { encoding: 'utf-8', env: env() }
    )
    expect(r.status, r.stderr).toBe(0)
    expect(md5(liveBytes(STAGING, s.name)!)).toBe(md5(s.enriched))
    // The arrangement is not the script's: start its call log clean.
    fs.rmSync(shimLog, { force: true })
  }

  /** The step1-begin line a worker writes before its restore. */
  function journalLine(s: Seeded, event = 'step1-begin'): string {
    return JSON.stringify({
      ts: '2026-10-24T12:00:00Z',
      run: 'crashed-run',
      bucket: STAGING,
      name: s.name,
      event,
      e: s.E,
      emd5: md5(s.enriched),
      l: s.L,
      lmd5: md5(s.live),
      r: '',
    })
  }

  function writeJournal(text: string) {
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(path.join(stateDir, 'journal.jsonl'), text)
  }

  const restoresOf = (s: Seeded) =>
    calls().filter(l => l.startsWith('storage restore ') && l.includes(s.name))

  it('restores the recorded L, by generation, over a live E, with a live precondition', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    crashAfterStep1(a!)
    const liveE = liveMeta(STAGING, a!.name).match(/generation=(\d+)/)![1]
    writeJournal(journalLine(a!) + '\n' + journalLine(b!) + '\n')
    const r = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(r.status, JSON.stringify(r.recover) + r.stderr).toBe(0)
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.live))
    expect(restoresOf(a!)).toEqual([
      `storage restore gs://${STAGING}/${a!.name}#${a!.L} --if-generation-match=${liveE}`,
    ])
    expect(r.recover.find(x => x.name === a!.name)).toMatchObject({
      action: 'restored',
    })
    // b's live is L already: never touched.
    expect(r.recover.find(x => x.name === b!.name)).toMatchObject({
      action: 'ok',
    })
    expect(restoresOf(b!)).toEqual([])
    expect(r.cdn).toBeDefined()
  })

  it('is idempotent: a second run finds nothing to do and writes nothing', () => {
    const [a] = seedDate(STAGING, '2026-06-15', ['61'])
    crashAfterStep1(a!)
    writeJournal(journalLine(a!) + '\n')
    expect(run(withState(['--recover', STAGING, '2026-06-15'])).status).toBe(0)
    const gen = liveMeta(STAGING, a!.name)
    fs.rmSync(shimLog)
    const again = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(again.status, again.stderr).toBe(0)
    expect(writes()).toEqual([])
    expect(liveMeta(STAGING, a!.name)).toBe(gen)
    expect(again.recover[0]).toMatchObject({ action: 'ok' })
    expect(again.cdn).toBeUndefined()
  })

  it('after a clean --execute it is a no-op, though every L and E stays soft-deleted', () => {
    seedDate(STAGING, '2026-06-15', ['61', '62'])
    expect(run(withState(['--execute', STAGING, '2026-06-15'])).status).toBe(0)
    fs.rmSync(shimLog)
    const r = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(r.status, r.stderr).toBe(0)
    expect(writes()).toEqual([])
    expect(r.recover.map(x => x.action)).toEqual(['ok', 'ok'])
  })

  it('refuses with no journal and no manifest, before any call', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    const r = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no journal')
    expect(calls()).toEqual([])
    // An existing but empty journal is the same.
    writeJournal('')
    expect(run(withState(['--recover', STAGING, '2026-06-15'])).status).toBe(1)
    expect(calls()).toEqual([])
  })

  it('never touches an object whose live md5 is not its E (soft-deleted presence is no evidence)', () => {
    const [a, c] = seedDate(STAGING, '2026-06-15', ['61', '63'])
    // 63: a later rebuild legitimately enriched it, larger than every
    // soft-deleted generation, and an old tiny generation is also there.
    const fresh = body(22, 'carried-forward-rebuild')
    putLive(STAGING, c!.name, fresh, '1792500000000000')
    putSoft(STAGING, c!.name, body(1, 'early-0-club'), '1771000000000000')
    writeJournal(journalLine(a!) + '\n' + journalLine(c!) + '\n')
    const r = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(r.status, r.stderr).toBe(0)
    expect(writes()).toEqual([])
    expect(md5(liveBytes(STAGING, c!.name)!)).toBe(md5(fresh))
    expect(r.recover.find(x => x.name === c!.name)).toMatchObject({
      action: 'left-alone',
    })
  })

  it('with only a manifest, a live E is reported, never guessed at', () => {
    const [a] = seedDate(STAGING, '2026-06-15', ['61'])
    crashAfterStep1(a!)
    const m = path.join(tmp, 'manifest.json')
    fs.writeFileSync(
      m,
      JSON.stringify([
        {
          bucket: STAGING,
          name: a!.name,
          generation: a!.E,
          md5: md5(a!.enriched),
        },
      ])
    )
    const r = run(
      withState(['--recover', '--manifest', m, STAGING, '2026-06-15'])
    )
    expect(r.status).toBe(1)
    expect(writes()).toEqual([])
    expect(r.recover[0]).toMatchObject({ action: 'no-recorded-l' })
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.enriched))
  })

  it('skips a torn final journal line with a warning, and still recovers', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    crashAfterStep1(a!)
    const torn = journalLine(b!, 'step2-begin').slice(0, 40)
    writeJournal(journalLine(a!) + '\n' + torn)
    const r = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/torn final journal line/)
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.live))
  })

  it('refuses a journal torn anywhere but its last line', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    crashAfterStep1(a!)
    writeJournal(journalLine(a!).slice(0, 40) + '\n' + journalLine(b!) + '\n')
    const r = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(r.status).toBe(1)
    expect(writes()).toEqual([])
  })

  it('T-1: a torn last line, then an append, then recover reads both entries', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    crashAfterStep1(a!)
    // a's entry is whole; b's was cut mid-append (no newline).
    writeJournal(
      journalLine(a!) + '\n' + journalLine(b!, 'step2-begin').slice(0, 40)
    )
    const first = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(first.status, first.stderr).toBe(0)
    // The append (recover-begin, recover-restored) did not merge into the
    // fragment: the fragment stands alone, terminated, then a marker.
    const lines = fs
      .readFileSync(path.join(stateDir, 'journal.jsonl'), 'utf-8')
      .split('\n')
    expect(lines[1]).toBe(journalLine(b!, 'step2-begin').slice(0, 40))
    expect(JSON.parse(lines[2]!)).toMatchObject({
      event: 'journal-tear-terminated',
    })
    expect(JSON.parse(lines[3]!)).toMatchObject({
      name: a!.name,
      event: 'recover-begin',
    })
    // The next recover reads a's original entry and the appended ones: a is
    // L now, so ok, and nothing is written.
    fs.rmSync(shimLog)
    const again = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(again.status, again.stderr).toBe(0)
    expect(writes()).toEqual([])
    expect(again.recover.find(x => x.name === a!.name)).toMatchObject({
      action: 'ok',
    })
    expect(md5(liveBytes(STAGING, a!.name)!)).toBe(md5(a!.live))
  })

  it('T-1: a mid-file tear refuses execute (before any write) and recover', () => {
    const [a, b] = seedDate(STAGING, '2026-06-15', ['61', '62'])
    writeJournal(journalLine(a!).slice(0, 40) + '\n' + journalLine(b!) + '\n')
    const x = run(withState(['--execute', STAGING, '2026-06-15']))
    expect(x.status).toBe(1)
    expect(x.stderr).toContain('bad line')
    expect(writes()).toEqual([])
    const p = run(withState(['--pilot', STAGING, '2026-06-15']))
    expect(p.status).toBe(1)
    expect(writes()).toEqual([])
    const r = run(withState(['--recover', STAGING, '2026-06-15']))
    expect(r.status).toBe(1)
    expect(writes()).toEqual([])
  })

  it('T-1: a journal that becomes unreadable mid-run fails the report, never exit 0', () => {
    seedDate(STAGING, '2026-06-15', ['61', '62'])
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'corrupt-journal'),
      path.join(stateDir, 'journal.jsonl')
    )
    const r = run(
      withState(['--execute', '--parallel', '1', STAGING, '2026-06-15'])
    )
    expect(fs.existsSync(path.join(tmp, 'corrupted'))).toBe(true)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('journal')
    expect(r.summary).toMatchObject({ journalReadable: false })
  })
})

describe('copy-out: one run at a time (#2240 R-4)', () => {
  const lockDir = () => path.join(tmp, 'lock')

  it('refuses execute, pilot and recover while another run holds the lock', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    fs.mkdirSync(lockDir())
    fs.writeFileSync(
      path.join(lockDir(), 'owner'),
      `pid=${process.pid} run=other host=${os.hostname()}\n`
    )
    for (const mode of ['--execute', '--pilot', '--recover']) {
      const r = run(withState([mode, STAGING, '2026-06-15']))
      expect(r.status, mode).toBe(1)
      expect(r.stderr).toContain('held by')
    }
    expect(calls()).toEqual([])
  })

  it('names a stale lock (its pid is gone) and still refuses', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    fs.mkdirSync(lockDir())
    fs.writeFileSync(
      path.join(lockDir(), 'owner'),
      `pid=999999 run=crashed host=${os.hostname()}\n`
    )
    const r = run(withState(['--execute', STAGING, '2026-06-15']))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('stale')
    expect(r.stderr).toContain(lockDir())
    expect(calls()).toEqual([])
  })

  it('takes the lock for a run and releases it on exit; a dry run takes none', () => {
    seedDate(STAGING, '2026-06-15', ['61'])
    expect(run(withState(['--pilot', STAGING, '2026-06-15'])).status).toBe(0)
    expect(fs.existsSync(lockDir())).toBe(false)
    fs.mkdirSync(lockDir())
    expect(run([STAGING, '2026-06-15']).status).toBe(0)
  })
})

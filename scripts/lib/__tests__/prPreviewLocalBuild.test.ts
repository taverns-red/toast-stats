/**
 * Workflow contract: PR Preview's smoke shards test a local build; what
 * measures the wire stays on the deployed channel (#2544).
 *
 * In October 2026, 275 of the 282 GiB Firebase Hosting served went to the
 * `pr-*` preview channels, because every Playwright shard and every
 * Lighthouse route loaded the app from the deployed channel. The shards and
 * Lighthouse now load the SAME build (the preview job's `frontend/dist`,
 * handed over as an artifact) from a server inside the runner: the Firebase
 * Hosting emulator on firebase.json's `staging` target, so the headers,
 * rewrites and clean URLs are the channel's, behind
 * scripts/preview-local-server.mjs, which compresses like Hosting (brotli
 * quality 11) so the Lighthouse byte budgets measure the same bytes.
 *
 * Three things stay on the deployed channel and gate the verdict:
 *   - Lighthouse mobile: Lantern models the transport, and the local server
 *     is HTTP/1.1 where Hosting is h2/h3, so LCP read 15-25% high locally
 *     (run 42494094590);
 *   - the one test that measures wire bytes, header compression included
 *     (district-survival's "fixed wire cost"): the shards skip it by title
 *     and the real-preview job runs it, in both engines;
 *   - e2e/staging.smoke.ts, so a Hosting- or deploy-only breakage still
 *     fails the run.
 * Sourced from the YAML so the contract cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const ROOT = process.cwd()
const FILE = path.join(ROOT, '.github/workflows/pr-preview.yml')
const PREVIEW_URL = '${{ needs.preview.outputs.url }}'
const LOCAL_URL = 'http://127.0.0.1:4173'
const ARTIFACT = 'preview-dist-${{ github.run_id }}-${{ github.run_attempt }}'
// Downloaded by id, not name: "Re-run failed jobs" re-runs a shard as attempt
// N+1 without re-running `preview`, so a name built from run_attempt would
// not exist. The id is the preview job's output, the same on every attempt.
const ARTIFACT_ID = '${{ needs.preview.outputs.dist-artifact-id }}'
const HEAVY_IF = "needs.preview.outputs.heavy == 'true'"
const WIRE_SPEC = 'frontend/e2e/district-survival.smoke.ts'

interface Step {
  id?: string
  name?: string
  uses?: string
  run?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}
interface Job {
  name?: string
  outputs?: Record<string, string>
  needs?: string | string[]
  if?: string
  env?: Record<string, string>
  steps?: Step[]
}

const wf = parse(fs.readFileSync(FILE, 'utf-8')) as {
  jobs: Record<string, Job>
}
const jobs = wf.jobs
const steps = (id: string): Step[] => jobs[id]?.steps ?? []
const indexOf = (id: string, pred: (s: Step) => boolean): number =>
  steps(id).findIndex(pred)

/** Every env value a job sees: its own and each step's. */
const envValues = (job: Job): string[] => [
  ...Object.values(job.env ?? {}),
  ...(job.steps ?? []).flatMap(s => Object.values(s.env ?? {})),
]

/** By id (re-run safe), unpacked straight into frontend/dist. */
function expectDownloadsById(step: Step | undefined): void {
  expect(step?.with?.['artifact-ids']).toBe(ARTIFACT_ID)
  expect(step?.with?.['name']).toBeUndefined()
  expect(step?.with?.['path']).toBe('frontend/dist')
  expect(step?.with?.['merge-multiple']).toBe(true)
}

const isDownload = (s: Step) =>
  (s.uses ?? '').startsWith('actions/download-artifact@')
const isServe = (s: Step) =>
  /scripts\/serve-preview-locally\.sh/.test(s.run ?? '')
const isPlaywright = (s: Step) => /playwright test/.test(s.run ?? '')
const isLighthouse = (s: Step) =>
  (s.uses ?? '').startsWith('treosh/lighthouse-ci-action')

describe('the preview job hands its build to the test jobs (#2544)', () => {
  const build = indexOf('preview', s => s.name === 'Build frontend')
  const upload = indexOf('preview', s =>
    (s.uses ?? '').startsWith('actions/upload-artifact@')
  )
  const deploy = indexOf('preview', s => s.id === 'deploy')

  it('uploads frontend/dist after the build and before the deploy', () => {
    expect(upload).toBeGreaterThan(build)
    expect(upload).toBeLessThan(deploy)
    const up = steps('preview')[upload]
    expect(up?.with?.['name']).toBe(ARTIFACT)
    expect(up?.id).toBe('dist')
    expect(jobs['preview']?.outputs?.['dist-artifact-id']).toBe(
      '${{ steps.dist.outputs.artifact-id }}'
    )
    expect(up?.with?.['path']).toBe('frontend/dist')
    expect(up?.with?.['if-no-files-found']).toBe('error')
  })
})

describe('the smoke shards run on the local build (#2544)', () => {
  const job = jobs['smoke'] as Job

  it('downloads the same build, then serves it, then tests it', () => {
    const download = indexOf('smoke', isDownload)
    const serve = indexOf('smoke', isServe)
    const test = indexOf('smoke', isPlaywright)
    expect(download).toBeGreaterThan(-1)
    expectDownloadsById(steps('smoke')[download])
    expect(serve).toBeGreaterThan(download)
    expect(test).toBeGreaterThan(serve)
  })

  it('points the tests at the local server, never the channel', () => {
    expect(envValues(job)).not.toContain(PREVIEW_URL)
    expect(job.env?.['BASE_URL']).toBe(LOCAL_URL)
  })

  it('skips only the wire-cost test, which runs on the channel', () => {
    const run = steps('smoke').find(isPlaywright)?.run ?? ''
    expect(run).toMatch(/--grep-invert "\$PREVIEW_ONLY_GREP"/)
  })
})

describe('the wire-cost test is named by one pattern (#2544)', () => {
  const pattern = String(
    (wf as { env?: Record<string, string> }).env?.['PREVIEW_ONLY_GREP'] ?? ''
  )
  const titles = fs
    .readdirSync(path.join(ROOT, 'frontend/e2e'))
    .filter(f => f.endsWith('.smoke.ts'))
    .flatMap(f =>
      [
        ...fs
          .readFileSync(path.join(ROOT, 'frontend/e2e', f), 'utf-8')
          .matchAll(/\btest\(\s*['`"](.+?)['`"],/g),
      ].map(m => `${f}: ${m[1]}`)
    )

  it('matches exactly the district-survival wire-cost test', () => {
    expect(pattern).not.toBe('')
    const hits = titles.filter(t => new RegExp(pattern).test(t))
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatch(/^district-survival\.smoke\.ts: .*wire cost/)
    expect(fs.existsSync(path.join(ROOT, WIRE_SPEC))).toBe(true)
  })
})

describe('Lighthouse stays on the deployed channel (#2544)', () => {
  it('points LHCI at the channel URL and serves nothing locally', () => {
    const lh = steps('lighthouse').find(isLighthouse)
    expect(lh?.env?.['LHCI_BASE_URL']).toBe(PREVIEW_URL)
    expect(steps('lighthouse').some(isDownload)).toBe(false)
    expect(steps('lighthouse').some(isServe)).toBe(false)
  })
})

describe('the local server is Hosting on firebase.json (#2544)', () => {
  const serveFile = path.join(ROOT, 'scripts/serve-preview-locally.sh')
  const script = fs.existsSync(serveFile)
    ? fs.readFileSync(serveFile, 'utf-8')
    : ''
  const firebase = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf-8')
  ) as { emulators?: { hosting?: { host?: string; port?: number } } }

  it("runs the Hosting emulator on the staging target's own config", () => {
    expect(script).toMatch(/firebase emulators:start --only hosting:staging/)
    expect(script).not.toMatch(/--config/)
  })

  it('fronts it with the Hosting-compression proxy on the URL the jobs use', () => {
    expect(script).toMatch(/scripts\/preview-local-server\.mjs/)
    const { host, port } = firebase.emulators?.hosting ?? {}
    expect(script).toContain(`UPSTREAM=http://${host}:${port}`)
    expect(script).toContain(`PORT=${new URL(LOCAL_URL).port}`)
  })
})

describe('what runs on the deployed channel (#2544)', () => {
  const onChannel = Object.entries(jobs).filter(
    ([id, job]) =>
      id !== 'verdict' &&
      envValues(job).includes(PREVIEW_URL) &&
      (job.steps ?? []).some(s => isPlaywright(s) || isLighthouse(s))
  )

  it('is Lighthouse and the real-preview smoke, nothing else', () => {
    expect(onChannel.map(([id]) => id).sort()).toEqual([
      'lighthouse',
      'preview-smoke',
    ])
  })

  const job = jobs['preview-smoke'] as Job

  it('runs the deployed-site smoke against the channel URL', () => {
    expect(job.env?.['BASE_URL']).toBe(PREVIEW_URL)
    expect(job.needs).toBe('preview')
    expect(job.if).toBe(HEAVY_IF)
    const runs = steps('preview-smoke')
      .filter(isPlaywright)
      .map(s => s.run ?? '')
    expect(runs.join('\n')).toMatch(
      /playwright test --config playwright\.config\.ts e2e\/staging\.smoke\.ts/
    )
  })

  it('runs the wire-cost test there, in both engines', () => {
    const wire = steps('preview-smoke')
      .filter(isPlaywright)
      .map(s => s.run ?? '')
      .find(r => r.includes('e2e/district-survival.smoke.ts'))
    expect(wire).toMatch(/--grep "\$PREVIEW_ONLY_GREP"/)
    expect(wire).not.toMatch(/--project/)
  })

  it('serves nothing locally', () => {
    expect(steps('preview-smoke').some(isServe)).toBe(false)
  })

  it('checks every built file is deployed, before the smokes', () => {
    // staging.smoke.ts loads a few routes; a chunk, font or glyph missing
    // from the deploy (that the SPA rewrite answers with index.html) would
    // pass it. The check HEADs every file of the same build on the channel.
    const download = indexOf('preview-smoke', isDownload)
    const check = indexOf('preview-smoke', s =>
      /node scripts\/check-deployed-files\.mjs/.test(s.run ?? '')
    )
    const firstSmoke = indexOf('preview-smoke', isPlaywright)
    expectDownloadsById(steps('preview-smoke')[download])
    expect(check).toBeGreaterThan(download)
    expect(check).toBeLessThan(firstSmoke)
    expect(jobs['preview-smoke']?.env?.['BASE_URL']).toBe(PREVIEW_URL)
  })

  it('gates the verdict like the shards and Lighthouse', () => {
    expect(jobs['verdict']?.needs).toEqual(
      expect.arrayContaining(['smoke', 'lighthouse', 'preview-smoke'])
    )
    const verdict = steps('verdict').find(s => s.name === 'Verdict')
    expect(verdict?.env?.['PREVIEW_SMOKE']).toBe(
      '${{ needs.preview-smoke.result }}'
    )
    expect(verdict?.run).toMatch(/"\$PREVIEW_SMOKE" != "success"/)
    expect(verdict?.run).toMatch(/"\$PREVIEW_SMOKE" != "skipped"/)
  })
})

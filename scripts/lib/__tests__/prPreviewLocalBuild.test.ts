/**
 * Workflow contract: PR Preview tests a local build, plus one real-preview
 * smoke (#2544).
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
 * Exactly one job still drives the deployed channel, so a Hosting- or
 * deploy-only breakage still fails the run, and it gates the verdict like
 * every shard. Sourced from the YAML so the contract cannot drift.
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
const HEAVY_IF = "needs.preview.outputs.heavy == 'true'"

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
    expect(up?.with?.['path']).toBe('frontend/dist')
    expect(up?.with?.['if-no-files-found']).toBe('error')
  })
})

describe.each([
  ['smoke', isPlaywright],
  ['lighthouse', isLighthouse],
] as const)('the %s job runs on the local build (#2544)', (id, isTest) => {
  const job = jobs[id] as Job

  it('downloads the same build, then serves it, then tests it', () => {
    const download = indexOf(id, isDownload)
    const serve = indexOf(id, isServe)
    const test = indexOf(id, isTest)
    expect(download).toBeGreaterThan(-1)
    expect(steps(id)[download]?.with?.['name']).toBe(ARTIFACT)
    expect(steps(id)[download]?.with?.['path']).toBe('frontend/dist')
    expect(serve).toBeGreaterThan(download)
    expect(test).toBeGreaterThan(serve)
  })

  it('points the tests at the local server, never the channel', () => {
    expect(envValues(job)).not.toContain(PREVIEW_URL)
    const target =
      id === 'smoke'
        ? job.env?.['BASE_URL']
        : steps(id).find(isLighthouse)?.env?.['LHCI_BASE_URL']
    expect(target).toBe(LOCAL_URL)
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

describe('exactly one job drives the deployed channel (#2544)', () => {
  const onChannel = Object.entries(jobs).filter(
    ([id, job]) =>
      id !== 'verdict' &&
      envValues(job).includes(PREVIEW_URL) &&
      (job.steps ?? []).some(s => isPlaywright(s) || isLighthouse(s))
  )

  it('is the real-preview smoke', () => {
    expect(onChannel.map(([id]) => id)).toEqual(['preview-smoke'])
  })

  const job = jobs['preview-smoke'] as Job

  it('runs the deployed-site smoke against the channel URL', () => {
    expect(job.env?.['BASE_URL']).toBe(PREVIEW_URL)
    expect(job.needs).toBe('preview')
    expect(job.if).toBe(HEAVY_IF)
    const run = steps('preview-smoke').find(isPlaywright)?.run ?? ''
    expect(run).toMatch(
      /playwright test --config playwright\.config\.ts e2e\/staging\.smoke\.ts/
    )
  })

  it('needs no build and no local server of its own', () => {
    expect(steps('preview-smoke').some(isDownload)).toBe(false)
    expect(steps('preview-smoke').some(isServe)).toBe(false)
  })

  it('gates the verdict like the shards and Lighthouse', () => {
    expect(jobs['verdict']?.needs).toContain('preview-smoke')
    const verdict = steps('verdict').find(s => s.name === 'Verdict')
    expect(verdict?.env?.['PREVIEW_SMOKE']).toBe(
      '${{ needs.preview-smoke.result }}'
    )
    expect(verdict?.run).toMatch(/"\$PREVIEW_SMOKE" != "success"/)
    expect(verdict?.run).toMatch(/"\$PREVIEW_SMOKE" != "skipped"/)
  })
})

/**
 * Workflow contract: the video jobs install ffmpeg without apt (#2339).
 *
 * On 2026-10-26 the Ubuntu apt mirror (azure.archive.ubuntu.com) crawled at
 * ~120 kB/s and the video jobs hit their timeouts three times in
 * `apt-get install ffmpeg`; Playwright's `--with-deps` stalled on the same
 * mirror. Both video workflows now take a pinned static ffmpeg build
 * (BtbN/FFmpeg-Builds, a month-end autobuild, which BtbN keeps long-term)
 * over HTTPS, verified by SHA-256, and Playwright installs Chromium without
 * `--with-deps` (the runner image already has its libraries).
 *
 * The guard:
 * - no step in either workflow calls apt / apt-get or `--with-deps`;
 * - each job installs ffmpeg in its own short-timeout step, before any step
 *   that runs ffmpeg or ffprobe;
 * - the download is an exact BtbN release asset (never `latest`), checked
 *   with `sha256sum -c` against a 64-hex hash, and both workflows pin the
 *   same asset and hash;
 * - the step checks ffprobe, libx264, the aac encoder and ebur128, which
 *   the render, the encoding verify and the LUFS tests depend on.
 * Sourced from the YAML so the guard cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

interface Step {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
  'timeout-minutes'?: number
}
interface Job {
  'timeout-minutes'?: number
  steps: Step[]
}
interface Workflow {
  jobs: Record<string, Job>
}

const WORKFLOWS = ['videos.yml', 'videos-publish.yml'] as const

const load = (file: string) => {
  const full = path.resolve(process.cwd(), '.github/workflows', file)
  const raw = fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : ''
  return { raw, wf: (raw ? parse(raw) : { jobs: {} }) as Workflow }
}

/** The job that runs ffmpeg or ffprobe (render / publish). */
const ffmpegJob = (wf: Workflow) =>
  Object.values(wf.jobs).find(j =>
    j.steps.some(s =>
      /\b(test:audio|videos:(build|verify|music))\b/.test(s.run ?? '')
    )
  )

const USES_FFMPEG =
  /\b(test:audio|videos:(build|verify|music))\b|\bffprobe\b|\bffmpeg\b/
const ASSET =
  /https:\/\/github\.com\/BtbN\/FFmpeg-Builds\/releases\/download\/(autobuild-\d{4}-\d{2}-\d{2}-\d{2}-\d{2})\/(ffmpeg-[A-Za-z0-9.-]+-linux64-gpl-[0-9.]+\.tar\.xz)/

const installStep = (job: Job | undefined) =>
  job?.steps.find(s => s.name === 'Install ffmpeg (pinned static build)')

/** The pinned asset URL and hash of a workflow's install step. */
const pin = (file: string) => {
  const step = installStep(ffmpegJob(load(file).wf))
  const run = step?.run ?? ''
  const url = run.match(ASSET)
  const sha = run.match(/\b[0-9a-f]{64}\b/)
  return { url: url?.[0], tag: url?.[1], sha: sha?.[0] }
}

describe.each(WORKFLOWS)('%s installs ffmpeg without apt (#2339)', file => {
  const { raw, wf } = load(file)
  const job = ffmpegJob(wf)
  const steps = job?.steps ?? []
  const step = installStep(job)

  it('has a job that runs ffmpeg', () => {
    expect(raw).not.toBe('')
    expect(job).toBeDefined()
  })

  it('never uses apt or Playwright --with-deps', () => {
    for (const s of Object.values(wf.jobs).flatMap(j => j.steps)) {
      expect(s.run ?? '', s.name).not.toMatch(/\bapt(-get)?\b/)
      expect(s.run ?? '', s.name).not.toMatch(/--with-deps/)
    }
  })

  it('installs ffmpeg in its own short-timeout step before any ffmpeg use', () => {
    expect(step).toBeDefined()
    expect(step!['timeout-minutes']).toBeGreaterThan(0)
    expect(step!['timeout-minutes']).toBeLessThanOrEqual(5)
    const at = steps.indexOf(step!)
    const firstUse = steps.findIndex(
      s => s !== step && USES_FFMPEG.test(`${s.name ?? ''}\n${s.run ?? ''}`)
    )
    expect(firstUse).toBeGreaterThan(at)
  })

  it('downloads an exact BtbN release asset over HTTPS and checks its SHA-256', () => {
    const run = step?.run ?? ''
    expect(run).toMatch(/set -euo pipefail/)
    expect(run).toMatch(ASSET)
    expect(run).not.toMatch(/releases\/(download\/)?latest/)
    expect(run).toMatch(/curl -fsSL/)
    expect(run).toMatch(/\b[0-9a-f]{64}\b/)
    expect(run).toMatch(/sha256sum -c/)
    expect(run).toMatch(/GITHUB_PATH/)
  })

  it('checks ffprobe, libx264, the aac encoder and ebur128', () => {
    const run = step?.run ?? ''
    expect(run).toMatch(/ffprobe -version/)
    expect(run).toMatch(/libx264/)
    expect(run).toMatch(/\baac\b/)
    expect(run).toMatch(/ebur128/)
  })
})

describe('the ffmpeg pin (#2339)', () => {
  it('is the same asset and hash in both video workflows', () => {
    const [a, b] = WORKFLOWS.map(pin)
    expect(a!.url).toBeDefined()
    expect(a!.sha).toBeDefined()
    expect(b).toEqual(a)
  })
})

describe('videos.yml Playwright install (#2339)', () => {
  const { wf } = load('videos.yml')
  const steps = ffmpegJob(wf)?.steps ?? []

  it('installs Chromium in its own short-timeout step without apt', () => {
    const step = steps.find(s => /playwright install/.test(s.run ?? ''))
    expect(step).toBeDefined()
    expect(step!.run).toMatch(/playwright install chromium/)
    expect(step!['timeout-minutes']).toBeGreaterThan(0)
    expect(step!['timeout-minutes']).toBeLessThanOrEqual(5)
  })
})

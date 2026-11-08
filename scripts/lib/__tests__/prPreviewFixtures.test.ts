/**
 * Workflow contract: the PR Preview shards read run-scoped CDN fixtures, not
 * live cdn-staging (#2545).
 *
 * The preview build reads cdn-staging, and staging was 73% of the project's
 * CDN cache lookups, mostly previews and CI. So the preview job records what
 * the shards read ONCE per run (scripts/refresh-smoke-fixtures.ts, which also
 * schema-checks it) and hands it to every shard as an artifact; the shards
 * answer the CDN from it (frontend/e2e/helpers/cdnFixtures.ts) and fail on a
 * miss or on any request that reaches cdn-staging.
 *
 * One check stays live: e2e/staging.smoke.ts on the deployed channel (and the
 * wire-cost test), which get no fixture. Sourced from the YAML so the
 * contract cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const ROOT = process.cwd()
const FILE = path.join(ROOT, '.github/workflows/pr-preview.yml')
const FIXTURES_DIR = '${{ runner.temp }}/smoke-fixtures'
const FIXTURES_ID = '${{ needs.preview.outputs.fixtures-artifact-id }}'

interface Step {
  id?: string
  name?: string
  uses?: string
  if?: string
  run?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}
interface Job {
  outputs?: Record<string, string>
  env?: Record<string, string>
  steps?: Step[]
}

const raw = fs.readFileSync(FILE, 'utf-8')
const wf = parse(raw) as {
  on: { pull_request: { paths: string[] } }
  jobs: Record<string, Job>
}
const steps = (id: string): Step[] => wf.jobs[id]?.steps ?? []
const idx = (id: string, pred: (s: Step) => boolean): number =>
  steps(id).findIndex(pred)

const isRefresh = (s: Step) =>
  /npx tsx scripts\/refresh-smoke-fixtures\.ts/.test(s.run ?? '')
const isUpload = (s: Step) =>
  (s.uses ?? '').startsWith('actions/upload-artifact@')
const isDownload = (s: Step) =>
  (s.uses ?? '').startsWith('actions/download-artifact@')
const isPlaywright = (s: Step) => /playwright test/.test(s.run ?? '')

describe('the preview job records the fixtures once per run (#2545)', () => {
  const deploy = idx('preview', s => s.id === 'deploy')
  const refresh = idx('preview', isRefresh)
  const upload = idx('preview', s => s.id === 'fixtures')

  it('refreshes after the deploy, so a staging drift never costs the channel', () => {
    expect(refresh).toBeGreaterThan(deploy)
    expect(upload).toBeGreaterThan(refresh)
  })

  it('runs only on a run that will run the shards', () => {
    expect(steps('preview')[refresh]?.if).toBe("env.HEAVY_SMOKE == 'true'")
    expect(steps('preview')[upload]?.if).toBe("env.HEAVY_SMOKE == 'true'")
  })

  it('writes outside the checkout and uploads that directory, by id', () => {
    expect(steps('preview')[refresh]?.run).toContain(
      '--out "$RUNNER_TEMP/smoke-fixtures"'
    )
    const up = steps('preview')[upload]
    expect(isUpload(up as Step)).toBe(true)
    expect(up?.with?.['path']).toBe(FIXTURES_DIR)
    expect(up?.with?.['if-no-files-found']).toBe('error')
    expect(wf.jobs['preview']?.outputs?.['fixtures-artifact-id']).toBe(
      '${{ steps.fixtures.outputs.artifact-id }}'
    )
  })
})

describe('the smoke shards read the fixtures (#2545)', () => {
  const download = idx(
    'smoke',
    s => isDownload(s) && s.with?.['path'] === FIXTURES_DIR
  )
  const test = idx('smoke', isPlaywright)

  it('downloads them by id (re-run safe) before the tests', () => {
    expect(download).toBeGreaterThan(-1)
    const step = steps('smoke')[download]
    expect(step?.with?.['artifact-ids']).toBe(FIXTURES_ID)
    expect(step?.with?.['merge-multiple']).toBe(true)
    expect(download).toBeLessThan(test)
  })

  it('points the tests at the directory, on the Playwright step only', () => {
    expect(steps('smoke')[test]?.env?.['SMOKE_FIXTURES_DIR']).toBe(FIXTURES_DIR)
    expect(wf.jobs['smoke']?.env?.['SMOKE_FIXTURES_DIR']).toBeUndefined()
  })
})

describe('the live checks get no fixture (#2545)', () => {
  it('keeps staging.smoke and the wire-cost test on the real channel, live', () => {
    const job = wf.jobs['preview-smoke'] as Job
    const text = JSON.stringify(job)
    expect(text).not.toContain('SMOKE_FIXTURES')
    expect(text).not.toContain('smoke-fixtures')
    expect(text).toContain('e2e/staging.smoke.ts')
  })

  it('does not hand the fixtures to Lighthouse either', () => {
    expect(JSON.stringify(wf.jobs['lighthouse'])).not.toContain(
      'smoke-fixtures'
    )
  })
})

describe('what changes the fixtures re-runs the preview (#2545)', () => {
  it.each([
    'scripts/refresh-smoke-fixtures.ts',
    'scripts/lib/smokeFixtures.ts',
    'scripts/smoke-fixtures.manifest.json',
  ])('lists %s in the path filter', file => {
    expect(wf.on.pull_request.paths).toContain(file)
  })
})

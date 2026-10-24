/**
 * The read-only staging canary for the gcloud shim (#1768, ADR-015 D10).
 *
 * The harness proves the pipeline against `gcloud-shim/gcloud`. The shim is
 * only as good as its model of the real CLI, so a small CI job runs the real
 * gcloud (the 588 pin) against the STAGING bucket and checks the behaviour
 * the shim models: a one-level `ls`, the error texts, `objects describe`
 * and `objects list` keys, and one gzip layer inflated by `cat` and by a
 * download (SHIM_DOWNLOAD_DECOMPRESS=1).
 *
 * These tests are the job's safety contract: every gcloud command it runs is
 * a read, it never names production, and its credential is a token scoped
 * to devstorage.read_only, so a write would be refused even if one slipped in.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  gcloudInvocations,
  writeViolations,
  STAGING_BUCKET,
  PROD_BUCKET,
} from '../stagingCanaryGuard.js'
import { CI_CHECKS, DOCS_CHECK, GATE_CHECK } from '../ciGate.js'

const REPO = path.resolve(__dirname, '../../..')
const WORKFLOW = '.github/workflows/harness-staging-canary.yml'
const SCRIPT = 'scripts/harness/staging-canary.sh'
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf-8')

interface Step {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, string>
  env?: Record<string, string>
}
interface Workflow {
  on: Record<string, { paths?: string[] } | Array<{ cron: string }> | null>
  permissions: Record<string, string>
  jobs: Record<
    string,
    {
      name: string
      if?: string
      steps: Step[]
      'timeout-minutes'?: number
      'continue-on-error'?: boolean
    }
  >
}

describe('writeViolations — the read-only scanner', () => {
  it('passes the reads the canary needs', () => {
    const ok = [
      'gcloud version',
      'gcloud storage ls "${BUCKET}/time-series/"',
      'gcloud storage cat "${OBJ}" >"${TMP}/cat.json"',
      'gcloud storage objects describe "${OBJ}" --format=json',
      'gcloud storage objects list "${OBJ}" --format=json',
      'gcloud storage cp "${OBJ}" "${TMP}/download.json"',
    ].join('\n')
    expect(gcloudInvocations(ok)).toHaveLength(6)
    expect(writeViolations(ok)).toEqual([])
  })

  // Sentinel (Lesson 082): the rule must fire on known-bad text.
  it.each([
    ['an upload', 'gcloud storage cp "${TMP}/x.json" "${BUCKET}/x.json"'],
    ['an upload to a literal URL', 'gcloud storage cp a.json gs://b/a.json'],
    ['a bucket-to-bucket copy', 'gcloud storage cp "${OBJ}" "${OBJ}.bak"'],
    ['an rsync', 'gcloud storage rsync -r ./cache "${BUCKET}/cache"'],
    ['a delete', 'gcloud storage rm "${OBJ}"'],
    ['a move', 'gcloud storage mv "${OBJ}" "${OBJ}2"'],
    ['a metadata update', 'gcloud storage objects update "${OBJ}" --x'],
    ['a restore', 'gcloud storage restore "${OBJ}#1"'],
    ['a bucket update', 'gcloud storage buckets update gs://b --x'],
    ['gsutil', 'gsutil cat gs://b/o'],
    ['a recursive copy', 'gcloud storage cp -r "${BUCKET}/v1" ./v1'],
  ])('flags %s', (_label, line) => {
    expect(writeViolations(line)).not.toEqual([])
  })

  it('ignores comments', () => {
    expect(writeViolations('# never: gcloud storage rm "${OBJ}"')).toEqual([])
  })
})

describe('the staging canary job (#1768, D10)', () => {
  const wf = parse(read(WORKFLOW)) as Workflow
  const jobs = Object.values(wf.jobs)
  const job = jobs[0]!
  const runs = job.steps.map(s => s.run ?? '').join('\n')
  const script = read(SCRIPT)

  it('is one bounded job', () => {
    expect(jobs).toHaveLength(1)
    expect(job['timeout-minutes']).toBeLessThanOrEqual(10)
  })

  it('every gcloud command in the job and its script is a read', () => {
    expect(gcloudInvocations(script).length).toBeGreaterThanOrEqual(5)
    expect(writeViolations(runs)).toEqual([])
    expect(writeViolations(script)).toEqual([])
  })

  it('runs the canary script', () => {
    expect(runs).toContain(`bash ${SCRIPT}`)
  })

  it('reads staging only and never names production', () => {
    for (const text of [read(WORKFLOW), script]) {
      expect(text).not.toContain(PROD_BUCKET)
      expect(text).not.toMatch(/cdn\.taverns\.red/)
      for (const m of text.matchAll(/gs:\/\/([a-z0-9._-]+)/g)) {
        expect(m[1]).toBe(STAGING_BUCKET)
      }
    }
    expect(script).toContain(`gs://${STAGING_BUCKET}`)
  })

  it('authenticates with a token scoped to devstorage.read_only, and nothing else', () => {
    const auth = job.steps.filter(s =>
      s.uses?.startsWith('google-github-actions/auth@')
    )
    expect(auth).toHaveLength(1)
    expect(auth[0]!.with).toMatchObject({
      token_format: 'access_token',
      access_token_scopes:
        'https://www.googleapis.com/auth/devstorage.read_only',
      create_credentials_file: false,
    })
    // gcloud reads that token and no credentials file.
    const canary = job.steps.find(s => s.run?.includes(`bash ${SCRIPT}`))!
    expect(canary.env?.CLOUDSDK_AUTH_ACCESS_TOKEN_FILE).toBeTruthy()
    expect(read(WORKFLOW)).not.toMatch(
      /credentials_json|GOOGLE_APPLICATION_CREDENTIALS/
    )
  })

  it('pins the gcloud version the pipeline runs', () => {
    const setup = job.steps.find(s =>
      s.uses?.startsWith('google-github-actions/setup-gcloud@')
    )
    const pipeline = read('.github/workflows/data-pipeline.yml')
    const pinned = pipeline.match(/version: '(\d+\.\d+\.\d+)'/)![1]
    expect(setup?.with?.version).toBe(pinned)
  })

  it('runs on shim or harness changes and weekly, never on every PR or on push', () => {
    const pr = wf.on.pull_request as { paths?: string[] }
    expect(pr.paths).toEqual(
      expect.arrayContaining([
        WORKFLOW,
        SCRIPT,
        'scripts/lib/__tests__/fixtures/gcloud-shim/**',
        'scripts/lib/pipelineHarness.ts',
      ])
    )
    expect(pr.paths).not.toContain('**')
    expect(wf.on.schedule).toEqual([
      expect.objectContaining({ cron: expect.any(String) }),
    ])
    expect(wf.on.push).toBeUndefined()
  })

  it('skips fork PRs, which get no credentials', () => {
    expect(job.if).toMatch(/head\.repo\.full_name == github\.repository/)
  })

  it('is advisory: CI Gate does not expect it', () => {
    const gated: string[] = [...CI_CHECKS, DOCS_CHECK, GATE_CHECK]
    expect(gated).not.toContain(job.name)
    expect(read('scripts/lib/ciGate.ts')).not.toContain(job.name)
  })

  it('may mint an OIDC token and read the repo, nothing more', () => {
    expect(wf.permissions).toEqual({ contents: 'read', 'id-token': 'write' })
  })
})

/**
 * Workflow guard: the value gate fetches only hash-differing dates (#1730,
 * plan E2-4).
 *
 * The step used to download every overlap date from both buckets (~410
 * `gcloud storage cp` per run). It now lists both buckets once, asks
 * `collector-cli value-diff-plan` which dates differ, downloads only those,
 * and hands the rest to `value-diff --hash-equal-dates` so the report and
 * verdict are unchanged. Every failure in the planning glue must fall back to
 * fetching every overlap date. Sourced from the workflow YAML so the glue
 * cannot drift.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)
const CLI_PATH = path.resolve(
  process.cwd(),
  'packages/collector-cli/src/cli.ts'
)

interface Step {
  id?: string
  run?: string
}

function valueDiffRun(): string {
  const doc = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
    jobs: Record<string, { steps?: Step[] }>
  }
  const step = Object.values(doc.jobs)
    .flatMap(job => job.steps ?? [])
    .find(s => s.id === 'valuediff')
  if (!step?.run) throw new Error('value-diff step (id: valuediff) not found')
  return step.run
}

describe('data-pipeline value gate — hash-scoped fetch (#1730)', () => {
  const run = valueDiffRun()

  it('lists both buckets once with the recorded JSON listing call', () => {
    for (const bucket of ['GCS_BUCKET', 'GCS_BUCKET_PRODUCTION']) {
      expect(run).toContain(
        `gcloud storage objects list "gs://\${${bucket}}/snapshots/*/all-districts-rankings.json" --format=json`
      )
    }
  })

  it('discards a listing whose gcloud call failed (the plan then full-fetches)', () => {
    expect(run).toMatch(
      /--format=json\s*\\?\s*>\s*\/tmp\/vd-staging-listing\.json[^\n]*\|\| rm -f \/tmp\/vd-staging-listing\.json/
    )
    expect(run).toMatch(
      /--format=json\s*\\?\s*>\s*\/tmp\/vd-prod-listing\.json[^\n]*\|\| rm -f \/tmp\/vd-prod-listing\.json/
    )
  })

  it('plans with collector-cli value-diff-plan over the overlap dates', () => {
    expect(run).toMatch(
      /npx collector-cli value-diff-plan\s*\\\s*--overlap-dates \/tmp\/overlap-dates\.txt\s*\\\s*--staging-listing \/tmp\/vd-staging-listing\.json\s*\\\s*--prod-listing \/tmp\/vd-prod-listing\.json/
    )
  })

  it('falls back to fetching every overlap date when the plan is unusable', () => {
    expect(run).toContain('cp /tmp/overlap-dates.txt /tmp/vd-fetch-dates.txt')
    expect(run).toContain(': > /tmp/vd-hash-equal-dates.txt')
  })

  it('downloads only the planned dates', () => {
    // The xargs download loop's input (OVERLAP_COUNT still reads the overlap).
    expect(run).toContain(
      '"${GCS_BUCKET_PRODUCTION}" < /tmp/vd-fetch-dates.txt'
    )
    expect(run).not.toContain(
      '"${GCS_BUCKET_PRODUCTION}" < /tmp/overlap-dates.txt'
    )
  })

  it('passes the skipped dates to value-diff so they count as unchanged', () => {
    expect(run).toMatch(
      /npx collector-cli value-diff \\\s*--staging-dir \/tmp\/vd\/staging \\\s*--prod-dir \/tmp\/vd\/prod \\\s*--hash-equal-dates \/tmp\/vd-hash-equal-dates\.txt/
    )
  })

  it('the CLI defines value-diff-plan and --hash-equal-dates', () => {
    const cli = fs.readFileSync(CLI_PATH, 'utf-8')
    expect(cli).toContain(".command('value-diff-plan')")
    expect(cli).toContain("'--hash-equal-dates <file>'")
  })
})

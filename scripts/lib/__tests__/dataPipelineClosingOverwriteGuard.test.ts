/**
 * Workflow guard: rescrape and rebuild consult the REMOTE snapshot metadata
 * before publishing (#1621).
 *
 * Both modes run `--force` on an empty runner cache (R2), so the local
 * TransformService closing guard (#1608) has nothing to compare against and
 * a pre-close transform of a month-end would upload over the closing
 * snapshot in GCS. Each loop must run scripts/guard-snapshot-upload.ts
 * (decision in lib/closingOverwriteGuard.ts) after the transform and before
 * analytics are computed or anything is uploaded, and skip the date when it
 * refuses or cannot read GCS. Sourced from the workflow YAML so the glue
 * cannot silently drift.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)

interface Step {
  name?: string
  run?: string
}

function stepRun(namePrefix: string): string {
  const doc = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
    jobs: Record<string, { steps?: Step[] }>
  }
  const step = Object.values(doc.jobs)
    .flatMap(job => job.steps ?? [])
    .find(s => s.name?.startsWith(namePrefix))
  if (!step?.run) throw new Error(`step not found: ${namePrefix}`)
  return step.run
}

const GUARD = 'scripts/guard-snapshot-upload.ts "${ACTUAL_DATE}"'

describe.each([
  ['rescrape', '[rescrape] Re-collect and process dates'],
  ['rebuild', '[rebuild] Stream rebuild'],
])('data-pipeline %s — remote closing-snapshot guard (#1621)', (_, name) => {
  const run = stepRun(name)

  it('guards the resolved snapshot date after the transform', () => {
    const guardAt = run.indexOf(GUARD)
    const actualDateAt = run.indexOf('ACTUAL_DATE="${ACTUAL_DATE:-')
    expect(guardAt).toBeGreaterThan(-1)
    expect(guardAt).toBeGreaterThan(actualDateAt)
  })

  it('runs before analytics are computed and before any snapshot upload', () => {
    const guardAt = run.indexOf(GUARD)
    expect(guardAt).toBeGreaterThan(-1)
    expect(guardAt).toBeLessThan(run.indexOf('collector-cli compute-analytics'))
    expect(guardAt).toBeLessThan(
      run.indexOf('"gs://${GCS_BUCKET}/snapshots/${ACTUAL_DATE}/"')
    )
  })

  it('skips the date when the guard refuses or fails (fail closed)', () => {
    const guardBlock = run.slice(run.indexOf(GUARD))
    const continueAt = guardBlock.indexOf('continue')
    expect(continueAt).toBeGreaterThan(-1)
    expect(continueAt).toBeLessThan(
      guardBlock.indexOf('collector-cli compute-analytics')
    )
  })
})

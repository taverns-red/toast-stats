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

// Modes whose loop runs in scripts/pipeline/process-dates.sh (#1742). There
// the guard's order (after the transform, before compute and upload) and its
// skip-on-refusal are exercised for real in processDates.test.ts.
describe.each([
  ['rebuild', '[rebuild] Stream rebuild'],
  ['rescrape', '[rescrape] Re-collect and process dates'],
])(
  'data-pipeline %s — remote closing-snapshot guard (#1621, via process-dates.sh)',
  (mode, name) => {
    const run = stepRun(name)
    const script = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/pipeline/process-dates.sh'),
      'utf-8'
    )

    it('delegates the per-date loop to process-dates.sh', () => {
      expect(run).toContain(
        `bash scripts/pipeline/process-dates.sh "\${GCS_BUCKET}" ${mode} `
      )
      expect(run).not.toMatch(/collector-cli\s+compute-analytics\b/)
    })

    it('defaults the script to the real guard', () => {
      expect(script).toContain('${REPO}/scripts/guard-snapshot-upload.ts')
    })
  }
)

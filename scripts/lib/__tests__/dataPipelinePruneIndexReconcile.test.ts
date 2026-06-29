/**
 * Prune index-reconcile guard for data-pipeline.yml (#1279).
 *
 * Prune deletes `snapshots/<date>/` prefixes from GCS but the
 * "Update district-snapshot-index" step historically had only two branches:
 *   - MODE == "rebuild" → regenerate the index from the GCS district_*.json
 *     listing (correct — only lists dates whose files actually exist).
 *   - else (daily)      → download the existing index and merge today's date.
 *
 * A prune run hit the `else` branch with empty DATE/DISTRICT_LIST and wrote the
 * existing index straight back UNCHANGED, so the just-deleted dates kept being
 * advertised → the frontend requests a phantom date → 404 → the change-digest
 * error UI (#1279).
 *
 * The fix: prune must take the regenerate-from-GCS path, so the index never
 * lists a date whose file was deleted. This guard parses the workflow, finds
 * the index-update step, identifies the branch that regenerates from the GCS
 * listing, and asserts BOTH `rebuild` and `prune` reach it while `daily` does
 * not. Sourced from the workflow YAML itself, so it can't drift.
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

function loadSteps(): Step[] {
  const doc = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
    jobs: Record<string, { steps?: Step[] }>
  }
  return Object.values(doc.jobs).flatMap(job => job.steps ?? [])
}

function indexUpdateStep(): Step {
  const step = loadSteps().find(
    s => s.name === 'Update district-snapshot-index'
  )
  if (!step?.run)
    throw new Error('Update district-snapshot-index step not found')
  return step
}

/**
 * The regenerate-from-GCS branch is the one whose body lists the actual
 * snapshot files (`gsutil ls ... snapshots/*\/district_*.json`). Find the
 * `if [ ... ]; then` condition that gates it and return the set of MODE values
 * it matches via `"${MODE}" = "X"` comparisons.
 */
function modesReachingRegenerateBranch(run: string): Set<string> {
  const lines = run.split('\n')
  // The gating condition is the `if`/`elif` line that immediately precedes the
  // branch containing the GCS-listing regeneration.
  const lsIdx = lines.findIndex(l =>
    /gsutil ls .*snapshots\/\*\/district_\*\.json/.test(l)
  )
  if (lsIdx === -1) {
    throw new Error('regenerate-from-GCS listing (gsutil ls) not found in step')
  }
  // Walk back to the nearest `if`/`elif [ ... ]; then` gating that branch.
  let condLine: string | undefined
  for (let i = lsIdx; i >= 0; i--) {
    if (/^\s*(if|elif)\b.*;\s*then\s*$/.test(lines[i]!)) {
      condLine = lines[i]
      break
    }
  }
  if (!condLine)
    throw new Error('gating if/then for regenerate branch not found')
  const modes = new Set<string>()
  for (const m of condLine.matchAll(/"\$\{MODE\}"\s*=\s*"(\w+)"/g)) {
    modes.add(m[1]!)
  }
  return modes
}

describe('data-pipeline.yml prune reconciles district-snapshot-index (#1279)', () => {
  const step = indexUpdateStep()
  const modes = modesReachingRegenerateBranch(step.run!)

  it('prune regenerates the index from the GCS listing (regression: #1279)', () => {
    expect(modes.has('prune')).toBe(true)
  })

  it('rebuild still regenerates from the GCS listing (no regression)', () => {
    expect(modes.has('rebuild')).toBe(true)
  })

  it('daily keeps the merge-existing path (downloads + merges the current index)', () => {
    // daily is the else-branch fallthrough — never a `"${MODE}" = "daily"`
    // literal in the gating condition, so it must NOT appear among the
    // regenerate-branch modes…
    expect(modes.has('daily')).toBe(false)
    // …and the merge path it falls through to must still download the existing
    // index before merging today's date (only the merge branch does this).
    expect(
      /gsutil cp "\$\{INDEX_PATH\}" \/tmp\/district-snapshot-index\.json/.test(
        step.run!
      )
    ).toBe(true)
  })
})

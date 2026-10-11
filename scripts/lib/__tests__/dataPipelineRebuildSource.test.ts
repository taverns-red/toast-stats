/**
 * Workflow guard: rebuild mode must source month-end dates from the closing
 * raw (#1608).
 *
 * The 2026-09-10 `rebuild` dispatch (run 34471585930, dates=2026-06-30)
 * synced raw-csv/2026-06-30 and ran `transform --date 2026-06-30 --force`,
 * replacing the June-close snapshot with the pre-close "As of 06/30" view.
 * The fix resolves each requested date through
 * scripts/resolve-rebuild-source.ts (unit-tested decision in
 * lib/rebuildSource.ts) and syncs + transforms THAT raw date. Sourced from
 * the workflow YAML so the glue cannot silently drift back.
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

function rebuildStreamStep(): Step {
  const doc = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
    jobs: Record<string, { steps?: Step[] }>
  }
  const step = Object.values(doc.jobs)
    .flatMap(job => job.steps ?? [])
    .find(s => s.name?.startsWith('[rebuild] Stream rebuild'))
  if (!step?.run) throw new Error('rebuild stream step not found')
  return step
}

// The loop moved into scripts/pipeline/process-dates.sh (#1742). Its resolve
// stage runs for real in processDates.test.ts: the closing raw is fetched and
// transformed, and an unresolvable date fails closed instead of falling back
// to the same-named (possibly pre-close) raw. This guard pins the wiring.
const SCRIPT = path.resolve(process.cwd(), 'scripts/pipeline/process-dates.sh')

describe('data-pipeline rebuild — month-end source resolution (#1608)', () => {
  const run = rebuildStreamStep().run!
  const script = fs.readFileSync(SCRIPT, 'utf-8')

  it('runs every date through process-dates.sh in rebuild mode', () => {
    expect(run).toMatch(
      /bash scripts\/pipeline\/process-dates\.sh "\$\{GCS_BUCKET\}" rebuild /
    )
  })

  it('has no inline transform left in the step to drift back', () => {
    expect(run).not.toMatch(/collector-cli\s+transform\b/)
  })

  it('defaults the script to the real resolver', () => {
    expect(script).toContain('${REPO}/scripts/resolve-rebuild-source.ts')
    expect(
      fs.existsSync(
        path.resolve(process.cwd(), 'scripts/resolve-rebuild-source.ts')
      )
    ).toBe(true)
  })
})

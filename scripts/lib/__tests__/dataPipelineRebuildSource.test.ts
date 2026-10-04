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

describe('data-pipeline rebuild — month-end source resolution (#1608)', () => {
  const run = rebuildStreamStep().run!

  it('resolves the raw source date before syncing', () => {
    const resolveAt = run.indexOf('scripts/resolve-rebuild-source.ts')
    const syncAt = run.indexOf('raw-csv/${SOURCE_DATE}/')
    expect(resolveAt).toBeGreaterThan(-1)
    expect(syncAt).toBeGreaterThan(resolveAt)
  })

  it('transforms the resolved source date, never the raw requested date', () => {
    expect(run).toMatch(/collector-cli transform --date "\$\{SOURCE_DATE\}"/)
    expect(run).not.toMatch(/collector-cli transform --date "\$\{DATE\}"/)
  })

  it('does not publish when source resolution fails (fail closed)', () => {
    // The resolver exits non-zero when GCS metadata cannot be read; the loop
    // must count it as a failure and skip the date rather than fall back to
    // the same-named (possibly pre-close) raw.
    expect(run).toMatch(
      /if ! SOURCE_DATE=\$\(npx tsx scripts\/resolve-rebuild-source\.ts "\$\{DATE\}"\)/
    )
  })
})

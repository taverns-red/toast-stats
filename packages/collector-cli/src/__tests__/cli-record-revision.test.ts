import { describe, expect, it } from 'vitest'

import { createCLI } from '../cli.js'

/**
 * #2475 — the pipeline records a reconciliation revision through
 * `collector-cli record-revision` (scripts/pipeline/process-dates.sh). The
 * behaviour is RevisionStore.test.ts; this guards the wiring and the option
 * surface the shell passes (a dropped command ships green).
 */
describe('CLI: record-revision command (#2475)', () => {
  const command = createCLI().commands.find(c => c.name() === 'record-revision')

  it('is registered', () => {
    expect(command).toBeDefined()
  })

  it('takes the month end, the as-of date and the prior copy', () => {
    const flags = command!.options.map(o => o.long)
    expect(flags).toEqual(
      expect.arrayContaining([
        '--date',
        '--as-of',
        '--prior-snapshot',
        '--revision-zero-only',
        '--config',
      ])
    )
    const required = command!.options.filter(o => o.mandatory).map(o => o.long)
    expect(required.sort()).toEqual(['--as-of', '--date'])
  })
})

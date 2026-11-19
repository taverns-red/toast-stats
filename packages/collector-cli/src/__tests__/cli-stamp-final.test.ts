import { describe, expect, it } from 'vitest'

import { createCLI } from '../cli.js'

/**
 * #2475 phase 3 — on a non-closing daily the pipeline stamps the previous
 * month end's revision index `final` through `collector-cli stamp-final`
 * (scripts/pipeline/process-dates.sh). The behaviour is
 * RevisionStore.stampFinal.test.ts; this guards the wiring and the option
 * surface the shell passes (a dropped command ships green).
 */
describe('CLI: stamp-final command (#2475)', () => {
  const command = createCLI().commands.find(c => c.name() === 'stamp-final')

  it('is registered', () => {
    expect(command).toBeDefined()
  })

  it('takes the daily’s date and the hydrated index file', () => {
    const flags = command!.options.map(o => o.long)
    expect(flags).toEqual(
      expect.arrayContaining(['--date', '--index', '--config'])
    )
    const required = command!.options.filter(o => o.mandatory).map(o => o.long)
    expect(required.sort()).toEqual(['--date', '--index'])
  })
})

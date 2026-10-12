import { describe, expect, it } from 'vitest'

import { createCLI } from '../cli.js'

/**
 * #1802 — the `backfill-education-ledger-history` command must be registered
 * so the data-pipeline `backfill-education-ledger` mode can run it.
 * Behaviour is covered by EducationLedgerHistory.test.ts; this guards the
 * wiring and option surface (a dropped command ships green).
 */
describe('CLI: backfill-education-ledger-history command', () => {
  const command = createCLI().commands.find(
    c => c.name() === 'backfill-education-ledger-history'
  )

  it('is registered', () => {
    expect(command).toBeDefined()
  })

  it('exposes program-years / districts / rate-ms / force / dry-run', () => {
    const flags = command!.options.map(o => o.long)
    expect(flags).toEqual(
      expect.arrayContaining([
        '--program-years',
        '--districts',
        '--rate-ms',
        '--force',
        '--dry-run',
      ])
    )
  })

  it('requires --program-years (a backfill must be scoped)', () => {
    const opt = command!.options.find(o => o.long === '--program-years')
    expect(opt?.required || opt?.mandatory).toBe(true)
  })

  it('defaults to the daily collector’s request spacing (1100 ms)', () => {
    const opt = command!.options.find(o => o.long === '--rate-ms')
    expect(opt?.defaultValue).toBe(1100)
  })
})

import { describe, expect, it } from 'vitest'

import { createCLI } from '../cli.js'

/**
 * Sprint 1 #1146 (epic #1145) — the `backfill-education-archive` command must
 * be registered so the operator can run the one-time prior-PY backfill.
 * Behaviour (fetch → parse → write/merge, dry-run, skip-empty, fail-closed) is
 * covered by EducationArchiveBackfill.test.ts; this guards the CLI wiring +
 * option surface (a dropped command ships green).
 */
describe('CLI: backfill-education-archive command', () => {
  const command = createCLI().commands.find(
    c => c.name() === 'backfill-education-archive'
  )

  it('is registered', () => {
    expect(command).toBeDefined()
  })

  it('exposes the program-years / districts / rate-ms / dry-run options', () => {
    const flags = command!.options.map(o => o.long)
    expect(flags).toEqual(
      expect.arrayContaining([
        '--program-years',
        '--districts',
        '--rate-ms',
        '--dry-run',
        '--config',
      ])
    )
  })

  it('requires --program-years (no implicit default — a backfill must be scoped)', () => {
    const opt = command!.options.find(o => o.long === '--program-years')
    expect(opt?.required || opt?.mandatory).toBe(true)
  })
})

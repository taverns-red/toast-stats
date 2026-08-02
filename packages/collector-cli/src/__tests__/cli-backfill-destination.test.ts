/**
 * `backfill` destination surface (#1388).
 *
 * The run that wrote 1132 objects to `gs://toast-stats-data-staging//raw-csv/`
 * named its destination in no log line at all, and the operator had to pass
 * `--gcs-prefix ''` to aim at `raw-csv/` because the default aimed somewhere
 * else — `backfill/raw-csv/`, which nothing reads either.
 *
 * Pinned here: omitting the flag means no prefix, and the run's exit code is
 * decided by the read-back as well as by the mismatch count.
 */

import { describe, expect, it } from 'vitest'

import { createCLI } from '../cli.js'
import { ExitCode } from '../types/collector.js'
import {
  resolveBackfillExitCode,
  type BackfillRunSummary,
} from '../services/BackfillOrchestrator.js'

const cleanSummary: BackfillRunSummary = {
  requestsMade: 1132,
  emptySkipped: 0,
  mismatches: 0,
  errors: 0,
  readbackFailures: [],
}

describe('CLI: backfill --gcs-prefix default (#1388)', () => {
  const command = createCLI().commands.find(c => c.name() === 'backfill')

  it('defaults to no prefix, so omission writes to raw-csv/{date}/', () => {
    const opt = command!.options.find(o => o.long === '--gcs-prefix')
    expect(opt).toBeDefined()
    expect(opt!.defaultValue).toBe('')
  })
})

describe('resolveBackfillExitCode (#1388)', () => {
  it('succeeds on a clean run', () => {
    expect(resolveBackfillExitCode(cleanSummary)).toBe(ExitCode.SUCCESS)
  })

  it('fails when a date could not be read back — not a warning', () => {
    expect(
      resolveBackfillExitCode({
        ...cleanSummary,
        readbackFailures: ['2026-07-26'],
      })
    ).toBe(ExitCode.COMPLETE_FAILURE)
  })

  it('still fails on a period mismatch (#1384)', () => {
    expect(resolveBackfillExitCode({ ...cleanSummary, mismatches: 1 })).toBe(
      ExitCode.COMPLETE_FAILURE
    )
  })
})

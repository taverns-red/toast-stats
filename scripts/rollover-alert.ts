/**
 * Program-year rollover alert glue (#1343).
 *
 * Thin wrapper around the unit-tested `evaluateRolloverAlert`: reads the
 * resolver's verdict from the environment, writes the decision to
 * $GITHUB_OUTPUT, and prints a summary. All logging goes to stderr; stdout and
 * $GITHUB_OUTPUT carry only the structured decision (R4).
 *
 * Fails LOUD: if anything here throws, we emit alert=true rather than letting a
 * broken monitor recreate the silence it exists to prevent.
 */
import { appendFileSync } from 'node:fs'
import {
  evaluateRolloverAlert,
  type RolloverReason,
} from './lib/rolloverAlert.js'

function setOutput(key: string, value: string | number | boolean): void {
  const out = process.env['GITHUB_OUTPUT']
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

const VALID: readonly RolloverReason[] = [
  'resolved',
  'not-published',
  'upstream-error',
]

function main(): void {
  const rawReason = process.env['ROLLOVER_REASON'] ?? ''
  const programYear = process.env['ROLLOVER_PROGRAM_YEAR'] ?? 'unknown'
  const date = process.env['TARGET_DATE'] ?? ''

  // An unrecognised reason means the resolver and this monitor have drifted
  // apart. Treat that as alertable rather than quietly passing.
  if (!VALID.includes(rawReason as RolloverReason)) {
    log(`Unrecognised ROLLOVER_REASON "${rawReason}" — alerting`)
    setOutput('alert', true)
    setOutput('should_close', false)
    setOutput(
      'summary',
      `Unrecognised program-year resolution reason "${rawReason}". The ` +
        `collector and the rollover monitor may have drifted apart (#1343).`
    )
    return
  }

  const result = evaluateRolloverAlert({
    reason: rawReason as RolloverReason,
    programYear,
    date,
  })

  log(
    `Rollover — reason=${rawReason} programYear=${programYear} ` +
      `days=${result.daysIntoProgramYear ?? 'unknown'} alert=${result.alert}`
  )
  log(result.summary)

  setOutput('alert', result.alert)
  setOutput('should_close', result.shouldClose)
  setOutput('summary', result.summary)
  setOutput('days', result.daysIntoProgramYear ?? -1)
}

try {
  main()
} catch (err) {
  log(`rollover-alert failed: ${(err as Error).stack ?? err}`)
  setOutput('alert', true)
  setOutput('should_close', false)
  setOutput(
    'summary',
    'The program-year rollover monitor itself failed — alerting rather than ' +
      'assuming the rollover is healthy (#1343).'
  )
}

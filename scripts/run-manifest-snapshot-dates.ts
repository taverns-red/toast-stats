/**
 * Print the snapshot dates this run wrote, one per line (#2040).
 *
 * Reads the local run manifest (RUN_MANIFEST_FILE, #1762) with the same
 * reader the completeness gate uses. The daily value gate passes the list to
 * `value-diff --closing-auto-allow-dates`, so closing-pinned auto-allow
 * vouches only for dates the daily itself wrote, never for another run's
 * unpromoted staging state (#1759 B4, run 38586593289).
 *
 * Missing, empty or malformed manifest: exit 1 with nothing on stdout; the
 * workflow then passes an empty list, which allows nothing (fail closed).
 * Logs go to stderr (R4).
 */

import { readFileSync } from 'node:fs'
import { manifestSnapshotDates, parseRunManifest } from './lib/runManifest.js'

try {
  const file = process.env.RUN_MANIFEST_FILE
  if (!file) throw new Error('RUN_MANIFEST_FILE must be set')
  const dates = manifestSnapshotDates(
    parseRunManifest(readFileSync(file, 'utf-8'))
  )
  if (dates.length > 0) process.stdout.write(`${dates.join('\n')}\n`)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[run-manifest-snapshot-dates] ${message}\n`)
  process.exitCode = 1
}

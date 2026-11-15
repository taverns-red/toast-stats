/**
 * Did the run advance prod's latest date? (#2863) — runner.
 *
 * Env:
 *   PROD_LATEST_BEFORE  prod v1/latest.json latestSnapshotDate before promotion
 *   PROMOTED_DATES      the promoter's promoted_dates (comma-separated)
 *
 * Writes `newer=true|false` to $GITHUB_OUTPUT (stdout when unset). Decision
 * logic lives in ./lib/statusHeartbeat.ts (unit-tested).
 */

import * as fs from 'node:fs'
import { promotedNewerDate } from './lib/statusHeartbeat.js'

const before = process.env['PROD_LATEST_BEFORE']
const promoted = process.env['PROMOTED_DATES']
const newer = promotedNewerDate(before, promoted)

process.stderr.write(
  `status heartbeat: prod latest before=${before || '-'} promoted=${promoted || '-'} newer=${newer}\n`
)
const line = `newer=${newer}\n`
const out = process.env['GITHUB_OUTPUT']
if (out) fs.appendFileSync(out, line)
else process.stdout.write(line)

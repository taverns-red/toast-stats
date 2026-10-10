/**
 * Pull every `snapshots/{date}/all-districts-rankings.json` into
 * `<destDir>/{date}.json` for the rank-history builder (#1733, plan E2-3).
 *
 * Usage: npx tsx scripts/pull-rank-history.ts <bucket> <destDir>
 *
 * Read-only. Logs to stderr (R4). Exits non-zero on any listing or download
 * failure; see scripts/lib/rankHistoryPull.ts.
 */

import { Storage } from '@google-cloud/storage'
import {
  pullRankHistory,
  type RankHistoryBucket,
} from './lib/rankHistoryPull.js'

async function main(): Promise<void> {
  const [bucketName, destDir] = process.argv.slice(2)
  if (!bucketName || !destDir) {
    console.error('usage: pull-rank-history.ts <bucket> <destDir>')
    process.exitCode = 2
    return
  }
  const started = Date.now()
  const bucket = new Storage().bucket(
    bucketName
  ) as unknown as RankHistoryBucket
  const { downloaded } = await pullRankHistory(bucket, destDir)
  console.error(
    `[rank-history] pulled ${downloaded} rankings files from ` +
      `gs://${bucketName}/snapshots/ in ${Date.now() - started} ms`
  )
}

main().catch(err => {
  console.error(`::error::[rank-history] ${String(err)}`)
  process.exitCode = 1
})

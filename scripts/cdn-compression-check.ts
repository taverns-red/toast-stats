/**
 * CDN Compression Check — Runner (#1852). Read-only.
 *
 * GETs every JSON object the frontend fetches from the CDN, the way a browser
 * does (`Accept-Encoding: br, gzip`), and for each one:
 *   1. classifies the response (scripts/lib/cdnCompression.ts): compressed at
 *      the edge, stored gzip, under the 1 KiB floor, or a FAIL;
 *   2. decodes exactly one Content-Encoding layer and requires JSON — the
 *      bytes a browser or the MCP server's fetch() ends up parsing.
 * Prints a table to stderr (R4) and a JSON summary to stdout. Exit 1 if any
 * object fails, 2 on bad usage.
 *
 * Usage: npx tsx scripts/cdn-compression-check.ts [--base URL] [--path P ...]
 *   --base   default https://cdn.taverns.red
 *   --path   object path; repeatable; replaces the default set
 *
 * The default set's snapshot sample uses the date in v1/latest.json.
 */

import * as https from 'node:https'
import {
  classifyCdnResponse,
  decodeCdnBody,
  type CdnResponse,
  type Verdict,
} from './lib/cdnCompression.js'

const DEFAULT_BASE = 'https://cdn.taverns.red'

/** Every v1/ and config/ object the frontend fetches, plus stored-gzip samples. */
const FIXED_PATHS = [
  'config/district-snapshot-index.json',
  'config/club-index.json',
  'config/divisions-areas-index.json',
  'v1/latest.json',
  'v1/dates.json',
  'v1/rankings.json',
  'v1/global-history.json',
  'v1/rank-history/61.json',
  'time-series/district_61/index-metadata.json',
]

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function get(url: string): Promise<{
  status: number
  headers: Record<string, string>
  body: Buffer
}> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'accept-encoding': 'br, gzip' } },
      res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) {
              headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v
            }
          }
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks),
          })
        })
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.setTimeout(30_000, () => req.destroy(new Error('timeout')))
  })
}

async function check(base: string, path: string): Promise<Verdict> {
  const res = await get(`${base}/${path}`)
  const response: CdnResponse = {
    path,
    status: res.status,
    headers: res.headers,
    wireBytes: res.body.length,
  }
  const verdict = classifyCdnResponse(response)
  if (res.status !== 200) return verdict
  try {
    const decoded = decodeCdnBody(res.body, res.headers['content-encoding'])
    return {
      ...verdict,
      detail: `${verdict.detail}; decodes to ${decoded.length} B of JSON`,
    }
  } catch (err) {
    return {
      ...verdict,
      ok: false,
      kind: 'bad-encoding',
      detail: (err as Error).message,
    }
  }
}

async function main(argv: string[]): Promise<number> {
  let base = DEFAULT_BASE
  const paths: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--base' && argv[i + 1]) base = argv[++i]!.replace(/\/$/, '')
    else if (a === '--path' && argv[i + 1]) paths.push(argv[++i]!)
    else {
      log('Usage: cdn-compression-check.ts [--base URL] [--path P ...]')
      return 2
    }
  }
  if (paths.length === 0) {
    paths.push(...FIXED_PATHS)
    const latest = await get(`${base}/v1/latest.json`)
    const date = (
      JSON.parse(
        decodeCdnBody(latest.body, latest.headers['content-encoding']).toString(
          'utf-8'
        )
      ) as { latestSnapshotDate?: string }
    ).latestSnapshotDate
    if (date) paths.push(`snapshots/${date}/district_61.json`)
  }

  const verdicts: Verdict[] = []
  for (const p of paths) {
    try {
      verdicts.push(await check(base, p))
    } catch (err) {
      verdicts.push({
        path: p,
        ok: false,
        kind: 'http-error',
        detail: (err as Error).message,
      })
    }
  }
  for (const v of verdicts) {
    log(
      `${v.ok ? 'PASS' : 'FAIL'}  ${v.kind.padEnd(16)} ${v.path}  ${v.detail}`
    )
  }
  const failed = verdicts.filter(v => !v.ok)
  process.stdout.write(
    `${JSON.stringify({ base, checked: verdicts.length, failed: failed.length, verdicts })}\n`
  )
  return failed.length === 0 ? 0 : 1
}

main(process.argv.slice(2)).then(
  code => process.exit(code),
  err => {
    log(`cdn-compression-check: ${(err as Error).message}`)
    process.exit(1)
  }
)

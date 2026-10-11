/**
 * CDN manifest builders: v1/latest.json, v1/dates.json, v1/rankings.json
 * (#1743, plan P3-3).
 *
 * Ported verbatim from the inline `node -e` blocks in data-pipeline.yml's
 * "Generate CDN manifests" step. Output must stay byte-identical: the
 * frontend, the MCP server and the promotion diff all read these files, and
 * __tests__/goldenParity.test.ts pins the bytes against the original code.
 * `generatedAt` is a parameter so the bytes are testable.
 */

export interface BuiltManifest {
  json: string
  count: number
}

/** v1/latest.json — the newest snapshot date the site should show. */
export function latestManifestJson(
  latestDate: string,
  generatedAt: string
): string {
  const manifest = {
    _format: { version: '1.0.0', type: 'manifest' },
    latestSnapshotDate: latestDate,
    generatedAt,
  }
  return JSON.stringify(manifest, null, 2)
}

/**
 * v1/dates.json from the newline-separated, sorted date listing the workflow
 * writes (`gcloud storage ls snapshots/ | grep -oP <date> | sort -u`).
 */
export function datesIndexJson(
  datesFileText: string,
  generatedAt: string
): BuiltManifest {
  const dates = datesFileText.trim().split('\n').filter(Boolean)
  const data = {
    _format: { version: '1.0.0', type: 'dates-index' },
    dates,
    count: dates.length,
    generatedAt,
  }
  return { json: JSON.stringify(data, null, 2), count: dates.length }
}

interface RankingsSource {
  rankings: unknown[]
  metadata: { sourceCsvDate?: string }
}

/**
 * v1/rankings.json from snapshots/{latest}/all-districts-rankings.json.
 * Throws on a file it cannot parse or that has no `metadata`, exactly as the
 * inline code did; the step fails rather than publishing a broken manifest.
 */
export function rankingsManifestJson(
  srcText: string,
  latestDate: string,
  generatedAt: string
): BuiltManifest {
  const src = JSON.parse(srcText) as RankingsSource
  const data = {
    _format: { version: '1.0.0', type: 'rankings' },
    rankings: src.rankings,
    date: src.metadata.sourceCsvDate || latestDate,
    generatedAt,
  }
  return { json: JSON.stringify(data, null, 2), count: src.rankings.length }
}

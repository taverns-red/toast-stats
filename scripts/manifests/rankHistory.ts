/**
 * Per-district rank history: v1/rank-history/{districtId}.json
 * (#186, #302; moved out of inline `node -e` by #1743, plan P3-3).
 *
 * Input is one all-districts-rankings.json per snapshot date, named
 * `{date}.json` by scripts/pull-rank-history.ts. Ported verbatim from the
 * inline block so the published bytes do not change
 * (__tests__/goldenParity.test.ts). In particular:
 * - files are processed in the order given (the CLI passes readdirSync's);
 * - a file that cannot be read or parsed is skipped, never fatal;
 * - a "District N" placeholder name is replaced by the next real one seen;
 * - each history is sorted by date and keeps the FIRST row per date.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export interface RankHistorySourceFile {
  name: string
  /** Called inside the per-file try, so a read failure skips the file. */
  read: () => string
}

export interface RankHistoryEntry {
  districtId: string
  json: string
}

export interface RankHistoryResult {
  /** In first-seen order, one per district. */
  entries: RankHistoryEntry[]
  totalPoints: number
  /** The summary line the inline script printed. */
  summary: string
}

interface RankingRow {
  districtId: string
  districtName: string
  aggregateScore?: number
  clubsRank?: number
  paymentsRank?: number
  distinguishedRank?: number
  overallRank?: number
}

interface RankingsFile {
  rankings?: RankingRow[]
  metadata: { totalDistricts?: number }
}

interface HistoryPoint {
  date: string
  aggregateScore?: number
  clubsRank?: number
  paymentsRank?: number
  distinguishedRank?: number
  totalDistricts?: number
  overallRank: number
}

interface IndexEntry {
  districtId: string
  districtName: string
  history: HistoryPoint[]
}

export function buildRankHistory(
  files: RankHistorySourceFile[],
  onSkip: (message: string) => void
): RankHistoryResult {
  const index = new Map<string, IndexEntry>()
  for (const file of files.filter(f => f.name.endsWith('.json'))) {
    try {
      const data = JSON.parse(file.read()) as RankingsFile
      // Use the snapshot date (filename) not sourceCsvDate (raw-csv date) (#302)
      const date = basename(file.name, '.json')
      if (!date || !data.rankings) continue
      for (const r of data.rankings) {
        let entry = index.get(r.districtId)
        if (!entry) {
          entry = {
            districtId: r.districtId,
            districtName: r.districtName,
            history: [],
          }
          index.set(r.districtId, entry)
        }
        if (entry.districtName === 'District ' + r.districtId) {
          entry.districtName = r.districtName
        }
        entry.history.push({
          date,
          aggregateScore: r.aggregateScore,
          clubsRank: r.clubsRank,
          paymentsRank: r.paymentsRank,
          distinguishedRank: r.distinguishedRank,
          totalDistricts: data.metadata.totalDistricts,
          overallRank: r.overallRank ?? 0,
        })
      }
    } catch (e) {
      onSkip('Skipping ' + file.name + ': ' + (e as Error).message)
    }
  }

  let totalPoints = 0
  const entries: RankHistoryEntry[] = []
  for (const [id, entry] of index) {
    entry.history.sort((a, b) => a.date.localeCompare(b.date))
    const seen = new Set<string>()
    entry.history = entry.history.filter(p => {
      if (seen.has(p.date)) return false
      seen.add(p.date)
      return true
    })
    totalPoints += entry.history.length
    entries.push({ districtId: id, json: JSON.stringify(entry) })
  }

  return {
    entries,
    totalPoints,
    summary:
      'Generated rank history for ' +
      index.size +
      ' districts (' +
      totalPoints +
      ' total points)',
  }
}

/**
 * Build from every file in `srcDir` (readdirSync order, as the inline code
 * used) and write `{outDir}/{districtId}.json`. Returns the summary line.
 */
export function writeRankHistory(
  srcDir: string,
  outDir: string,
  onSkip: (message: string) => void
): string {
  const result = buildRankHistory(
    readdirSync(srcDir).map(name => ({
      name,
      read: () => readFileSync(join(srcDir, name), 'utf-8'),
    })),
    onSkip
  )
  mkdirSync(outDir, { recursive: true })
  for (const entry of result.entries) {
    writeFileSync(join(outDir, entry.districtId + '.json'), entry.json)
  }
  return result.summary
}

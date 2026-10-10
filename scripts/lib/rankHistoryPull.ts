/**
 * Rank-history pull (#1733, plan E2-3). Stub — implemented in the next commit.
 */

export const RANKINGS_MATCH_GLOB = 'snapshots/*/all-districts-rankings.json'

/** The subset of `@google-cloud/storage`'s File the pull uses. */
export interface RankHistoryFile {
  download(opts: { destination: string }): Promise<unknown>
}

/** The subset of `@google-cloud/storage`'s Bucket the pull uses. */
export interface RankHistoryBucket {
  // The SDK's overloads resolve to `[files, nextQuery, apiResponse]`.
  getFiles(query: Record<string, unknown>): Promise<unknown[]>
  file(name: string): RankHistoryFile
}

export function rankingsDate(_name: string): string | null {
  throw new Error('not implemented')
}

export async function pullRankHistory(
  _bucket: RankHistoryBucket,
  _destDir: string,
  _opts: { concurrency?: number } = {}
): Promise<{ downloaded: number }> {
  throw new Error('not implemented')
}

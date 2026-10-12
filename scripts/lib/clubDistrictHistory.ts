/**
 * Club-district history fold (#1782, epic #1781).
 *
 * Folds every `club-race/{PY}/first-reached.json` store into one club-keyed
 * history: the club is the key, the district an attribute with a date range.
 * The stores are the only club-keyed data the pipeline keeps (D3), already
 * backfilled from 2016-17 and written by compute-analytics in every mode, so
 * this is a pure derivation from persisted inputs (ADR-015 P2).
 *
 * What one store gives per club: the district at its latest sighting that
 * program year, `lastSeen`, and the name. The store has no per-club first
 * sighting, so the history is PY-granular (`granularity: 'program-year'`):
 * - a span starts at the FIRST observed date of the program year the club
 *   first appeared in that district, and ends at its `lastSeen` in the last
 *   program year of the run of consecutive years there;
 * - a program year the club is absent from (a store exists, the club is not
 *   in it) breaks the span, even if it comes back to the same district;
 * - the last span is open (`to: null`) only when the club was seen on the
 *   history's `asOf`, the newest date any store observed.
 * Phase 2 (#1816) makes the change points date-exact.
 *
 * Each store's program year is its own `programYear`, i.e. the PY of the
 * snapshots' LOGICAL dates (the CLAUDE.md tripwire): a June close collected
 * in July is already filed under the year it closes.
 *
 * Determinism: the stores are sorted by program year before folding, clubs
 * and shards are inserted in sorted order, and the only timestamp is the
 * newest store `updatedAt`, so any input order gives identical bytes
 * (Lesson 158: numeric-like keys cannot promise lexicographic order).
 */

import {
  CLUB_DISTRICT_HISTORY_VERSION,
  clubDistrictHistoryShardKey,
  normalizeClubId,
  type ClubDistrictDuplicate,
  type ClubDistrictHistoryClub,
  type ClubDistrictHistoryIndex,
  type ClubDistrictHistoryShard,
  type ClubDistrictSpan,
  type ClubRaceStoreClub,
  type ClubRaceStoreData,
} from '@taverns-red/shared-contracts'

export interface ClubDistrictHistoryArtifact {
  index: ClubDistrictHistoryIndex
  /** Shard key ("00".."99") → shard. */
  shards: Record<string, ClubDistrictHistoryShard>
}

/** One club's sighting in one program year's store. */
interface Sighting {
  programYear: string
  /** Position of the program year among the folded stores. */
  ordinal: number
  /** First observed date of that program year's store. */
  pyFirst: string
  districtId: string
  clubName: string
  lastSeen: string
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The canonical clubs of one store. Two keys that normalise to one club id
 * are a duplicate: reported, and resolved deterministically to the latest
 * `lastSeen` (ties: the higher district id) so the shard stays stable.
 */
function canonicalClubs(store: ClubRaceStoreData): {
  clubs: Map<string, ClubRaceStoreClub>
  duplicates: ClubDistrictDuplicate[]
} {
  const groups = new Map<string, ClubRaceStoreClub[]>()
  for (const [key, entry] of Object.entries(store.clubs)) {
    const id = normalizeClubId(entry.clubId || key)
    const group = groups.get(id)
    if (group) group.push(entry)
    else groups.set(id, [entry])
  }

  const clubs = new Map<string, ClubRaceStoreClub>()
  const duplicates: ClubDistrictDuplicate[] = []
  for (const [id, group] of groups) {
    const ordered = [...group].sort(
      (a, b) =>
        byString(a.lastSeen, b.lastSeen) || byString(a.districtId, b.districtId)
    )
    clubs.set(id, ordered[ordered.length - 1]!)
    const districts = new Set(group.map(e => e.districtId))
    if (districts.size > 1) {
      duplicates.push({
        clubId: id,
        programYear: store.programYear,
        sightings: ordered.map(e => ({
          districtId: e.districtId,
          clubName: e.clubName,
          lastSeen: e.lastSeen,
        })),
      })
    }
  }
  return { clubs, duplicates }
}

function buildClub(
  sightings: readonly Sighting[],
  asOf: string
): ClubDistrictHistoryClub {
  const spans: ClubDistrictSpan[] = []
  let previous: Sighting | undefined
  for (const s of sightings) {
    const current = spans[spans.length - 1]
    if (
      current &&
      previous &&
      current.districtId === s.districtId &&
      s.ordinal === previous.ordinal + 1
    ) {
      current.to = s.lastSeen
    } else {
      spans.push({ from: s.pyFirst, to: s.lastSeen, districtId: s.districtId })
    }
    previous = s
  }

  const latest = sightings[sightings.length - 1]!
  const lastSeen = sightings.reduce(
    (max, s) => (s.lastSeen > max ? s.lastSeen : max),
    latest.lastSeen
  )
  const last = spans[spans.length - 1]!
  if (last.to === asOf) last.to = null

  const formerNames: string[] = []
  for (const s of sightings) {
    if (s.clubName !== latest.clubName && !formerNames.includes(s.clubName)) {
      formerNames.push(s.clubName)
    }
  }

  const byProgramYear: Record<string, string> = {}
  for (const s of sightings) byProgramYear[s.programYear] = s.districtId

  return {
    name: latest.clubName,
    formerNames,
    firstSeen: spans[0]!.from,
    lastSeen,
    spans,
    byProgramYear,
  }
}

export function foldClubDistrictHistory(
  stores: readonly ClubRaceStoreData[]
): ClubDistrictHistoryArtifact {
  if (stores.length === 0) {
    throw new Error(
      'foldClubDistrictHistory: no club-race stores; refusing to write an empty history'
    )
  }
  const sorted = [...stores].sort((a, b) =>
    byString(a.programYear, b.programYear)
  )
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.programYear === sorted[i - 1]!.programYear) {
      throw new Error(
        `foldClubDistrictHistory: two stores for program year ${sorted[i]!.programYear}`
      )
    }
  }

  let asOf = ''
  let sourcesUpdatedAt = ''
  const sightings = new Map<string, Sighting[]>()
  const duplicates: ClubDistrictDuplicate[] = []

  sorted.forEach((store, ordinal) => {
    const observed = [...store.observedDates].sort(byString)
    const pyFirst = observed[0]
    const pyLast = observed[observed.length - 1]
    if (pyLast && pyLast > asOf) asOf = pyLast
    if (store.updatedAt > sourcesUpdatedAt) sourcesUpdatedAt = store.updatedAt

    const { clubs, duplicates: dups } = canonicalClubs(store)
    duplicates.push(...dups)
    for (const [id, entry] of clubs) {
      const list = sightings.get(id) ?? []
      list.push({
        programYear: store.programYear,
        ordinal,
        // A store with no observed dates still names its clubs; fall back
        // to the club's own sighting rather than invent a date.
        pyFirst: pyFirst ?? entry.lastSeen,
        districtId: entry.districtId,
        clubName: entry.clubName,
        lastSeen: entry.lastSeen,
      })
      sightings.set(id, list)
    }
  })

  const shards: Record<string, ClubDistrictHistoryShard> = {}
  const ids = [...sightings.keys()].sort(byString)
  const shardKeys = [...new Set(ids.map(clubDistrictHistoryShardKey))].sort(
    byString
  )
  for (const key of shardKeys) {
    shards[key] = {
      _format: {
        version: CLUB_DISTRICT_HISTORY_VERSION,
        type: 'club-district-history-shard',
      },
      shard: key,
      asOf,
      clubs: {},
    }
  }
  for (const id of ids) {
    shards[clubDistrictHistoryShardKey(id)]!.clubs[id] = buildClub(
      sightings.get(id)!,
      asOf
    )
  }

  duplicates.sort(
    (a, b) =>
      byString(a.programYear, b.programYear) || byString(a.clubId, b.clubId)
  )

  return {
    index: {
      _format: {
        version: CLUB_DISTRICT_HISTORY_VERSION,
        type: 'club-district-history-index',
      },
      asOf,
      sourcesUpdatedAt,
      granularity: 'program-year',
      programYears: sorted.map(s => s.programYear),
      totalClubs: ids.length,
      shards: shardKeys,
      duplicates,
    },
    shards,
  }
}

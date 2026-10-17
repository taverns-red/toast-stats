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
 *
 * Phase 2 (#1816): a store entry with `districtHistory` (one min/max run
 * per district) splits the year at its change points, and a span gains
 * `firstSeenOn` / `lastSeenOn` where the stores can vouch for the day:
 * - a run's start is dated when no `districtHistoryGaps` date (folded
 *   before change points existed) lies between the previous run's end and
 *   it — or, for a store's first run, before it at all;
 * - a run's end is dated when the next run's start is, or, for a store's
 *   last run, when it is the club's `lastSeen` (nothing after it);
 * - across a store boundary both sides must be dated; a legacy store's
 *   entry (no `districtHistory`) never dates a start, so the history keeps
 *   PY precision until a rebuild folds that year again;
 * - a run wholly inside an earlier one is a shadow listing and dropped
 *   (`resolveClubDistrictRuns`), and a change point ON a June 30 is never
 *   dated: that is the PY close, which TI re-files under the next year's
 *   structure when collected after a realignment (#2079), so the day says
 *   nothing about when the club moved.
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
  resolveClubDistrictRuns,
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

/** One district run of a club inside one store, with what it can vouch for. */
interface Run {
  districtId: string
  from: string
  to: string
  /** `from` is the first sighting in this district, to the day. */
  fromExact: boolean
  /** `to` is the last sighting in this district, to the day. */
  toExact: boolean
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
  /** Chronological; one run for a legacy entry. */
  runs: Run[]
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

/** A June 30 is a program-year close (#2079). */
const isPyClose = (date: string): boolean => date.slice(5) === '06-30'

/**
 * The runs one store entry can vouch for (#1816). A legacy entry (written
 * before change points) is one run from the year's first observed date to
 * `lastSeen`: its end is the club's last sighting, its start is unknown.
 */
function runsFor(
  entry: ClubRaceStoreClub,
  pyFirst: string,
  gaps: readonly string[]
): Run[] {
  const resolved = resolveClubDistrictRuns(entry.districtHistory)
  if (resolved.length === 0) {
    return [
      {
        districtId: entry.districtId,
        from: pyFirst,
        to: entry.lastSeen,
        fromExact: false,
        toExact: true,
      },
    ]
  }
  const runs: Run[] = resolved.map(r => ({
    ...r,
    fromExact: true,
    toExact: true,
  }))
  runs.forEach((run, i) => {
    const prev = runs[i - 1]
    const hidden = gaps.some(g => g < run.from && (!prev || g > prev.to))
    const dated = !hidden && !(prev && isPyClose(run.from))
    run.fromExact = dated
    if (prev) prev.toExact = dated
  })
  const last = runs[runs.length - 1]!
  last.toExact = last.to >= entry.lastSeen
  return runs
}

/** A span under construction, with the runs that bound it. */
interface Building {
  span: ClubDistrictSpan
  first: Run
  last: Run
  /** The previous span ended in this store or the store before. */
  adjacentToPrevious: boolean
}

function buildClub(
  sightings: readonly Sighting[],
  asOf: string
): ClubDistrictHistoryClub {
  const built: Building[] = []
  let previous: Sighting | undefined
  for (const s of sightings) {
    const adjacent =
      previous !== undefined && s.ordinal === previous.ordinal + 1
    s.runs.forEach((run, j) => {
      const current = built[built.length - 1]
      if (
        j === 0 &&
        current &&
        adjacent &&
        current.span.districtId === run.districtId
      ) {
        current.span.to = run.to
        current.last = run
        return
      }
      built.push({
        span: {
          // A store's first run starts at the PY's first observed date
          // unless the store can date it (Phase 1 precision otherwise).
          from: j === 0 && !run.fromExact ? s.pyFirst : run.from,
          to: run.to,
          districtId: run.districtId,
        },
        first: run,
        last: run,
        adjacentToPrevious: j > 0 || adjacent,
      })
    })
    previous = s
  }

  built.forEach((b, i) => {
    const prev = built[i - 1]
    const next = built[i + 1]
    const startDated =
      b.first.fromExact && (!prev || !b.adjacentToPrevious || prev.last.toExact)
    const endDated =
      b.last.toExact &&
      (!next || !next.adjacentToPrevious || next.first.fromExact)
    if (startDated) b.span.firstSeenOn = b.first.from
    if (endDated && b.span.to !== asOf) b.span.lastSeenOn = b.last.to
  })

  const spans = built.map(b => b.span)
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

    // Absent = a store never folded with change points: all dates are gaps.
    const gaps = store.districtHistoryGaps ?? store.observedDates

    const { clubs, duplicates: dups } = canonicalClubs(store)
    duplicates.push(...dups)
    for (const [id, entry] of clubs) {
      const list = sightings.get(id) ?? []
      // A store with no observed dates still names its clubs; fall back
      // to the club's own sighting rather than invent a date.
      const first = pyFirst ?? entry.lastSeen
      const runs = runsFor(entry, first, gaps)
      list.push({
        programYear: store.programYear,
        ordinal,
        pyFirst: first,
        // The year's district is its last trusted run: a shadow listing on
        // the June close (#2079) does not re-file the year.
        districtId: runs[runs.length - 1]!.districtId,
        clubName: entry.clubName,
        lastSeen: entry.lastSeen,
        runs,
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

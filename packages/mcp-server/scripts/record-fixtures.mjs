#!/usr/bin/env node
/**
 * Re-record the committed CDN fixtures in `src/__fixtures__/` from the LIVE
 * public CDN, truncated and sanitized (#1123 / epic #1096).
 *
 * Why recorded payloads: the previous fixtures were invented by hand — their
 * snapshot had `clubPerformance: []` and non-zero aggregates, which is exactly
 * the two ways production differs (FAC-enriched raw rows since 2026-05-15 per
 * #429/#431, and the zeroed aggregates of audit H3). All 50 package tests
 * passed while 2 of 8 tools were down in production. Recording the real
 * payloads makes the fixtures reproduce what the CDN actually serves.
 *
 * Usage:  node scripts/record-fixtures.mjs
 * Then:   npx prettier --write src/__fixtures__/ ../shared-contracts/src/__tests__/__fixtures__/
 *
 * Truncation: a handful of clubs / rankings rows / dates — enough to keep
 * every shape (FAC-enriched + plain rows, prospectiveClubs) without committing
 * multi-hundred-KB files. Sanitization: contact emails and phone numbers are
 * replaced with synthetic values; everything else (names, addresses,
 * coordinates) is public registry data and kept verbatim.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = process.env.CDN_BASE_URL ?? 'https://cdn.taverns.red'
const DISTRICT = '61'
const PROGRAM_YEAR = '2025-2026'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(here, '..', 'src', '__fixtures__')
const sharedContractsFixtureDir = join(
  here,
  '..',
  '..',
  'shared-contracts',
  'src',
  '__tests__',
  '__fixtures__'
)

async function fetchJson(path) {
  const res = await fetch(`${BASE}/${path}`)
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`)
  return res.json()
}

/** Replace contact emails/phones anywhere in the tree with synthetic values. */
function sanitize(value, counters = { email: 0, phone: 0 }) {
  if (Array.isArray(value)) return value.map(v => sanitize(v, counters))
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === 'email' && typeof v === 'string' && v.length > 0) {
        out[k] = `club-${++counters.email}@example.com`
      } else if (k === 'phone' && typeof v === 'string' && v.length > 0) {
        out[k] = `+1555010${String(++counters.phone).padStart(4, '0')}`
      } else {
        out[k] = sanitize(v, counters)
      }
    }
    return out
  }
  return value
}

function write(name, data, dir = fixtureDir) {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  writeFileSync(file, JSON.stringify(sanitize(data), null, 2) + '\n')
  console.error(`wrote ${file}`)
}

const latest = await fetchJson('v1/latest.json')
const date = latest.latestSnapshotDate
console.error(`recording fixtures @ ${date} from ${BASE}`)

// ── v1/latest.json — verbatim ────────────────────────────────────────────
write('latest.json', latest)

// ── v1/dates.json — last 5 dates ─────────────────────────────────────────
const dates = await fetchJson('v1/dates.json')
const keptDates = dates.dates.slice(-5)
write('dates.json', { ...dates, dates: keptDates, count: keptDates.length })

// ── config/district-snapshot-index.json — 3 districts × last 3 dates ─────
const snapshotIndex = await fetchJson('config/district-snapshot-index.json')
const keptDistricts = {}
for (const id of [DISTRICT, '42', 'F']) {
  if (snapshotIndex.districts[id]) {
    keptDistricts[id] = snapshotIndex.districts[id].slice(-3)
  }
}
write('district-snapshot-index.json', {
  ...snapshotIndex,
  districts: keptDistricts,
})

// ── snapshots/{date}/district_{id}.json — the FAC-enriched snapshot ──────
const snapshot = await fetchJson(`snapshots/${date}/district_${DISTRICT}.json`)
const cp = snapshot.data.clubPerformance
const enriched = cp.filter(r => 'coordinates' in r)
const plain = cp.filter(r => !('coordinates' in r))
// 3 FAC-enriched rows (objects + booleans — the shape that broke prod) and
// 1 plain row (no FAC match, e.g. suspended — TI hides those from FAC).
const keptCp = [...enriched.slice(0, 3), ...plain.slice(0, 1)]
const keptIds = new Set(
  keptCp.map(r => String(r['Club Number']).replace(/\D/g, '').padStart(8, '0'))
)
const keptClubs = snapshot.data.clubs.filter(c => keptIds.has(c.clubId))
const keptDivisionIds = new Set(keptClubs.map(c => c.divisionId))
const keptAreaIds = new Set(keptClubs.map(c => c.areaId))
// clubPerformance keys clubs as 'Club Number'; division/district
// performance rows key the same value as 'Club'.
const rowClubId = r =>
  String(r['Club Number'] ?? r['Club'] ?? '')
    .replace(/\D/g, '')
    .padStart(8, '0')
write('district-snapshot.json', {
  ...snapshot,
  data: {
    ...snapshot.data,
    clubs: keptClubs,
    divisions: snapshot.data.divisions.filter(d =>
      keptDivisionIds.has(d.divisionId)
    ),
    areas: snapshot.data.areas.filter(a => keptAreaIds.has(a.areaId)),
    clubPerformance: keptCp,
    divisionPerformance: snapshot.data.divisionPerformance
      .filter(r => keptIds.has(rowClubId(r)))
      .slice(0, 4),
    districtPerformance: snapshot.data.districtPerformance
      .filter(r => keptIds.has(rowClubId(r)))
      .slice(0, 4),
    prospectiveClubs: (snapshot.data.prospectiveClubs ?? []).slice(0, 2),
  },
})
// The same recorded snapshot backs the shared-contracts write-contract test
// (the #1123 "real fixture fails the old schema" regression anchor).
write(
  'recorded-district-snapshot.json',
  {
    ...snapshot,
    data: {
      ...snapshot.data,
      clubs: keptClubs,
      divisions: snapshot.data.divisions.filter(d =>
        keptDivisionIds.has(d.divisionId)
      ),
      areas: snapshot.data.areas.filter(a => keptAreaIds.has(a.areaId)),
      clubPerformance: keptCp,
      divisionPerformance: snapshot.data.divisionPerformance
        .filter(r => keptIds.has(rowClubId(r)))
        .slice(0, 4),
      districtPerformance: snapshot.data.districtPerformance
        .filter(r => keptIds.has(rowClubId(r)))
        .slice(0, 4),
      prospectiveClubs: (snapshot.data.prospectiveClubs ?? []).slice(0, 2),
    },
  },
  sharedContractsFixtureDir
)

// ── config/club-index.json — the kept clubs + 2 foreign ones ─────────────
const clubIndex = await fetchJson('config/club-index.json')
const keptIndexClubs = {}
for (const id of keptIds) {
  if (clubIndex.clubs[id]) keptIndexClubs[id] = clubIndex.clubs[id]
}
for (const [id, entry] of Object.entries(clubIndex.clubs)) {
  if (Object.keys(keptIndexClubs).length >= keptIds.size + 2) break
  if (!keptIndexClubs[id]) keptIndexClubs[id] = entry
}
write('club-index.json', {
  ...clubIndex,
  totalClubs: Object.keys(keptIndexClubs).length,
  clubs: keptIndexClubs,
})

// ── v1/rankings.json + dated all-districts-rankings — top 3 + D61 ────────
const truncateRankings = rankings => {
  const kept = rankings.slice(0, 3)
  const d61 = rankings.find(r => r.districtId === DISTRICT)
  if (d61 && !kept.includes(d61)) kept.push(d61)
  return kept
}
const v1Rankings = await fetchJson('v1/rankings.json')
write('v1-rankings.json', {
  ...v1Rankings,
  rankings: truncateRankings(v1Rankings.rankings),
})
const datedRankings = await fetchJson(
  `snapshots/${date}/all-districts-rankings.json`
)
write('dated-all-districts-rankings.json', {
  ...datedRankings,
  rankings: truncateRankings(datedRankings.rankings),
  metadata: {
    ...datedRankings.metadata,
    totalDistricts: truncateRankings(datedRankings.rankings).length,
  },
})

// ── time-series/district_{id}/{py}.json — last 2 data points ─────────────
const timeSeries = await fetchJson(
  `time-series/district_${DISTRICT}/${PROGRAM_YEAR}.json`
)
write('time-series.json', {
  ...timeSeries,
  dataPoints: timeSeries.dataPoints.slice(-2),
})

console.error('done — run prettier on the fixture dirs before committing')

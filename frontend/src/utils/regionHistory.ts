/* PY-scoped region membership (#1821, artifact #1820).

   `config/district-region-history.json` maps each district to its region
   for every program year folded. Region pages read membership for the PY
   being viewed from it, and the district page says when a district changed
   region. The rankings row's own `region` is the fallback for a PY (or a
   district) the history has no entry for. */
import type { DistrictRegionHistory } from '@taverns-red/shared-contracts'
import { normaliseRegionId } from './regionId'

type History = DistrictRegionHistory | null | undefined
type HistoryEntry = DistrictRegionHistory['districts'][string]

/** One contiguous run of program years in the same region. */
export interface RegionRun {
  region: string
  firstProgramYear: string
  lastProgramYear: string
  /** True when the run reaches the history's newest program year. */
  ongoing: boolean
}

/** "01" and "1" are the same district; letters ("F", "U") match as-is. */
function canonicalDistrictId(id: string): string {
  const trimmed = id.trim().toUpperCase()
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed
}

const lookups = new WeakMap<DistrictRegionHistory, Map<string, HistoryEntry>>()

function entryFor(history: History, districtId: string): HistoryEntry | null {
  if (!history) return null
  let byId = lookups.get(history)
  if (!byId) {
    byId = new Map(
      Object.entries(history.districts).map(([id, entry]) => [
        canonicalDistrictId(id),
        entry,
      ])
    )
    lookups.set(history, byId)
  }
  return byId.get(canonicalDistrictId(districtId)) ?? null
}

/** The district's region in `programYear` ("2019-2020"), or null. */
export function regionOfDistrict(
  history: History,
  districtId: string,
  programYear: string
): string | null {
  const region = entryFor(history, districtId)?.byProgramYear[programYear]
  return region ? normaliseRegionId(region) : null
}

/** A row → region resolver for one program year: the history's mapping,
    else the row's own (normalised) region. */
export function regionMembershipFor(
  history: History,
  programYear: string
): (row: { districtId: string; region: string }) => string {
  return row =>
    regionOfDistrict(history, row.districtId, programYear) ??
    normaliseRegionId(row.region)
}

function regionRuns(history: History, districtId: string): RegionRun[] {
  const entry = entryFor(history, districtId)
  if (!history || !entry) return []
  const newest = history.programYears[history.programYears.length - 1]
  const years = Object.keys(entry.byProgramYear).sort()
  const runs: RegionRun[] = []
  for (const py of years) {
    const region = normaliseRegionId(entry.byProgramYear[py])
    const last = runs[runs.length - 1]
    if (last && last.region === region) last.lastProgramYear = py
    else
      runs.push({
        region,
        firstProgramYear: py,
        lastProgramYear: py,
        ongoing: false,
      })
  }
  for (const run of runs) run.ongoing = run.lastProgramYear === newest
  return runs
}

/** The district's runs in regions other than its `programYear` region,
    oldest first. Empty when the district never changed region. */
export function formerRegionRuns(
  history: History,
  districtId: string,
  programYear: string
): RegionRun[] {
  const runs = regionRuns(history, districtId)
  if (new Set(runs.map(r => r.region)).size < 2) return []
  const current = regionOfDistrict(history, districtId, programYear)
  return runs.filter(r => r.region !== current)
}

/** "2019-2020" → "2019-20". */
export function shortProgramYear(label: string): string {
  const m = /^(\d{4})-\d{2}(\d{2})$/.exec(label)
  return m ? `${m[1]}-${m[2]}` : label
}

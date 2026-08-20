/**
 * CEO Report oracle — decision logic tests (#1429, epic #1426).
 *
 * The TI CEO Report publishes five years of the exact totals our
 * calculators produce, so it is an external oracle for per-era rulesets
 * that were reconstructed from rule documents and never checked against a
 * published number (Lesson 160 — back-solve from what the system itself
 * published rather than trusting the documents).
 *
 * These tests pin the comparator's behaviour, not the numbers: the
 * published figures live once in `ceoReportOracle.ts` and every expectation
 * below is derived from that table, so a re-transcription cannot drift from
 * the tests silently.
 */

import { describe, it, expect } from 'vitest'
import {
  CEO_REPORT_FIGURES,
  CEO_REPORT_METRICS,
  CEO_REPORT_REPORT_DATE,
  CEO_REPORT_SOURCE_URL,
  compareToCeoReport,
  formatComparisonTable,
  splitDistrictTiers,
  type CeoReportFigures,
  type CeoReportMetric,
  type ComputedProgramYearTotals,
} from '../ceoReportOracle.js'

/** Districts that neither earned a tier nor are unknowable. */
const OTHER_DISTRICTS = 60

function figuresFor(programYear: string): CeoReportFigures {
  const row = CEO_REPORT_FIGURES.find(f => f.programYear === programYear)
  if (!row) throw new Error(`no published row for ${programYear}`)
  return row
}

/** The last published row — the only one carrying every metric. */
const LATEST = CEO_REPORT_FIGURES[CEO_REPORT_FIGURES.length - 1]!

/**
 * Computed totals that reproduce a published row exactly. Tests perturb
 * one field at a time from here, so every expectation is relative to the
 * oracle table rather than a second transcription of it.
 */
function computedMatching(
  figures: CeoReportFigures
): ComputedProgramYearTotals {
  return {
    programYear: figures.programYear,
    districtTiers: {
      Distinguished: figures.distinguishedDistricts,
      NotDistinguished: OTHER_DISTRICTS,
    },
    distinguishedClubs: figures.distinguishedClubs,
    selectDistinguishedClubs: figures.selectDistinguishedClubs,
    presidentsDistinguishedClubs: figures.presidentsDistinguishedClubs,
    ...(figures.smedleyDistinguishedClubs === undefined
      ? {}
      : { smedleyDistinguishedClubs: figures.smedleyDistinguishedClubs }),
    totalDistinguishedClubs: figures.totalDistinguishedClubs,
    paidClubs: figures.paidClubs,
  }
}

/** Every published year, computed to match. The all-green baseline. */
function allMatching(): ComputedProgramYearTotals[] {
  return CEO_REPORT_FIGURES.map(computedMatching)
}

function bumpMetric(
  computed: ComputedProgramYearTotals,
  metric: CeoReportMetric
): ComputedProgramYearTotals {
  if (metric === 'distinguishedDistricts') {
    return {
      ...computed,
      districtTiers: {
        ...computed.districtTiers,
        Distinguished: (computed.districtTiers.Distinguished ?? 0) + 1,
      },
    }
  }
  return { ...computed, [metric]: (computed[metric] ?? 0) + 1 }
}

describe('CEO_REPORT_FIGURES — the transcribed oracle table', () => {
  it('carries the report source URL and report date', () => {
    expect(CEO_REPORT_SOURCE_URL).toMatch(/^https:\/\/www\.toastmasters\.org\//)
    expect(CEO_REPORT_REPORT_DATE).toMatch(/^\d{4}-\d{2}$/)
  })

  it('publishes five consecutive program years in YYYY-YYYY form', () => {
    expect(CEO_REPORT_FIGURES).toHaveLength(5)
    for (const row of CEO_REPORT_FIGURES) {
      expect(row.programYear).toMatch(/^\d{4}-\d{4}$/)
    }
    const startYears = CEO_REPORT_FIGURES.map(f =>
      Number.parseInt(f.programYear.slice(0, 4), 10)
    )
    for (let i = 1; i < startYears.length; i++) {
      expect(startYears[i]).toBe(startYears[i - 1]! + 1)
      // "YYYY-YYYY" must be a single program year, not a span.
      const row = CEO_REPORT_FIGURES[i]!
      expect(row.programYear.slice(5)).toBe(String(startYears[i]! + 1))
    }
  })

  it("sums each row's club tiers to that row's published clubs total", () => {
    // Transcription guard: the report states the tiers and the total
    // independently, and they agree. A typo in any of the five numbers
    // breaks this identity.
    for (const row of CEO_REPORT_FIGURES) {
      const tierSum =
        row.distinguishedClubs +
        row.selectDistinguishedClubs +
        row.presidentsDistinguishedClubs +
        (row.smedleyDistinguishedClubs ?? 0)
      expect(tierSum).toBe(row.totalDistinguishedClubs)
    }
  })

  it('models Smedley as absent — never zero — before the tier existed', () => {
    const withSmedley = CEO_REPORT_FIGURES.filter(
      f => f.smedleyDistinguishedClubs !== undefined
    )
    expect(withSmedley).toHaveLength(1)
    expect(withSmedley[0]!.programYear).toBe(LATEST.programYear)
    for (const row of CEO_REPORT_FIGURES.slice(0, -1)) {
      expect(row.smedleyDistinguishedClubs).toBeUndefined()
      expect(row).not.toHaveProperty('smedleyDistinguishedClubs', 0)
    }
  })

  it('is frozen so no consumer can mutate the oracle', () => {
    expect(Object.isFrozen(CEO_REPORT_FIGURES)).toBe(true)
    for (const row of CEO_REPORT_FIGURES) {
      expect(Object.isFrozen(row)).toBe(true)
    }
  })
})

describe('splitDistrictTiers', () => {
  it('folds Unknown into neither side of the distinguished split', () => {
    // DistinguishedDistrictTier includes 'Unknown' for a district whose
    // required prerequisites are unknowable because that year's export
    // lacks the column (#1116 item 5). Counting it as not-distinguished
    // would make a real ruleset bug look like a data gap.
    const split = splitDistrictTiers({
      Distinguished: 10,
      Select: 5,
      Presidents: 3,
      Smedley: 2,
      NotDistinguished: 40,
      Unknown: 7,
    })

    expect(split.distinguished).toBe(20)
    expect(split.notDistinguished).toBe(40)
    expect(split.unknown).toBe(7)
    expect(split.total).toBe(67)
    // Explicitly: Unknown is in neither side.
    expect(split.distinguished + split.notDistinguished).toBe(60)
  })

  it('treats absent tiers as zero without inventing an Unknown bucket', () => {
    const split = splitDistrictTiers({ Distinguished: 4 })
    expect(split).toEqual({
      distinguished: 4,
      notDistinguished: 0,
      unknown: 0,
      total: 4,
    })
  })
})

describe('compareToCeoReport', () => {
  it('reports a distinguished-district mismatch with computed/published/delta', () => {
    const published = figuresFor('2024-2025')
    const short = {
      ...computedMatching(published),
      districtTiers: {
        Distinguished: published.distinguishedDistricts - 2,
        NotDistinguished: OTHER_DISTRICTS,
      },
    }
    const others = CEO_REPORT_FIGURES.filter(
      f => f.programYear !== published.programYear
    ).map(computedMatching)

    const result = compareToCeoReport([...others, short])

    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual({
      kind: 'mismatch',
      programYear: '2024-2025',
      metric: 'distinguishedDistricts',
      computed: published.distinguishedDistricts - 2,
      published: published.distinguishedDistricts,
      delta: -2,
    })
  })

  it('passes a year whose computed totals reproduce the published row', () => {
    const result = compareToCeoReport(allMatching())

    expect(result.ok).toBe(true)
    expect(result.findings).toEqual([])
    for (const year of result.years) {
      expect(year.noData).toBe(false)
      expect(year.findings).toEqual([])
      expect(year.metrics.every(m => m.status !== 'mismatch')).toBe(true)
    }
  })

  it('never folds Unknown districts into either side of the comparison', () => {
    const published = figuresFor('2023-2024')
    const withUnknowns: ComputedProgramYearTotals = {
      ...computedMatching(published),
      districtTiers: {
        Distinguished: published.distinguishedDistricts,
        NotDistinguished: OTHER_DISTRICTS,
        Unknown: 5,
      },
    }

    const result = compareToCeoReport([withUnknowns])
    const year = result.years.find(y => y.programYear === '2023-2024')!

    // The distinguished count still matches — the Unknowns went nowhere
    // near it, and they did not inflate the not-distinguished side either.
    expect(year.districts).toEqual({
      distinguished: published.distinguishedDistricts,
      notDistinguished: OTHER_DISTRICTS,
      unknown: 5,
      total: published.distinguishedDistricts + OTHER_DISTRICTS + 5,
    })
    const districtsRow = year.metrics.find(
      m => m.metric === 'distinguishedDistricts'
    )!
    expect(districtsRow.status).toBe('match')
    expect(districtsRow.computed).toBe(published.distinguishedDistricts)
  })

  it('reports a program year absent from the archive as noData, not a mismatch', () => {
    // 2021-22 may be genuinely absent (HistoryPage calls it the COVID gap)
    // — a missing year must never be reported as a scoring failure.
    const supplied = CEO_REPORT_FIGURES.filter(
      f => f.programYear !== '2021-2022'
    ).map(computedMatching)

    const result = compareToCeoReport(supplied)
    const year = result.years.find(y => y.programYear === '2021-2022')!

    expect(year.noData).toBe(true)
    expect(year.findings).toEqual([
      { kind: 'noData', programYear: '2021-2022' },
    ])
    expect(result.findings.filter(f => f.kind === 'mismatch')).toHaveLength(0)
    expect(year.metrics.every(m => m.computed === undefined)).toBe(true)
  })

  it('distinguishes a computed zero from a missing year', () => {
    const published = figuresFor('2021-2022')
    const zeroed: ComputedProgramYearTotals = {
      programYear: published.programYear,
      districtTiers: {},
      distinguishedClubs: 0,
      selectDistinguishedClubs: 0,
      presidentsDistinguishedClubs: 0,
      totalDistinguishedClubs: 0,
      paidClubs: 0,
    }

    const result = compareToCeoReport([zeroed])
    const year = result.years.find(y => y.programYear === '2021-2022')!

    expect(year.noData).toBe(false)
    expect(year.findings.some(f => f.kind === 'noData')).toBe(false)
    expect(year.findings).toContainEqual({
      kind: 'mismatch',
      programYear: '2021-2022',
      metric: 'distinguishedDistricts',
      computed: 0,
      published: published.distinguishedDistricts,
      delta: -published.distinguishedDistricts,
    })
  })

  it('flags computed tier counts that do not sum to the computed total', () => {
    // Independent of the published comparison: the four tiers are counted
    // per letter code and the total is counted separately, so an
    // unrecognised status code shows up here and nowhere else.
    const published = LATEST
    const skewed: ComputedProgramYearTotals = {
      ...computedMatching(published),
      totalDistinguishedClubs: published.totalDistinguishedClubs + 3,
    }

    const result = compareToCeoReport([skewed])
    const year = result.years.find(
      y => y.programYear === published.programYear
    )!

    expect(year.findings).toContainEqual({
      kind: 'tierSumMismatch',
      programYear: published.programYear,
      tierSum: published.totalDistinguishedClubs,
      computedTotal: published.totalDistinguishedClubs + 3,
      delta: 3,
    })
    expect(result.ok).toBe(false)
  })

  it('checks every metric the report publishes, not just the headline count', () => {
    // A sentinel keyed on one field cannot detect drift in any other.
    for (const metric of CEO_REPORT_METRICS) {
      const perturbed = bumpMetric(computedMatching(LATEST), metric)
      const result = compareToCeoReport([perturbed])

      const mismatches = result.findings.filter(
        f => f.kind === 'mismatch' && f.metric === metric
      )
      expect(
        mismatches,
        `no mismatch reported for metric ${metric}`
      ).toHaveLength(1)
      expect(result.ok).toBe(false)
    }
  })

  it('reports a published metric the computed totals omit', () => {
    const partial: ComputedProgramYearTotals = computedMatching(LATEST)
    delete (partial as { smedleyDistinguishedClubs?: number })
      .smedleyDistinguishedClubs

    const result = compareToCeoReport([partial])
    const year = result.years.find(y => y.programYear === LATEST.programYear)!

    expect(year.findings).toContainEqual({
      kind: 'missingMetric',
      programYear: LATEST.programYear,
      metric: 'smedleyDistinguishedClubs',
      published: LATEST.smedleyDistinguishedClubs!,
    })
    expect(year.noData).toBe(false)
  })

  it('flags a computed Smedley count in a year the tier did not exist', () => {
    const published = figuresFor('2022-2023')
    const early: ComputedProgramYearTotals = {
      ...computedMatching(published),
      smedleyDistinguishedClubs: 12,
      totalDistinguishedClubs: published.totalDistinguishedClubs + 12,
    }

    const result = compareToCeoReport([early])
    const year = result.years.find(y => y.programYear === '2022-2023')!

    expect(year.findings).toContainEqual({
      kind: 'unpublishedMetric',
      programYear: '2022-2023',
      metric: 'smedleyDistinguishedClubs',
      computed: 12,
    })
  })

  it('does not flag an absent Smedley count in a year the tier did not exist', () => {
    const result = compareToCeoReport([
      computedMatching(figuresFor('2022-2023')),
    ])
    const year = result.years.find(y => y.programYear === '2022-2023')!

    expect(year.findings).toEqual([])
    const smedleyRow = year.metrics.find(
      m => m.metric === 'smedleyDistinguishedClubs'
    )!
    expect(smedleyRow.status).toBe('notApplicable')
    expect(smedleyRow.published).toBeUndefined()
    expect(smedleyRow.computed).toBeUndefined()
  })

  it('ignores computed years the report does not publish', () => {
    const extra: ComputedProgramYearTotals = {
      ...computedMatching(LATEST),
      programYear: '2019-2020',
    }

    const result = compareToCeoReport([...allMatching(), extra])

    expect(result.ok).toBe(true)
    expect(result.years.map(y => y.programYear)).toEqual(
      CEO_REPORT_FIGURES.map(f => f.programYear)
    )
  })

  it('is pure — the same input compares identically twice and mutates nothing', () => {
    const input = allMatching()
    const before = JSON.stringify(input)
    const first = compareToCeoReport(input)
    const second = compareToCeoReport(input)

    expect(JSON.stringify(input)).toBe(before)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('echoes the oracle provenance on the result', () => {
    const result = compareToCeoReport([])
    expect(result.source).toEqual({
      url: CEO_REPORT_SOURCE_URL,
      reportDate: CEO_REPORT_REPORT_DATE,
    })
  })
})

describe('formatComparisonTable', () => {
  it('prints one row per published year and metric with the source header', () => {
    const table = formatComparisonTable(compareToCeoReport(allMatching()))

    expect(table).toContain(CEO_REPORT_SOURCE_URL)
    for (const row of CEO_REPORT_FIGURES) {
      expect(table).toContain(row.programYear)
    }
    for (const metric of CEO_REPORT_METRICS) {
      expect(table).toContain(metric)
    }
  })

  it('marks a missing year as no data and a mismatch as a mismatch', () => {
    const supplied = CEO_REPORT_FIGURES.filter(
      f => f.programYear !== '2021-2022'
    ).map(computedMatching)
    const short = supplied.map(c =>
      c.programYear === '2024-2025' ? bumpMetric(c, 'paidClubs') : c
    )

    const table = formatComparisonTable(compareToCeoReport(short))

    expect(table).toMatch(/2021-2022.*no data/s)
    expect(table).toContain('MISMATCH')
    // Unknown-tier districts are surfaced in the table, never hidden.
    expect(table.toLowerCase()).toContain('unknown')
  })
})

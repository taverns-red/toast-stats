/**
 * CEO Report oracle — pure comparison logic (#1429, epic #1426).
 *
 * `DistinguishedDistrictCalculator` scores historical program years under
 * four per-era rulesets that were reconstructed from TI rule documents and
 * have never been checked against an externally published count. The TI CEO
 * Report publishes five years of exactly the totals our calculators produce,
 * so it is a free external oracle: run our code over the year-end snapshots,
 * diff against the published numbers, and either the rulesets are confirmed
 * or we have found a real scoring bug in data users already see (Lesson 160 —
 * back-solve from numbers the system itself published, rather than trusting
 * rule documents).
 *
 * **Source:** TI CEO Report, August 2026 —
 * <https://www.toastmasters.org/about/world-headquarters/ceo-reports>
 *
 * **What the table below is.** The encoded values are the report's **chart
 * labels**, transcribed and then independently re-verified against the source
 * PDF (tier mapping checked geometrically — legend swatch colours sampled and
 * each stacked segment's pixel height back-solved against its bar total —
 * not by label position). Distinguished / Select / President's / Smedley is
 * the correct top-to-bottom order, and only 2025-2026 has a fourth segment.
 * Every row here sums exactly and is internally consistent.
 *
 * **Do not "fix" these values against the report's prose.** The report's own
 * prose disagrees with its own chart labels in two *unrelated* places:
 * the six 2025-26 education-award bars sum to 101,915 while the prose says
 * 101,916, and the membership-building awards sum to 3,564 while the prose
 * says 3,567 (there the chart labels are the likelier truth — 3,564 against
 * the prior year's 3,421 gives the +4.2% the report itself prints). Neither
 * discrepancy touches the distinguished-district counts, the club tiers, the
 * club totals or the paid-club counts encoded here.
 *
 * Smedley Distinguished exists only from 2025-2026 — it is modelled as
 * **absent** for earlier years, never as zero, so a 5-year series renders it
 * as starting that year rather than as a flat run of zeros.
 *
 * Purity: no I/O of any kind lives here — no network, no filesystem, no GCS —
 * and the only analytics-core dependency is the `DistinguishedDistrictTier`
 * *type*. The runner (scripts/validate-vs-ceo-report.ts) reads snapshots and
 * computes the totals; this module only decides what the diff means.
 */

import type { DistinguishedDistrictTier } from '../../packages/analytics-core/src/rankings/DistinguishedDistrictCalculator.js'

/** Where the published figures come from. */
export const CEO_REPORT_SOURCE_URL =
  'https://www.toastmasters.org/about/world-headquarters/ceo-reports'

/** The edition of the report the figures were transcribed from (YYYY-MM). */
export const CEO_REPORT_REPORT_DATE = '2026-08'

/** One published row of the report's Numeric Snapshots section. */
export interface CeoReportFigures {
  /** Program year in "YYYY-YYYY" form, e.g. "2024-2025". */
  readonly programYear: string
  /** Districts recognised as Distinguished or better. */
  readonly distinguishedDistricts: number
  /** Clubs at the Distinguished (D) tier only. */
  readonly distinguishedClubs: number
  /** Clubs at the Select Distinguished (S) tier only. */
  readonly selectDistinguishedClubs: number
  /** Clubs at the President's Distinguished (P) tier only. */
  readonly presidentsDistinguishedClubs: number
  /**
   * Clubs at the Smedley Distinguished (M) tier only. ABSENT — not zero —
   * for program years before 2025-2026, when the tier did not exist.
   */
  readonly smedleyDistinguishedClubs?: number
  /** Clubs distinguished or better, all tiers. */
  readonly totalDistinguishedClubs: number
  /** Paid clubs as of June 30. */
  readonly paidClubs: number
}

/**
 * The published figures. Chart labels from the August 2026 CEO Report,
 * independently re-verified — see the file header before editing.
 */
export const CEO_REPORT_FIGURES: readonly CeoReportFigures[] = Object.freeze([
  Object.freeze({
    programYear: '2021-2022',
    distinguishedDistricts: 8,
    distinguishedClubs: 974,
    selectDistinguishedClubs: 995,
    presidentsDistinguishedClubs: 3758,
    totalDistinguishedClubs: 5727,
    paidClubs: 14749,
  }),
  Object.freeze({
    programYear: '2022-2023',
    distinguishedDistricts: 18,
    distinguishedClubs: 1598,
    selectDistinguishedClubs: 1260,
    presidentsDistinguishedClubs: 3604,
    totalDistinguishedClubs: 6462,
    paidClubs: 14271,
  }),
  Object.freeze({
    programYear: '2023-2024',
    distinguishedDistricts: 33,
    distinguishedClubs: 1523,
    selectDistinguishedClubs: 1207,
    presidentsDistinguishedClubs: 3656,
    totalDistinguishedClubs: 6386,
    paidClubs: 13846,
  }),
  Object.freeze({
    programYear: '2024-2025',
    distinguishedDistricts: 37,
    distinguishedClubs: 1827,
    selectDistinguishedClubs: 1274,
    presidentsDistinguishedClubs: 3636,
    totalDistinguishedClubs: 6737,
    paidClubs: 13833,
  }),
  Object.freeze({
    programYear: '2025-2026',
    distinguishedDistricts: 42,
    distinguishedClubs: 2349,
    selectDistinguishedClubs: 1037,
    presidentsDistinguishedClubs: 1289,
    smedleyDistinguishedClubs: 1912,
    totalDistinguishedClubs: 6587,
    paidClubs: 13708,
  }),
])

/**
 * Every metric the report publishes. A sentinel keyed on one field cannot
 * detect drift in any other, so the comparison covers all of them — not
 * just the headline distinguished-district count.
 */
export const CEO_REPORT_METRICS = [
  'distinguishedDistricts',
  'distinguishedClubs',
  'selectDistinguishedClubs',
  'presidentsDistinguishedClubs',
  'smedleyDistinguishedClubs',
  'totalDistinguishedClubs',
  'paidClubs',
] as const

export type CeoReportMetric = (typeof CEO_REPORT_METRICS)[number]

/**
 * Membership payments as of June 30, as published in the report's Numeric
 * Snapshots table. Transcribed from the same August 2026 edition as
 * `CEO_REPORT_FIGURES` — see `CEO_REPORT_SOURCE_URL`.
 *
 * Deliberately NOT part of `CeoReportFigures`: the oracle compares what
 * `DistinguishedDistrictCalculator` and the rankings produce, and payments are
 * not one of those metrics — adding a row here must not widen the oracle's
 * verdict. It exists so the worldwide rollup (#1426) has an EXTERNAL expected
 * value: #1466's guard asserts against TI's published figure, never against
 * our own output.
 */
export const CEO_REPORT_MEMBERSHIP_PAYMENTS: Readonly<Record<string, number>> =
  Object.freeze({
    '2021-2022': 563443,
    '2022-2023': 549636,
    '2023-2024': 557370,
    '2024-2025': 549007,
    '2025-2026': 548483,
  })

/** The per-tier club metrics that must add up to the total. */
const CLUB_TIER_METRICS = [
  'distinguishedClubs',
  'selectDistinguishedClubs',
  'presidentsDistinguishedClubs',
  'smedleyDistinguishedClubs',
] as const satisfies readonly CeoReportMetric[]

/** District counts per Distinguished-District tier, as the calculator scores them. */
export type DistrictTierCounts = Readonly<
  Partial<Record<DistinguishedDistrictTier, number>>
>

/** What one program year's snapshots computed, for comparison. */
export interface ComputedProgramYearTotals {
  /** Program year in "YYYY-YYYY" form. */
  readonly programYear: string
  /**
   * Districts per scored tier. `Unknown` districts (that year's export
   * lacks a required prerequisite column, #1116 item 5) belong here and are
   * folded into NEITHER side of the distinguished split.
   */
  readonly districtTiers: DistrictTierCounts
  readonly distinguishedClubs: number
  readonly selectDistinguishedClubs: number
  readonly presidentsDistinguishedClubs: number
  /** Absent when the snapshot predates the Smedley tier — never zero. */
  readonly smedleyDistinguishedClubs?: number
  /**
   * Clubs distinguished or better, counted INDEPENDENTLY of the four tier
   * counts (so the two can be cross-checked — an unrecognised status code
   * shows up as a tier-sum finding and nowhere else).
   */
  readonly totalDistinguishedClubs: number
  readonly paidClubs: number
}

/** The distinguished / not-distinguished / unknown split of a tier tally. */
export interface DistrictTierSplit {
  /** Distinguished, Select, President's or Smedley. */
  distinguished: number
  /** Explicitly NotDistinguished. */
  notDistinguished: number
  /** Unknowable from that year's export — neither side. */
  unknown: number
  /** Every district scored, all three buckets. */
  total: number
}

export type CeoReportFinding =
  /** The program year is absent from the computed input entirely. */
  | { kind: 'noData'; programYear: string }
  /** Computed and published both exist and disagree. */
  | {
      kind: 'mismatch'
      programYear: string
      metric: CeoReportMetric
      computed: number
      published: number
      delta: number
    }
  /** The report publishes this metric but the computed totals omit it. */
  | {
      kind: 'missingMetric'
      programYear: string
      metric: CeoReportMetric
      published: number
    }
  /** We computed a non-zero value for a metric the report does not publish. */
  | {
      kind: 'unpublishedMetric'
      programYear: string
      metric: CeoReportMetric
      computed: number
    }
  /** The computed tier counts do not add up to the computed total. */
  | {
      kind: 'tierSumMismatch'
      programYear: string
      tierSum: number
      computedTotal: number
      delta: number
    }

export type MetricStatus =
  'match' | 'mismatch' | 'missing' | 'unpublished' | 'notApplicable' | 'noData'

export interface MetricComparison {
  metric: CeoReportMetric
  published?: number
  computed?: number
  /** computed − published, present only when both sides exist. */
  delta?: number
  status: MetricStatus
}

export interface ProgramYearComparison {
  programYear: string
  /** True when the program year is absent from the computed input. */
  noData: boolean
  /** The district tier split, absent for a noData year. */
  districts?: DistrictTierSplit
  metrics: MetricComparison[]
  findings: CeoReportFinding[]
}

export interface CeoReportComparison {
  /** True only when there are no findings at all. */
  ok: boolean
  source: { url: string; reportDate: string }
  /** One entry per PUBLISHED program year, in report order. */
  years: ProgramYearComparison[]
  /** Every year's findings, flattened in year order. */
  findings: CeoReportFinding[]
}

/**
 * Split a per-tier district tally into distinguished / not-distinguished /
 * unknown.
 *
 * `Unknown` means the district's metrics earned a tier but a prerequisite
 * that year's rules REQUIRE is unknowable because the export lacks the
 * column (#1116 item 5). It is counted on its own and folded into neither
 * side: silently treating it as not-distinguished would make a real ruleset
 * bug look like a data gap (and vice versa).
 */
export function splitDistrictTiers(
  tiers: DistrictTierCounts
): DistrictTierSplit {
  const at = (tier: DistinguishedDistrictTier): number => tiers[tier] ?? 0
  const distinguished =
    at('Distinguished') + at('Select') + at('Presidents') + at('Smedley')
  const notDistinguished = at('NotDistinguished')
  const unknown = at('Unknown')

  return {
    distinguished,
    notDistinguished,
    unknown,
    total: distinguished + notDistinguished + unknown,
  }
}

function computedValueFor(
  metric: CeoReportMetric,
  computed: ComputedProgramYearTotals,
  split: DistrictTierSplit
): number | undefined {
  if (metric === 'distinguishedDistricts') return split.distinguished
  return computed[metric]
}

function compareOneYear(
  published: CeoReportFigures,
  computed: ComputedProgramYearTotals | undefined
): ProgramYearComparison {
  const { programYear } = published

  if (!computed) {
    // A year missing from the archive is "no data" — NEVER a scoring
    // failure. 2021-22 may be genuinely absent (the COVID gap), and a
    // missing year reported as a mismatch would manufacture a bug.
    return {
      programYear,
      noData: true,
      metrics: CEO_REPORT_METRICS.map(metric => ({
        metric,
        published: published[metric],
        status: 'noData' as const,
      })),
      findings: [{ kind: 'noData', programYear }],
    }
  }

  const districts = splitDistrictTiers(computed.districtTiers)
  const metrics: MetricComparison[] = []
  const findings: CeoReportFinding[] = []

  for (const metric of CEO_REPORT_METRICS) {
    const publishedValue = published[metric]
    const computedValue = computedValueFor(metric, computed, districts)

    if (publishedValue === undefined && computedValue === undefined) {
      // e.g. Smedley before the tier existed: absent on both sides.
      metrics.push({ metric, status: 'notApplicable' })
      continue
    }

    if (publishedValue === undefined) {
      // Computed a value the report does not publish for this year. Zero is
      // benign (a tier that did not exist counts nothing); anything else is
      // a finding.
      const value = computedValue as number
      if (value === 0) {
        metrics.push({ metric, computed: 0, status: 'notApplicable' })
        continue
      }
      metrics.push({ metric, computed: value, status: 'unpublished' })
      findings.push({
        kind: 'unpublishedMetric',
        programYear,
        metric,
        computed: value,
      })
      continue
    }

    if (computedValue === undefined) {
      metrics.push({ metric, published: publishedValue, status: 'missing' })
      findings.push({
        kind: 'missingMetric',
        programYear,
        metric,
        published: publishedValue,
      })
      continue
    }

    const delta = computedValue - publishedValue
    metrics.push({
      metric,
      published: publishedValue,
      computed: computedValue,
      delta,
      status: delta === 0 ? 'match' : 'mismatch',
    })
    if (delta !== 0) {
      findings.push({
        kind: 'mismatch',
        programYear,
        metric,
        computed: computedValue,
        published: publishedValue,
        delta,
      })
    }
  }

  // Internal consistency of the computed side, independent of the published
  // comparison: the per-tier counts must add up to the independently
  // counted total.
  const tierSum = CLUB_TIER_METRICS.reduce(
    (sum, metric) => sum + (computed[metric] ?? 0),
    0
  )
  if (tierSum !== computed.totalDistinguishedClubs) {
    findings.push({
      kind: 'tierSumMismatch',
      programYear,
      tierSum,
      computedTotal: computed.totalDistinguishedClubs,
      delta: computed.totalDistinguishedClubs - tierSum,
    })
  }

  return { programYear, noData: false, districts, metrics, findings }
}

/**
 * Compare computed program-year totals against the published CEO Report
 * figures.
 *
 * One entry per PUBLISHED year, in report order — computed years the report
 * does not cover are ignored (the report is the oracle; years outside its
 * window have nothing to be checked against). Pure: no I/O, no mutation of
 * the input.
 */
export function compareToCeoReport(
  computed: readonly ComputedProgramYearTotals[]
): CeoReportComparison {
  const byProgramYear = new Map(computed.map(c => [c.programYear, c]))

  const years = CEO_REPORT_FIGURES.map(published =>
    compareOneYear(published, byProgramYear.get(published.programYear))
  )
  const findings = years.flatMap(year => year.findings)

  return {
    ok: findings.length === 0,
    source: { url: CEO_REPORT_SOURCE_URL, reportDate: CEO_REPORT_REPORT_DATE },
    years,
    findings,
  }
}

const STATUS_LABEL: Record<MetricStatus, string> = {
  match: 'match',
  mismatch: 'MISMATCH',
  missing: 'MISSING (not computed)',
  unpublished: 'UNPUBLISHED (not in report)',
  notApplicable: 'n/a',
  noData: 'no data',
}

function pad(value: string, width: number): string {
  return value.padEnd(width)
}

function padStart(value: string, width: number): string {
  return value.padStart(width)
}

function num(value: number | undefined): string {
  return value === undefined ? '–' : value.toLocaleString('en-US')
}

function signed(value: number | undefined): string {
  if (value === undefined) return '–'
  return value > 0 ? `+${value.toLocaleString('en-US')}` : num(value)
}

const METRIC_WIDTH = Math.max(...CEO_REPORT_METRICS.map(m => m.length))

/**
 * Render a per-year table of the comparison — printed whether or not the
 * comparison passed, so a run always shows its work.
 */
export function formatComparisonTable(comparison: CeoReportComparison): string {
  const lines: string[] = [
    'CEO Report oracle — computed vs published',
    `Source: ${comparison.source.url} (report ${comparison.source.reportDate})`,
    '',
  ]

  for (const year of comparison.years) {
    if (year.noData) {
      lines.push(
        `${year.programYear} — no data (program year absent from the computed input)`
      )
    } else {
      const d = year.districts!
      lines.push(
        `${year.programYear} — districts: ${d.distinguished} distinguished · ` +
          `${d.notDistinguished} not distinguished · ${d.unknown} unknown ` +
          `(${d.total} scored)`
      )
    }

    lines.push(
      `  ${pad('metric', METRIC_WIDTH)} ${padStart('published', 10)} ` +
        `${padStart('computed', 10)} ${padStart('delta', 8)}  status`
    )
    for (const metric of year.metrics) {
      lines.push(
        `  ${pad(metric.metric, METRIC_WIDTH)} ` +
          `${padStart(num(metric.published), 10)} ` +
          `${padStart(num(metric.computed), 10)} ` +
          `${padStart(signed(metric.delta), 8)}  ${STATUS_LABEL[metric.status]}`
      )
    }

    for (const finding of year.findings) {
      if (finding.kind === 'tierSumMismatch') {
        lines.push(
          `  ! tier counts sum to ${finding.tierSum} but ${finding.computedTotal} ` +
            `clubs are distinguished or better (delta ${signed(finding.delta)})`
        )
      }
    }
    lines.push('')
  }

  const mismatches = comparison.findings.filter(f => f.kind === 'mismatch')
  const noData = comparison.findings.filter(f => f.kind === 'noData')
  lines.push(
    comparison.ok
      ? 'RESULT: every published figure reproduced.'
      : `RESULT: ${comparison.findings.length} finding(s) — ` +
          `${mismatches.length} mismatch(es), ${noData.length} year(s) with no data.`
  )

  return lines.join('\n')
}

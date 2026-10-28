/**
 * TI's daily-reports vocabulary (#2012): how the free-text cells of
 * `snapshots/{date}/district_{id}_reports.json` read as states.
 *
 * One home for the rules, so the frontend's per-district views (club growth
 * funnel #1794, compliance #1954) and the pipeline's region/world rollups
 * (`reports-rollups.json`) cannot read the same cell two ways — a region
 * total must equal the district pages it sums.
 *
 * Recorded live vocabulary (D61, prod 2026-10-15):
 * - Prospect: `#1 Application to Organize Complete - 04/15/2025`, then any
 *   further steps reached (`#4 Officer Info Incomplete - 08/03/2026`, #2142),
 *   followed, with no separator once the `<br>` is stripped, by `Payment
 *   Complete - 04/19/2025` or `Payment Incomplete`.
 * - Dues renewal: `Verified complete - 08/03/2026`, `**Renewals not here**`,
 *   `Low - Minimum requirement not yet met`, `Ineligible - Minimum
 *   requirement not yet met`.
 * - Sponsors & mentors codes: `SPONSOR`, `MENTOR`, `MENTORU` (`SPONSORU` by
 *   the same rule).
 * Text outside the vocabulary is kept as "unrecognised" / "other", never
 * guessed at.
 *
 * @module reportsVocabulary
 */

const US_DATE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/

/** MM/DD/YYYY → YYYY-MM-DD, or null when the text holds no such date. */
export function usDateToIso(text: string): string | null {
  const m = US_DATE.exec(text)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  return `${yyyy}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`
}

export type ParsedProspectStage =
  | {
      recognised: true
      stageNumber: number
      stageLabel: string
      /** ISO date the stage was completed, when TI prints one. */
      stageDate: string | null
      payment: 'complete' | 'incomplete' | 'unknown'
      paymentDate: string | null
      raw: string
    }
  | { recognised: false; raw: string }

interface ProspectStep {
  stageNumber: number
  stageLabel: string
  stageDate: string | null
}

/**
 * One `#N <label>[ Complete|Incomplete][ - MM/DD/YYYY]` step, read with
 * string operations: a single backtracking regex over this cell is polynomial
 * on runs of whitespace (CodeQL js/polynomial-redos).
 */
function parseProspectStep(step: string): ProspectStep | null {
  const head = /^#(\d+)\s/.exec(step)
  if (!head) return null
  let label = step.slice(head[0].length).trim()
  const dash = label.lastIndexOf('-')
  if (
    dash >= 0 &&
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(label.slice(dash + 1).trim())
  ) {
    label = label.slice(0, dash).trim()
  }
  for (const suffix of [' Complete', ' Incomplete']) {
    if (label.endsWith(suffix)) {
      label = label.slice(0, -suffix.length).trim()
      break
    }
  }
  if (label === '') return null
  return {
    stageNumber: Number(head[1]),
    stageLabel: label,
    stageDate: usDateToIso(step),
  }
}

/**
 * Parse TI's "Prospect" cell. Text that does not start with `#N` is returned
 * raw rather than guessed at.
 *
 * TI lists every step a prospect has reached in the one cell, run together
 * once the `<br>` is stripped (#2142, prod 2026-10-18):
 * `#1 Application to Organize Complete - 07/16/2025#4 Officer Info Complete -
 * 07/16/2025Payment Complete - 07/18/2025`. The furthest (highest-numbered)
 * step is the club's current stage.
 */
export function parseProspectStage(text: string): ParsedProspectStage {
  const raw = text
  const paymentAt = text.search(/Payment\b/)
  const stagePart = (paymentAt >= 0 ? text.slice(0, paymentAt) : text).trim()
  const paymentPart = paymentAt >= 0 ? text.slice(paymentAt) : ''

  if (!/^#\d+\s/.test(stagePart)) return { recognised: false, raw }
  const starts: number[] = []
  for (const m of stagePart.matchAll(/#\d+\s/g)) starts.push(m.index)
  let current: ProspectStep | null = null
  for (let i = 0; i < starts.length; i++) {
    const step = parseProspectStep(
      stagePart.slice(starts[i], starts[i + 1] ?? stagePart.length).trim()
    )
    if (step && (!current || step.stageNumber >= current.stageNumber)) {
      current = step
    }
  }
  if (!current) return { recognised: false, raw }

  let payment: 'complete' | 'incomplete' | 'unknown' = 'unknown'
  let paymentDate: string | null = null
  if (/^Payment\s+Complete/.test(paymentPart)) {
    payment = 'complete'
    paymentDate = usDateToIso(paymentPart)
  } else if (/^Payment\s+Incomplete/.test(paymentPart)) {
    payment = 'incomplete'
  }

  return { recognised: true, ...current, payment, paymentDate, raw }
}

// ─── The prospect checklist (#2303, #2388) ──────────────────────────────────

/** TI's charter steps, in TI's numbering (recorded vocabulary, #2142). */
export const PROSPECT_CHECKLIST_STEPS: readonly {
  number: number
  label: string
}[] = [
  { number: 1, label: 'Application to Organize' },
  { number: 2, label: 'Certificate & Remit' },
  { number: 3, label: 'Roster' },
  { number: 4, label: 'Officer Info' },
  { number: 5, label: 'Club Info' },
  { number: 6, label: 'Constitution & Bylaws' },
]

export type ProspectChecklistStatus = 'complete' | 'incomplete' | 'not-listed'

export interface ProspectChecklistItem {
  /** `1`–`6`, or `payment`. */
  key: string
  /** TI's step name. */
  label: string
  /** The step number TI prints (`#N`); null for Payment. */
  number: number | null
  status: ProspectChecklistStatus
  /** ISO date the step last changed (not when it completed), when printed. */
  date: string | null
}

function checklistStatus(text: string): 'complete' | 'incomplete' | null {
  // "Incomplete" contains "complete", so test it first.
  if (/\bIncomplete\b/.test(text)) return 'incomplete'
  if (/\bComplete\b/.test(text)) return 'complete'
  return null
}

function checklistItem(
  key: string,
  label: string,
  number: number | null,
  text: string | undefined
): ProspectChecklistItem {
  const status = text === undefined ? null : checklistStatus(text)
  return {
    key,
    label,
    number,
    status: status ?? 'not-listed',
    date: status && text !== undefined ? usDateToIso(text) : null,
  }
}

/**
 * Read TI's `Prospect` cell as the full checklist: steps #1–#6 and Payment,
 * each Complete, Incomplete or not listed, with the date it last changed.
 *
 * TI's cell is a checklist, not a ladder (spike 2026-10-28, D25/D84): steps
 * complete out of order, and a step can go back to Incomplete, so a step's
 * date is when it last changed. Null for text that does not start with `#N`.
 * String operations only — a backtracking regex over this cell is polynomial
 * on whitespace runs.
 */
export function parseProspectChecklist(
  text: string
): ProspectChecklistItem[] | null {
  const paymentAt = text.search(/Payment\b/)
  const stepPart = (paymentAt >= 0 ? text.slice(0, paymentAt) : text).trim()
  const paymentPart = paymentAt >= 0 ? text.slice(paymentAt) : undefined
  if (!/^#\d+\s/.test(stepPart)) return null

  const starts: number[] = []
  for (const m of stepPart.matchAll(/#\d+\s/g)) starts.push(m.index)
  const byNumber = new Map<number, string>()
  for (let i = 0; i < starts.length; i++) {
    const segment = stepPart.slice(starts[i], starts[i + 1] ?? stepPart.length)
    const n = Number(/^#(\d+)/.exec(segment)![1])
    if (!byNumber.has(n)) byNumber.set(n, segment)
  }

  return [
    ...PROSPECT_CHECKLIST_STEPS.map(s =>
      checklistItem(String(s.number), s.label, s.number, byNumber.get(s.number))
    ),
    checklistItem('payment', 'Payment', null, paymentPart),
  ]
}

/** The step a prospective club is waiting on (#2388). */
export interface ProspectWaitingOn {
  number: number
  label: string
  /** false: TI does not list the step yet. */
  listed: boolean
  /**
   * The step's own last-changed date; for a step TI does not list (or lists
   * without a date), the checklist's most recent step date (Ron, 2026-10-28).
   */
  since: string | null
}

export type ProspectProgress =
  | {
      recognised: true
      /** Steps #1–#6 TI marks Complete, in any order. */
      stepsComplete: number
      stepsTotal: number
      /** The oldest incomplete step; null when all six are complete. */
      waitingOn: ProspectWaitingOn | null
      /** The most recent step date in the checklist (Payment excluded). */
      lastChanged: string | null
      payment: 'complete' | 'incomplete' | 'unknown'
      paymentDate: string | null
    }
  | { recognised: false; raw: string }

/**
 * A prospective club's progress on TI's checklist (#2388): how many of the
 * six steps are complete, and the step it has waited on longest — the
 * incomplete step with the oldest last-changed date, ties to the lowest
 * number. A step TI does not list yet, or lists without a date, counts from
 * the checklist's most recent step date. One reading for the district funnel
 * and the region/world rollups, so their totals reconcile.
 */
export function prospectProgress(text: string): ProspectProgress {
  const checklist = parseProspectChecklist(text)
  const steps = (checklist ?? []).filter(s => s.number !== null)
  if (!checklist || steps.every(s => s.status === 'not-listed')) {
    return { recognised: false, raw: text }
  }
  const pay = checklist[checklist.length - 1] as ProspectChecklistItem

  let lastChanged: string | null = null
  for (const s of steps) {
    if (s.date !== null && (lastChanged === null || s.date > lastChanged)) {
      lastChanged = s.date
    }
  }

  let waitingOn: ProspectWaitingOn | null = null
  for (const s of steps) {
    if (s.status === 'complete') continue
    const since = s.date ?? lastChanged
    const older =
      waitingOn === null ||
      (since !== null && (waitingOn.since === null || since < waitingOn.since))
    if (older) {
      waitingOn = {
        number: s.number as number,
        label: s.label,
        listed: s.status !== 'not-listed',
        since,
      }
    }
  }

  return {
    recognised: true,
    stepsComplete: steps.filter(s => s.status === 'complete').length,
    stepsTotal: steps.length,
    waitingOn,
    lastChanged,
    payment: pay.status === 'not-listed' ? 'unknown' : pay.status,
    paymentDate: pay.status === 'complete' ? pay.date : null,
  }
}

export type SponsorMentorRole = 'sponsors' | 'mentors' | 'other'

/**
 * TI's New Club Sponsors & Mentors codes → role. A trailing U (`SPONSORU`,
 * `MENTORU`) marks a credit the member already used toward a DTM (confirmed
 * by Ron on PR #2065); the role is the same, so it counts the same.
 */
const SPONSOR_MENTOR_ROLES: Readonly<Record<string, SponsorMentorRole>> = {
  SPONSOR: 'sponsors',
  SPONSORU: 'sponsors',
  MENTOR: 'mentors',
  MENTORU: 'mentors',
}

/** The role of a sponsors/mentors code; any unlisted code is 'other'. */
export function sponsorMentorRole(code: string): SponsorMentorRole {
  return SPONSOR_MENTOR_ROLES[code.trim().toUpperCase()] ?? 'other'
}

export type DuesRenewalState =
  'verified' | 'notReceived' | 'low' | 'ineligible' | 'notYetDue' | 'other'

/**
 * One club's dues-renewal state for a period. A "Verified complete" record
 * counts for this program year only if it was verified inside the window
 * that period's payments fall in (October: from 1 June of the PY's first
 * year; April: from 1 December) — the report keeps last period's
 * verification until the new one arrives (D61, October 2026: the April
 * report still showed January 2026). Before 1 January of the PY's second
 * year, April dues are not yet due.
 */
export function classifyDuesRenewal(input: {
  status: string
  season: 'october' | 'april'
  /** `YYYY-YYYY`. */
  programYear: string
  /** The snapshot's logical date, `YYYY-MM-DD`. */
  snapshotDate: string
}): DuesRenewalState {
  const startYear = Number.parseInt(input.programYear.slice(0, 4), 10)
  if (
    input.season === 'april' &&
    input.snapshotDate < `${startYear + 1}-01-01`
  ) {
    return 'notYetDue'
  }
  const windowStart =
    input.season === 'october' ? `${startYear}-06-01` : `${startYear}-12-01`
  const status = input.status
  if (/^verified complete/i.test(status)) {
    const iso = usDateToIso(status)
    return iso && iso >= windowStart ? 'verified' : 'notReceived'
  }
  if (/^ineligible/i.test(status)) return 'ineligible'
  if (/^low/i.test(status)) return 'low'
  if (/not here/i.test(status)) return 'notReceived'
  return 'other'
}

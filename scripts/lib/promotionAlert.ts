/**
 * Promotion-Held Alert Evaluation — Pure Functions (#1073, epic #1072)
 *
 * The daily Data Pipeline writes staging first, then promotes staging → prod
 * only when BOTH gates allow it (`data-pipeline.yml`):
 *   - the COUNT gate (`steps.diff`)        — additive-only: blocks a subtractive
 *     change (staging has fewer ranked districts/dates than prod);
 *   - the VALUE gate (`steps.valuediff`, #1034) — blocks a re-derive that keeps
 *     the same dates/districts but changes VALUES, until an operator reviews
 *     them (`allow_value_changes=true`).
 *
 * When a gate refuses, the corrected staging data silently fails to reach prod
 * and the run still reports `success` — prod keeps serving stale content with
 * no alert (epic #1072; observed live 2026-06-01 when D61 showed 150 active
 * clubs on prod for 5 days while staging correctly held 151).
 *
 * These pure functions turn the two gate outputs + the value-diff report into
 * a decision: file/refresh a `promotion-held` issue (distinguishing the
 * operator-review-needed value gate from a possible-regression count gate), or
 * auto-close it on a promoting run. They also surface the staging-ahead signal
 * — overlap dates whose CONTENT differs — which the date-based freshness
 * monitor (#753) can't see because a held promotion leaves `latest.json`
 * current. No network/GCS I/O lives here so the decision is unit-testable; the
 * workflow supplies the fetched gate outputs and value-diff JSON.
 */

/** One overlap date whose per-district values differ between staging & prod. */
export interface ValueDiffChangedDate {
  date: string
  changedDistricts: string[]
}

/** The `report` block of `collector-cli value-diff` JSON output. */
export interface ValueDiffReportBody {
  /** dates present in staging but not prod (additive) */
  added: string[]
  /** dates present in prod but not staging (subtractive) */
  removed: string[]
  /** overlap dates whose values differ */
  changed: ValueDiffChangedDate[]
  /** overlap dates whose values are identical */
  unchanged: string[]
  /** number of dates present in both sets */
  overlapCount: number
}

/** Full `collector-cli value-diff` stdout JSON. */
export interface ValueDiffOutput {
  promote: boolean
  reasons: string[]
  report: ValueDiffReportBody
}

/** Which gate(s) refused promotion. */
export type BlockingGate =
  'count' | 'value' | 'both' | 'content' | 'completeness' | 'scoped' | 'none'

/** One object the #1715 content gate refused. */
export interface ContentGateFailure {
  path: string
  reason: string
}

export interface PromotionAlertInput {
  /** `steps.diff.outputs.promote` — the additive-only count gate. */
  countPromote: boolean
  /** `steps.valuediff.outputs.value_promote` — the #1034 value gate. */
  valuePromote: boolean
  /**
   * Parsed value-diff JSON, or null when the file was missing/unparseable
   * (the value-diff step fails closed). Null does not change the block
   * decision — that is driven by the gate outputs — it only means the
   * staging-ahead content signal can't be confirmed.
   */
  valueDiff: ValueDiffOutput | null
  /**
   * `steps.contentgate.outputs.content_promote` — the #1715 content gate.
   * Omitted = not evaluated (treated as pass); the runner always passes it.
   */
  contentPromote?: boolean
  /** Objects the content gate refused, surfaced in the alert. */
  contentFailures?: ContentGateFailure[]
  /**
   * `steps.completenessgate.outputs.completeness_promote` — the #1761
   * per-date completeness gate. Omitted = not evaluated (treated as pass).
   */
  completenessPromote?: boolean
  /** Regressions the completeness gate found, surfaced in the alert. */
  completenessFailures?: ContentGateFailure[]
  /**
   * `steps.promotemanifest.outputs.complete` (#1763): false when the scoped
   * promote ran but copied less than the run planned (a held date, held
   * globals). Omitted = the promote did not run (a gate held first, or a
   * dry run), which leaves the decision to the gates.
   */
  scopedComplete?: boolean
  /** The dates the scoped promote held (`held_dates`). */
  scopedHeldDates?: string[]
  /** Why it held the globals (`globals_reason`); empty when it did not. */
  scopedGlobalsReason?: string
}

export interface PromotionAlertResult {
  /** A gate refused — file/refresh the `promotion-held` issue. */
  blocked: boolean
  /** Both gates allowed — auto-close any open `promotion-held` issue. */
  promoted: boolean
  /** Which gate(s) refused. */
  gate: BlockingGate
  /**
   * Staging holds content prod doesn't (overlap changed-count > 0), detected
   * independent of `latest.json` date — the content-stale signal the
   * freshness monitor misses.
   */
  stagingAhead: boolean
  /** Number of overlap dates whose values differ. */
  changedDateCount: number
  /** Unique, sorted union of district ids that changed across overlap dates. */
  affectedDistricts: string[]
  countPromote: boolean
  valuePromote: boolean
  contentPromote: boolean
  contentFailures: ContentGateFailure[]
  completenessPromote: boolean
  completenessFailures: ContentGateFailure[]
  /** false only when the scoped promote ran and copied less than planned. */
  scopedComplete: boolean
  scopedHeldDates: string[]
  scopedGlobalsReason: string
  /** value-gate reasons, surfaced verbatim in the alert. */
  reasons: string[]
}

/** Classify which gate(s) refused promotion from the two boolean outputs. */
export function classifyGate(
  countPromote: boolean,
  valuePromote: boolean
): BlockingGate {
  if (countPromote && valuePromote) return 'none'
  if (!countPromote && !valuePromote) return 'both'
  return countPromote ? 'value' : 'count'
}

/** Decide the promotion-alert state from the gate outputs + value-diff. */
export function evaluatePromotion(
  input: PromotionAlertInput
): PromotionAlertResult {
  const { countPromote, valuePromote, valueDiff } = input
  const contentPromote = input.contentPromote ?? true
  const completenessPromote = input.completenessPromote ?? true
  const scopedComplete = input.scopedComplete ?? true
  // count/value keep their classification; the content and completeness
  // gates are named on their own only when they are the sole refusal (the
  // title/body name them either way).
  const countValueGate = classifyGate(countPromote, valuePromote)
  const gate: BlockingGate =
    countValueGate !== 'none'
      ? countValueGate
      : !contentPromote
        ? 'content'
        : !completenessPromote
          ? 'completeness'
          : !scopedComplete
            ? 'scoped'
            : 'none'
  const promoted = gate === 'none'

  const changed = valueDiff?.report.changed ?? []
  const changedDateCount = changed.length
  // Numeric-aware sort: district ids are mostly numeric ("25" < "61" < "129")
  // but a few are alpha ("F", "U"); localeCompare with numeric handles both.
  const affectedDistricts = [
    ...new Set(changed.flatMap(c => c.changedDistricts)),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return {
    blocked: !promoted,
    promoted,
    gate,
    stagingAhead: changedDateCount > 0,
    changedDateCount,
    affectedDistricts,
    countPromote,
    valuePromote,
    contentPromote,
    contentFailures: input.contentFailures ?? [],
    completenessPromote,
    completenessFailures: input.completenessFailures ?? [],
    scopedComplete,
    scopedHeldDates: input.scopedHeldDates ?? [],
    scopedGlobalsReason: input.scopedGlobalsReason ?? '',
    reasons: valueDiff?.reasons ?? [],
  }
}

/**
 * What the alert is about. Omitted: the pipeline job's staging → prod
 * promotion. `report-sidecars`: the promote-reports job's sidecar promote
 * (#2227), which the content gate holds per date while the run's other
 * dates promote. Its issue carries REPORT_SIDECARS_HELD_TITLE, so each flow
 * refreshes and closes only its own issue.
 */
export type AlertScope = 'report-sidecars'

/** Title prefix of the report-sidecar alert issue (#2227). */
export const REPORT_SIDECARS_HELD_TITLE = '🚫 Report sidecars held'

export interface PromotionAlertBodyOptions {
  /** Evaluation time, surfaced for context. */
  now: Date
  scope?: AlertScope
}

const GATE_LABEL: Record<Exclude<BlockingGate, 'none'>, string> = {
  value: 'value gate',
  count: 'count gate',
  both: 'count gate + value gate',
  content: 'content gate',
  completeness: 'completeness gate',
  scoped: 'scoped promotion',
}

/** Title for the `promotion-held` alert issue. */
export function buildPromotionHeldTitle(
  result: PromotionAlertResult,
  scope?: AlertScope
): string {
  if (result.gate === 'none') return 'promotion not held'
  if (scope === 'report-sidecars') {
    const dates = result.scopedHeldDates.join(', ') || 'every date'
    return `${REPORT_SIDECARS_HELD_TITLE} — prod lacks their reports (content gate: ${dates})`
  }
  let label =
    result.gate === 'both' ? 'count + value gates' : GATE_LABEL[result.gate]
  if (!result.contentPromote && result.gate !== 'content') {
    label += ' + content gate'
  }
  if (!result.completenessPromote && result.gate !== 'completeness') {
    label += ' + completeness gate'
  }
  return `🚫 Promotion held — prod stale (${label})`
}

/**
 * Markdown body for the `promotion-held` alert. Distinguishes the
 * operator-review-needed value gate (clear with `allow_value_changes=true`)
 * from a possible-regression count gate (investigate the subtractive change
 * before clearing). When both refused, the regression is the more serious
 * signal and leads.
 */
/** GitHub rejects issue bodies over 65,536 chars; stay well under (#1168). */
const MAX_BODY_CHARS = 60_000
/** Reasons shown inline; the run's Step Summary always has the full list. */
const MAX_REASONS = 40

export function buildPromotionHeldBody(
  result: PromotionAlertResult,
  opts: PromotionAlertBodyOptions
): string {
  const lines: string[] =
    opts.scope === 'report-sidecars'
      ? [
          '## 🚫 Report sidecars are held',
          '',
          `The \`promote-reports\` job's content gate refused report sidecars (\`district_<id>_reports.json\`, \`reports-rollups.json\`). Those dates' sidecars **stay in staging**; the run's other dates and its main promotion are not held by this (#2227). Checked at ${opts.now.toISOString()}.`,
          '',
        ]
      : [
          '## 🚫 Staging → production promotion is held',
          '',
          `A daily Data Pipeline run completed but **did not promote** staging to production — the corrected staging data is **not on prod**. Checked at ${opts.now.toISOString()}.`,
          '',
          '| Gate | Result |',
          '|------|--------|',
          `| Count gate (additive) | ${result.countPromote ? '✅ pass' : '❌ **blocked**'} |`,
          `| Value gate (#1034) | ${result.valuePromote ? '✅ pass' : '❌ **blocked**'} |`,
          `| Content gate (#1715) | ${result.contentPromote ? '✅ pass' : '❌ **blocked**'} |`,
          `| Completeness gate (#1761) | ${result.completenessPromote ? '✅ pass' : '❌ **blocked**'} |`,
          '',
        ]
  const cell = (s: string) => s.replaceAll('|', '\\|')
  const failureTable = (failures: ContentGateFailure[], header: string) => {
    lines.push(`| ${header} | Reason |`, '| --- | --- |')
    for (const f of failures.slice(0, MAX_REASONS)) {
      lines.push(`| ${cell(f.path)} | ${cell(f.reason)} |`)
    }
    if (failures.length > MAX_REASONS) {
      lines.push(
        '',
        `_…and ${failures.length - MAX_REASONS} more — full list in the run's Step Summary._`
      )
    }
    lines.push('')
  }

  // Content-gate framing leads: an unreadable or wrong-shaped object would
  // break the site the moment it reached prod (#1702, #1704).
  if (!result.contentPromote) {
    lines.push(
      '### 🧪 Content gate blocked — staging holds objects a reader cannot use',
      '',
      'Objects promotion would copy fail decoding (nested gzip), parsing, or the shape check. There is **no override flag**: fix the writer or the store, let a later run rewrite the object, and the next run promotes.',
      ''
    )
    if (result.contentFailures.length > 0) {
      failureTable(result.contentFailures, 'Object')
    }
  }

  // A touched date with less than production already has (#1761, D-1/D-2).
  if (!result.completenessPromote) {
    lines.push(
      '### 📏 Completeness gate blocked — a date this run touched has less than production',
      '',
      'For at least one date the run wrote, staging has fewer objects, fewer districts or clubs, fewer countries, or club records missing keys production has (e.g. Find-a-Club fields after a non-daily re-run, #1758). Promoting would replace the richer production copy.',
      '',
      '**Clear path:** fix the run (or re-run the date in a mode that produces the full shape). If the reduction is intended and reviewed, re-run with `allow_value_changes=true`.',
      ''
    )
    if (result.completenessFailures.length > 0) {
      failureTable(result.completenessFailures, 'Object')
    }
  }

  // A scoped promote (#1763) that copied only part of the run: the passing
  // dates are in prod; the held dates and, with them, v1/, config/ and
  // time-series/ are not.
  if (!result.scopedComplete) {
    lines.push(
      '### 📦 Scoped promotion (#1763) copied only part of this run',
      ''
    )
    if (result.scopedHeldDates.length > 0) {
      lines.push(
        `Held date(s): ${result.scopedHeldDates.join(', ')} — the other dates of this run promoted.`,
        ''
      )
    }
    if (result.scopedGlobalsReason) {
      lines.push(
        `**Globals (v1/, config/, time-series/) held:** ${result.scopedGlobalsReason}`,
        ''
      )
    }
    lines.push(
      'Promotion copies only the objects a run wrote, for the dates that passed. A held date reaches production only when a run re-derives it and it passes its own gates; re-derive it in the mode that produces it (e.g. `-f mode=rebuild -f dates=<date>`).',
      ''
    )
  }

  // Count-gate framing leads when present — a subtractive change is the more
  // serious "possible real regression" signal.
  if (result.gate === 'count' || result.gate === 'both') {
    lines.push(
      '### 🛑 Count gate blocked — possible regression',
      '',
      'Staging has **fewer** ranked districts or dates than production (a subtractive change). This may be a real data regression, not a routine re-derive.',
      '',
      '**Do not** clear this with `allow_value_changes` — that flag only overrides the value gate. **Investigate** the missing districts/dates first (check the collector logs and the staging vs prod diff in the run summary).',
      ''
    )
  }

  if (result.gate === 'value' || result.gate === 'both') {
    lines.push(
      '### 🔶 Value gate blocked — operator review needed',
      '',
      `A re-derive changed **values** on ${result.changedDateCount} overlap date(s) that staging and production share, while the date/district counts stayed the same. The value gate holds promotion until a human reviews the change.`,
      ''
    )
    if (result.affectedDistricts.length > 0) {
      lines.push(
        `**Affected districts:** ${result.affectedDistricts.join(', ')}`,
        ''
      )
    }
    if (result.reasons.length > 0) {
      lines.push('**Value-gate reasons:**', '')
      // Bounded: a full-range re-derive emits thousands of reasons and the
      // raw body blows GitHub's 65,536-char issue limit (#1168). The full
      // list always lives in the run's Step Summary.
      for (const r of result.reasons.slice(0, MAX_REASONS)) lines.push(`- ${r}`)
      if (result.reasons.length > MAX_REASONS) {
        lines.push(
          `- _…and ${result.reasons.length - MAX_REASONS} more — truncated; full value-diff in the run's Step Summary._`
        )
      }
      lines.push('')
    }
    // #2040 leftovers: dates another run wrote and never promoted. Scoped
    // promotion (#1763) only copies what a run wrote, so a daily override
    // passes the gate but cannot ship them; they need their own re-derive.
    const foreign = result.reasons
      .map(r => /^(\d{4}-\d{2}-\d{2}): not written by this run/.exec(r)?.[1])
      .filter((d): d is string => d !== undefined)
    if (foreign.length > 0) {
      lines.push(
        `**${foreign.length} date(s) were not written by this run.** Scoped promotion only copies what a run wrote, so a daily re-run with \`allow_value_changes\` cannot ship them, and the next daily holds on them again. After reviewing them, re-derive those dates with the override so they promote through their own run:`,
        '',
        '```bash',
        `gh workflow run data-pipeline.yml -f mode=rebuild -f dates=${foreign.slice(0, MAX_REASONS).join(',')} -f allow_value_changes=true`,
        '```',
        ''
      )
    }
    lines.push(
      '**Clear path:** after reviewing the value-diff in the run summary, re-run the pipeline with the override:',
      '',
      '```bash',
      'gh workflow run data-pipeline.yml -f mode=daily -f allow_value_changes=true',
      '```',
      ''
    )
  }

  if (result.stagingAhead) {
    lines.push(
      '### ⏫ Staging is ahead of production',
      '',
      `Staging holds content production doesn't — **${result.changedDateCount} overlap date(s) differ** even though \`v1/latest.json\` may show the same date. This is the content-stale case the date-based freshness monitor (#753) can't see.`,
      ''
    )
  }

  lines.push(
    '---',
    opts.scope === 'report-sidecars'
      ? '_This issue auto-closes when a later run promotes its report sidecars with none held. Filed by the `promote-reports` job of `.github/workflows/data-pipeline.yml` (#2227)._'
      : '_This issue auto-closes when a later run successfully promotes. Filed by `.github/workflows/data-pipeline.yml` (#1073)._'
  )

  const body = lines.join('\n')
  if (body.length <= MAX_BODY_CHARS) return body
  // Hard guard (#1168): never hand `gh issue create` a body GitHub rejects.
  // Keep the head, then re-state the operational essentials the cut may
  // have removed (clear path + footer).
  const tail = [
    '',
    "⚠️ _Body truncated to fit GitHub's 64KB issue limit — full detail in the run's Step Summary._",
    '',
    '**Clear path** (value gate only, after review): `gh workflow run data-pipeline.yml -f mode=daily -f allow_value_changes=true`',
    '',
    '---',
    '_This issue auto-closes when a later run successfully promotes. Filed by `.github/workflows/data-pipeline.yml` (#1073)._',
  ].join('\n')
  return body.slice(0, MAX_BODY_CHARS - tail.length) + tail
}

/**
 * The counted-education-award rule (#1592, #1599).
 *
 * A Pathways level award (`PM1…`–`VC5…`, i.e. two capitals + level 1–5) or
 * DTM counts; anything else — e.g. `PWMENTORPGMPathways Mentor Program` —
 * does not. TI renders the award as its code immediately followed by its
 * title, so the rule is a prefix match.
 *
 * Shared because two sides must agree on it: collector-cli counts distinct
 * members per club over counted awards only (`DailyReportParser`), and the
 * frontend counts awards per club by it (`educationAwardRankings`).
 */
const COUNTED_AWARD = /^(?:[A-Z]{2}[1-5]|DTM)/

export function isCountedEducationAward(award: string): boolean {
  return COUNTED_AWARD.test(award)
}

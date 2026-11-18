/**
 * The one place that decides which program years show the District Club
 * Strength Award (#2907).
 *
 * Source: Toastmasters Item 1490 (District Recognition Program), archived
 * copies.
 * - Rev. 04/2025 lists it under District Excellence Awards ("increased in
 *   average club size by 10% or more"):
 *   https://web.archive.org/web/20250907091655/https://content.toastmasters.org/image/upload/1490-district-recognition-program.pdf
 * - Rev. 03/2026 removes that sentence; Rev. 07/2026 matches it:
 *   https://web.archive.org/web/20260602091114/https://content.toastmasters.org/image/upload/1490-district-recognition-program.pdf
 *
 * 2025-26 began under Rev. 04/2025, but TI dropped the award partway
 * through the year and published no list of 2025-26 recipients (searched
 * toastmasters.org Leader Letter and CEO reports, 2026-11-18). So the last
 * year shown is 2024-25, and nothing from 2025-26 on. Ron, 2026-11-18.
 */
export const CLUB_STRENGTH_LAST_PROGRAM_YEAR_START = 2024

/** `programYear` is a label such as "2024-2025". Unreadable labels hide. */
export function isClubStrengthAwardShown(programYear: string): boolean {
  const match = /^(\d{4})-\d{4}$/.exec(programYear)
  if (!match) return false
  return Number(match[1]) <= CLUB_STRENGTH_LAST_PROGRAM_YEAR_START
}

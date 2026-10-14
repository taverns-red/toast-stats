/**
 * Club contact fields (#2026). Stub for the red step: not implemented yet.
 */
export const CLUB_CONTACT_KEYS = ['email', 'phone'] as const

export function omitClubContactFields<T>(record: T): T {
  return record
}

export function findClubContactField(_value: unknown): string | null {
  return null
}

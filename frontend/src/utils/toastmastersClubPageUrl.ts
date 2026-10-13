import { normalizeClubId } from '@taverns-red/shared-contracts'

/**
 * The club's public page on toastmasters.org. Verified live 2026-10-11:
 * `/Find-a-Club/<8-digit padded id>` resolves to the club; an unknown id
 * renders TI's "Club not found" page.
 *
 * Its own module so a light consumer (the map's club summary, #1784) gets
 * the link without the rest of `clubMeetingInfo`.
 */
export function toastmastersClubPageUrl(clubId: string): string | null {
  const id = normalizeClubId(clubId)
  if (!/^\d{1,8}$/.test(id)) return null
  return `https://www.toastmasters.org/Find-a-Club/${id.padStart(8, '0')}`
}

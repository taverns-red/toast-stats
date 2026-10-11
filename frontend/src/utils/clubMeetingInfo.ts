import { normalizeClubId } from '@taverns-red/shared-contracts'

/**
 * #1783 — the club hero's "where it meets" line, built only from the
 * Find-A-Club (FAC) enrichment already on the ClubTrend.
 *
 * Ron's rule (2026-10-11, epic #1781 decision 5): show the address, meeting
 * day/time, online/hybrid, website and a "Contact on toastmasters.org" link.
 * NEVER email or phone — TI publishes those on its own club page, which is
 * what the contact link points at. `email`/`phone` are accepted on the input
 * type only because the ClubTrend carries them; nothing here reads them.
 */
export interface ClubMeetingInfo {
  /** Free-text day (TI's field, verbatim) and time, joined with " · ". */
  schedule: string | null
  /** "Online or hybrid" / "In person", from allowsVirtualAttendance. */
  mode: string | null
  /** Street, city, region — no postal code or country. */
  place: string | null
  /** The club's own site, http(s) only. */
  websiteUrl: string | null
  /** The club's page on toastmasters.org. */
  contactUrl: string | null
}

export interface ClubMeetingSource {
  clubId: string
  address?: {
    street?: string
    city?: string
    region?: string
    postalCode?: string
    country?: string
  }
  email?: string
  phone?: string
  website?: string
  meetingDay?: string
  meetingTime?: string
  allowsVirtualAttendance?: boolean
  coordinates?: { lat: number; lng: number }
}

/**
 * The club's public page on toastmasters.org. Verified live 2026-10-11:
 * `/Find-a-Club/<8-digit padded id>` resolves to the club; an unknown id
 * renders TI's "Club not found" page.
 */
export function toastmastersClubPageUrl(clubId: string): string | null {
  const id = normalizeClubId(clubId)
  if (!/^\d{1,8}$/.test(id)) return null
  return `https://www.toastmasters.org/Find-a-Club/${id.padStart(8, '0')}`
}

/** Trim and collapse internal runs of whitespace; empty → null. */
function clean(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 0 ? text : null
}

function safeHttpUrl(value: string | undefined): string | null {
  const text = clean(value)
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null
  } catch {
    return null
  }
}

/**
 * Null when the snapshot carries no displayable FAC field for this club —
 * pre-2026-05-15 dates, dates whose enrichment was stripped, and clubs TI
 * hides from Find-A-Club (suspended, closed-corporate; Lesson 118). The line
 * is then omitted, never rendered blank, and the contact link is not offered
 * on its own (TI's page would say "Club not found" for a hidden club).
 */
export function buildClubMeetingInfo(
  club: ClubMeetingSource
): ClubMeetingInfo | null {
  const day = clean(club.meetingDay)
  const time = clean(club.meetingTime)
  const schedule = [day, time].filter(Boolean).join(' · ') || null

  const mode =
    club.allowsVirtualAttendance === true
      ? 'Online or hybrid'
      : club.allowsVirtualAttendance === false
        ? 'In person'
        : null

  const street = clean(club.address?.street)?.replace(/,$/, '') ?? null
  const place =
    [street, clean(club.address?.city), clean(club.address?.region)]
      .filter(Boolean)
      .join(', ') || null

  const websiteUrl = safeHttpUrl(club.website)

  const hasFac =
    schedule !== null ||
    mode !== null ||
    place !== null ||
    websiteUrl !== null ||
    club.coordinates !== undefined
  if (!hasFac) return null

  return {
    schedule,
    mode,
    place,
    websiteUrl,
    contactUrl: toastmastersClubPageUrl(club.clubId),
  }
}

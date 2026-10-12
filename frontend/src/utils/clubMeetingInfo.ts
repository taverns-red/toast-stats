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

/**
 * #1879 — Ron's rule (2026-10-12): NEVER display a club's online meeting
 * link. Any URL on a meeting host gives direct entry to the meeting and may
 * carry a passcode; the "Contact on toastmasters.org" link is the way in.
 *
 * TI's Find-A-Club puts the link wherever the club typed it — on prod it is
 * `address.street` (D61 1009147: `https://us02web.zoom.us/j/…`; 7396993 adds
 * `MtgID: … Passcode:…`), not `website`. So every free-text field passes
 * through this check, not just the website. Matches with or without a scheme.
 */
const MEETING_HOST =
  /(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\.)*(?:zoom\.us|zoomgov\.com|zoom\.com|teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|webex\.com|gotomeeting\.com|gotomeet\.me|meet\.goto\.com|meet\.jit\.si|8x8\.vc|whereby\.com|bluejeans\.com)(?![a-z0-9-])/i

/** Meeting credentials typed next to (or instead of) the link. */
const MEETING_CREDENTIAL =
  /\b(?:passcode|password|pwd\s*[:=]|mtg\s*id|meeting\s*id)\b|[?&]pwd=/i

export function containsMeetingAccess(value: string): boolean {
  return MEETING_HOST.test(value) || MEETING_CREDENTIAL.test(value)
}

/** `clean`, then null if the text would give entry to a meeting. */
function publicText(value: string | undefined): string | null {
  const text = clean(value)
  return text !== null && containsMeetingAccess(text) ? null : text
}

function safeHttpUrl(value: string | undefined): string | null {
  const text = publicText(value)
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
  const day = publicText(club.meetingDay)
  const time = publicText(club.meetingTime)
  const schedule = [day, time].filter(Boolean).join(' · ') || null

  // A street that is a meeting link means the club's meeting place is online.
  const rawStreet = clean(club.address?.street)
  const meetsAtLink = rawStreet !== null && containsMeetingAccess(rawStreet)

  const mode = meetsAtLink
    ? 'Meets online'
    : club.allowsVirtualAttendance === true
      ? 'Online or hybrid'
      : club.allowsVirtualAttendance === false
        ? 'In person'
        : null

  const street = meetsAtLink ? null : (rawStreet?.replace(/,$/, '') ?? null)
  const place =
    [street, publicText(club.address?.city), publicText(club.address?.region)]
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

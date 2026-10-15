import { isShortenedLink, stripLinks } from '@taverns-red/shared-contracts'
import { toastmastersClubPageUrl } from './toastmastersClubPageUrl'

export { toastmastersClubPageUrl }

/**
 * #1783 — the club hero's "where it meets" line, built only from the
 * Find-A-Club (FAC) enrichment already on the ClubTrend.
 *
 * Ron's rule (2026-10-11, epic #1781 decision 5): show the address, meeting
 * day/time, online/hybrid, website and a "Contact on toastmasters.org" link.
 * NEVER email or phone — TI publishes those on its own club page, which is
 * what the contact link points at. `email`/`phone` are accepted on the input
 * type only because the ClubTrend carries them; nothing here reads them.
 *
 * NEVER an online meeting link, meeting ID or passcode either (Ron,
 * 2026-10-12, #1879) — see `containsMeetingAccess`. Every surface that shows
 * a club's meeting details (hero, map popup, lists) MUST build them here.
 */
export interface ClubMeetingInfo {
  /** Free-text day (TI's field, verbatim) and time, joined with " · ". */
  schedule: string | null
  /**
   * "Meets online" when TI's street is a meeting link; else "Online or
   * hybrid" / "In person" from allowsVirtualAttendance.
   */
  mode: string | null
  /** Street, city, region — no postal code, country or meeting link. */
  place: string | null
  /** The club's own site, http(s) only, never a meeting host. */
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

/**
 * #1958 — a 24-hour clock (13–23h) followed by an am/pm suffix. TI's
 * `MeetingTime` is free text copied verbatim, and some clubs type both
 * (D61 8590 "19:30 pm", 7670344 "12:00 - 13:00 PM", 5097 "18h30 pm").
 */
const TWENTY_FOUR_HOUR_WITH_SUFFIX =
  /\b(1[3-9]|2[0-3])\s*([:h])\s*([0-5]\d)(\s*)([ap])(\.?\s?m\.?)(?![a-z])/gi

/**
 * Render a meeting time as 12-hour with its suffix or 24-hour without one,
 * never both: "19:30 pm" → "7:30 pm"; a contradictory "19:30 am" → "19:30".
 * Everything else — 12-hour times, bare 24-hour times, prose — is untouched.
 */
export function formatMeetingTime(time: string): string {
  return time.replace(
    TWENTY_FOUR_HOUR_WITH_SUFFIX,
    (
      _match,
      hour: string,
      sep: string,
      minute: string,
      gap: string,
      ap: string,
      rest: string
    ) =>
      ap.toLowerCase() === 'p'
        ? `${Number(hour) - 12}:${minute}${gap}${ap}${rest}`
        : `${hour}${sep}${minute}`
  )
}

/**
 * #2069 — `clean` with every link removed: any URL or URL-like token, with
 * or without a scheme (club 977's street is "Zoom Link: bit.ly/…, <street>";
 * a shortener hides where it goes), and the "Zoom Link:" label before one.
 * The same `stripLinks` the collector applies, so files published before
 * the collector change show no link either.
 */
function linklessText(value: string | undefined): string | null {
  const text = clean(value)
  return text === null ? null : clean(stripLinks(text))
}

/** `linklessText`, then null if what is left would give entry to a meeting. */
function publicText(value: string | undefined): string | null {
  const text = linklessText(value)
  return text !== null && containsMeetingAccess(text) ? null : text
}

/** An http(s) club site: never a meeting host, never a shortener (#2069). */
function safeHttpUrl(value: string | undefined): string | null {
  const text = clean(value)
  if (!text || containsMeetingAccess(text) || isShortenedLink(text)) {
    return null
  }
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
  const rawTime = publicText(club.meetingTime)
  const time = rawTime === null ? null : formatMeetingTime(rawTime)
  const schedule = [day, time].filter(Boolean).join(' · ') || null

  // A street that is only a link (or meeting access) means the club's
  // meeting place is online. A street left after the link is kept (#2069).
  const rawStreet = clean(club.address?.street)
  const street = publicText(club.address?.street)?.replace(/,$/, '') ?? null
  const meetsAtLink =
    rawStreet !== null &&
    street === null &&
    (linklessText(rawStreet) !== rawStreet || containsMeetingAccess(rawStreet))

  const mode = meetsAtLink
    ? 'Meets online'
    : club.allowsVirtualAttendance === true
      ? 'Online or hybrid'
      : club.allowsVirtualAttendance === false
        ? 'In person'
        : null

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

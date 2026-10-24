import { isShortenedLink, scrubPlaceText } from '@taverns-red/shared-contracts'
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
   * #2247 — set when TI's day or time is unreadable (`isUnreadableFacText`):
   * the "?" text is never shown; `schedule` keeps any readable half.
   */
  scheduleNote?: string
  /**
   * "Meets online" when TI's street is a meeting link; else "Online or
   * hybrid" / "In person" from allowsVirtualAttendance.
   */
  mode: string | null
  /** Street, city, region — no postal code, country or meeting link. */
  place: string | null
  /**
   * #2268 — set when part or all of TI's address is "?" text
   * (`isUnreadableFacText`): those parts are dropped from `place`.
   */
  placeNote?: string
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
 * The same `scrubPlaceText` the collector applies (#2157: meeting
 * credentials too), so files published before the collector change show
 * no link or passcode either.
 */
function linklessText(value: string | undefined): string | null {
  const text = clean(value)
  return text === null ? null : clean(scrubPlaceText(text))
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
 * #2247 — TI's Find-a-Club API sends literal "?" bytes (0x3F) where a club
 * typed CJK text: D88 06513503 is `"MeetingDay":"???"`,
 * `"MeetingTime":"??2:30-??4:30"` on the wire (上午/下午 → "??",
 * 星期X → "???"). The words are gone upstream, so the text is never shown
 * or parsed (Ron, 2026-10-24); the note sends the reader to TI's page.
 */
export const UNREADABLE_SCHEDULE_NOTE =
  'Meeting time not readable — see toastmasters.org'

/**
 * True when a FAC day/time value is "?" placeholders for lost words:
 * it has no letter in any script (so "Tuesday?", "Mon ??" and real CJK
 * like "下午2:30" stay readable), contains a "?", and either has a run of
 * two or more "?" ("??2:30-??4:30", "??6?") or no digit at all ("?").
 * A lone "?" beside a real time ("7:30?", "19:00 ?") stays readable.
 */
export function isUnreadableFacText(text: string): boolean {
  if (/\p{L}/u.test(text) || !text.includes('?')) return false
  return /\?{2,}/.test(text) || !/\p{N}/u.test(text)
}

/** Ron (2026-10-24, PR #2267): keep the readable half, name the other. */
export const UNREADABLE_DAY_NOTE = 'day not readable — see toastmasters.org'
export const UNREADABLE_TIME_NOTE = 'time not readable — see toastmasters.org'

/** #2268 — the address counterparts of the notes above. */
export const UNREADABLE_ADDRESS_NOTE =
  'Address not readable — see toastmasters.org'
export const UNREADABLE_PARTIAL_ADDRESS_NOTE =
  'address partly not readable — see toastmasters.org'

/**
 * One comma-separated address part with its "?" text removed, or null when
 * nothing readable is left. A part the #2247 rule calls unreadable ("??")
 * goes whole; inside a readable part, a word that is a "?" run among
 * digits ("1????31" in "1????31 Xishiku") goes too. A lone "?" word
 * ("(Room ?)") is left alone, as in a day or time.
 */
function readableAddressPart(part: string): string | null {
  if (isUnreadableFacText(part)) return null
  const words = part
    .split(' ')
    .filter(word => !(/\?{2,}/.test(word) && isUnreadableFacText(word)))
  return words.join(' ') || null
}

/**
 * #2268 — the public place line, dropping address parts TI sent as "?"
 * text (D88 06513503: street "1????31 Xishiku,Xic", city "??", region
 * "BJ" → "Xishiku, Xic, BJ"). A fully readable address is returned exactly
 * as before; the note says whether some or all of it was lost.
 */
function placeParts(fields: Array<string | null>): {
  place: string | null
  note: string | null
} {
  const present = fields.filter((f): f is string => f !== null)
  const parts = present.flatMap(f =>
    f
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
  )
  const kept = parts
    .map(readableAddressPart)
    .filter((p): p is string => p !== null)
  const lost =
    kept.length !== parts.length || kept.some((p, i) => p !== parts[i])
  if (!lost) return { place: present.join(', ') || null, note: null }
  return kept.length === 0
    ? { place: null, note: UNREADABLE_ADDRESS_NOTE }
    : { place: kept.join(', '), note: UNREADABLE_PARTIAL_ADDRESS_NOTE }
}

interface ScheduleParts {
  day: string | null
  time: string | null
  /** Set when TI's day or time is "?" text (`isUnreadableFacText`). */
  note: string | null
}

/**
 * The public day and formatted time, dropping either half that is "?"
 * text. The note names what was dropped: the day (D88 07166169: "???" +
 * "6:30 - 8:30 PM" keeps the time), the time, or — when nothing readable
 * is left — the whole meeting time.
 */
function scheduleParts(
  club: Pick<ClubMeetingSource, 'meetingDay' | 'meetingTime'>
): ScheduleParts {
  const rawDay = publicText(club.meetingDay)
  const rawTime = publicText(club.meetingTime)
  const dayLost = rawDay !== null && isUnreadableFacText(rawDay)
  const timeLost = rawTime !== null && isUnreadableFacText(rawTime)
  const day = dayLost ? null : rawDay
  const time = timeLost || rawTime === null ? null : formatMeetingTime(rawTime)
  const note =
    !dayLost && !timeLost
      ? null
      : day === null && time === null
        ? UNREADABLE_SCHEDULE_NOTE
        : dayLost
          ? UNREADABLE_DAY_NOTE
          : UNREADABLE_TIME_NOTE
  return { day, time, note }
}

/**
 * #2174 — when an online-only club meets, as "Tuesday 7:00 pm": the same
 * public, link-free day and time the hero shows. Null when neither is known.
 * FAC carries no meeting timezone, so none is added.
 */
export function meetingWhen(
  club: Pick<ClubMeetingSource, 'meetingDay' | 'meetingTime'>
): string | null {
  const { day, time, note } = scheduleParts(club)
  const when = [day, time].filter(Boolean).join(' ') || null
  return [when, note].filter(Boolean).join(' · ') || null
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
  const { day, time, note: scheduleNote } = scheduleParts(club)
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

  const { place, note: placeNote } = placeParts([
    street,
    publicText(club.address?.city),
    publicText(club.address?.region),
  ])

  const websiteUrl = safeHttpUrl(club.website)

  const hasFac =
    scheduleNote !== null ||
    schedule !== null ||
    mode !== null ||
    place !== null ||
    placeNote !== null ||
    websiteUrl !== null ||
    club.coordinates !== undefined
  if (!hasFac) return null

  return {
    schedule,
    ...(scheduleNote !== null && { scheduleNote }),
    mode,
    place,
    ...(placeNote !== null && { placeNote }),
    websiteUrl,
    contactUrl: toastmastersClubPageUrl(club.clubId),
  }
}

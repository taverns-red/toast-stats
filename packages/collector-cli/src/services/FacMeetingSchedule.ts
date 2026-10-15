/**
 * FacMeetingSchedule — the FAC `Location` scrubber and the
 * `meetingSchedule[]` parser (#1789).
 *
 * TI's Find-A-Club `MeetingDay`, `MeetingTime` and `Location` are free text
 * the club types itself, in English and French. The recorded D61 vocabulary
 * (fixtures/fac-d61-2026-10-12) ranges from "Tuesday" / "7:30 pm" to
 * "Wed.1st and 3rd in person (2nd online)" / "18h30 pm et 7:00 am".
 *
 * Two rules shape everything here:
 *
 * 1. Location is published as a public meeting place, but clubs also type
 *    phone numbers, emails, meeting links and passcodes into it. Those are
 *    removed before the text is written anywhere (Ron's rules: never
 *    email/phone, epic #1781; never a meeting link, #1879).
 * 2. The parser never guesses. A field it cannot read is left out (a bare
 *    "6:30" has no start time; "Twice a month" has no cadence), and text
 *    with no weekday yields no schedule at all, so consumers count the club
 *    as "unknown" (#1796). The raw day/time text stays on meetingDay /
 *    meetingTime.
 *
 * Pure functions; no I/O.
 */

import { stripLinks } from '@taverns-red/shared-contracts'
import type {
  MeetingScheduleEntry,
  MeetingWeekday,
} from '@taverns-red/shared-contracts'

type MeetingMode = NonNullable<MeetingScheduleEntry['mode']>
type Cadence = NonNullable<MeetingScheduleEntry['cadence']>

/** Lower-case and strip diacritics ("Présentiel" → "presentiel"). */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/* ── Location scrubber ─────────────────────────────────────────────── */

const CREDENTIAL =
  /\b(?:meeting\s*id|mtg\s*id|passcode|password|pwd|mot de passe)\b\s*[:#=]?\s*[\w-]*/gi
/** A digit run that, with 7+ digits, is a phone number or meeting id. A
 *  run touching a letter ("23300 58th Ave") is a street number, not one. */
const DIGIT_RUN = /(?<!\w)\+?\(?\d[\d\s().-]*\d(?!\w)/g
/**
 * A contact instruction ("Contact Alex for link", "c/o …", "Wechat ID: …",
 * "(@handle)"). It is not a meeting place, and it is where clubs name a
 * person or a messaging handle, so the parenthetical, or else the whole
 * line, is dropped. Matched on folded text.
 */
const CONTACT_CUE =
  /\bcontact\w*|\bcall(?:ing)?\b|\be-?mail\w*|\bcourriel\b|\btext\b|\bwhats\s?app\b|\bwechat\b|\btelegram\b|\bskype\b|\bline id\b|\bc\/o\b|\battn\b|@\w|\btel\b|\bphone\b|\btelephone\b/
/** A contact label left dangling once its value is gone ("(TEL: )"). */
const DANGLING_LABEL =
  /\b(?:tel|tél|phone|ph|telephone|téléphone|e-?mail|courriel)\b\.?\s*:\s*(?=[)\]]|$)/gi

/** A handle, c/o, or messaging id: the line names someone, so it all goes. */
const PERSONAL_CUE =
  /@\w|\bc\/o\b|\battn\b|\b(?:wechat|whats\s?app|telegram|skype|line id)\b/
/** "Contact Alex", "call Sam": a contact verb followed by a capitalised
 *  word that is not "Us" / "Club" / "the" and so on. */
const CONTACT_VERB_THEN_WORD =
  /\b(?:contact|call|text|email|ask for)\s+([A-Z][a-z]+)/gi
const NOT_A_NAME = new Set([
  'us',
  'the',
  'club',
  'our',
  'for',
  'to',
  'via',
  'me',
  'officers',
  'club officers',
])

function namesSomeone(line: string): boolean {
  if (PERSONAL_CUE.test(fold(line))) return true
  for (const match of line.matchAll(CONTACT_VERB_THEN_WORD)) {
    const word = match[1] ?? ''
    if (/^[A-Z]/.test(word) && !NOT_A_NAME.has(word.toLowerCase())) {
      return true
    }
  }
  return false
}

function scrubLine(raw: string): string {
  const tagless = raw.replace(/<[^>]*>/g, ' ')
  // Emails, URLs with or without a scheme, meeting hosts, shorteners and
  // the "Zoom Link:" label in front of one (#1879, #2069).
  const linkless = stripLinks(tagless)
  if (namesSomeone(linkless)) return ''
  const line = linkless.replace(/\([^()]*\)/g, group =>
    CONTACT_CUE.test(fold(group)) ? ' ' : group
  )
  if (CONTACT_CUE.test(fold(line))) return ''
  return withoutAccess(line)
}

/** Credentials, phone-like digit runs and dangling contact labels out. */
function withoutAccess(line: string): string {
  return line
    .replace(CREDENTIAL, ' ')
    .replace(DIGIT_RUN, run => (run.replace(/\D/g, '').length >= 7 ? ' ' : run))
    .replace(DANGLING_LABEL, ' ')
    .replace(/\(\s*[,;:.-]*\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .replace(/^[\s,;:|-]+|[\s,;:|-]+$/g, '')
}

/**
 * FAC `Address.Street`, which is free text too (#2069: club 977 typed
 * "Zoom Link: <shortened link>, <street>"). Links, credentials and phone
 * numbers are removed and the street kept. Undefined when nothing is left.
 * Unlike Location, a contact cue does not drop the street: it is the
 * club's postal address, not a place it describes.
 */
export function scrubFacStreet(
  raw: string | null | undefined
): string | undefined {
  if (typeof raw !== 'string') return undefined
  const street = withoutAccess(stripLinks(raw.replace(/<[^>]*>/g, ' ')))
  return street.length > 0 ? street : undefined
}

/**
 * Free text with every link removed (MeetingDay, MeetingTime; #2069).
 * Undefined when nothing is left.
 */
export function stripFacLinks(
  raw: string | null | undefined
): string | undefined {
  if (typeof raw !== 'string') return undefined
  const text = stripLinks(raw).trim()
  return text.length > 0 ? text : undefined
}

/**
 * The public meeting place from FAC `Location`: `<br>` becomes "\n";
 * contact instructions, emails, URLs, meeting hosts, credentials and phone
 * numbers are removed. Undefined when nothing public is left.
 */
export function scrubFacLocation(
  raw: string | null | undefined
): string | undefined {
  if (typeof raw !== 'string') return undefined
  const lines = raw
    .split(/<br\s*\/?>/i)
    .map(scrubLine)
    .filter(line => line.length > 0)
  return lines.length > 0 ? lines.join('\n') : undefined
}

/* ── Meeting mode ──────────────────────────────────────────────────── */

const ONLINE_WORD =
  /\b(?:online|on-line|on line|virtual\w*|virtuel\w*|en ligne|zoom|teams|webex|remote)\b/
const HYBRID_WORD = /\bhybri\w*/
const IN_PERSON_WORD =
  /\bin[\s-]?person\b|\ben personne\b|\bpresentiel\w*|\ben salle\b/
/** Location text that names no place. */
const NO_PLACE =
  /^(?:contact(?: us)?|to be determined|tbd|tba|n\/?a|suspended|see website|varies|various)$/

function combineModes(modes: Iterable<MeetingMode>): MeetingMode | undefined {
  const set = new Set(modes)
  if (set.has('hybrid') || (set.has('online') && set.has('in-person'))) {
    return 'hybrid'
  }
  if (set.has('online')) return 'online'
  if (set.has('in-person')) return 'in-person'
  return undefined
}

function modesIn(folded: string): MeetingMode[] {
  const modes: MeetingMode[] = []
  if (HYBRID_WORD.test(folded)) modes.push('hybrid')
  if (ONLINE_WORD.test(folded)) modes.push('online')
  if (IN_PERSON_WORD.test(folded)) modes.push('in-person')
  return modes
}

/**
 * How the club says it meets. With `place: true` (a Location), text that
 * names a place but no online word means in person; otherwise only explicit
 * words count. Undefined when the text says nothing.
 */
export function meetingModeFromText(
  text: string | null | undefined,
  options: { place?: boolean } = {}
): MeetingMode | undefined {
  if (typeof text !== 'string') return undefined
  const folded = fold(text)
  const mode = combineModes(modesIn(folded))
  if (mode || !options.place) return mode
  const bare = folded
    .replace(/[^a-z/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (bare.replace(/[^a-z]/g, '').length < 3 || NO_PLACE.test(bare)) {
    return undefined
  }
  return 'in-person'
}

/* ── Weekdays, cadence, weeks of the month ─────────────────────────── */

const WEEKDAY_WORDS: Record<MeetingWeekday, string> = {
  Monday: 'mon|mondays?|lundis?',
  Tuesday: 'tues?|tuesdays?|mardis?',
  Wednesday: 'weds?|wednesdays?|mercredis?',
  Thursday: 'thu|thur|thurs|thursdays?|jeudis?',
  Friday: 'fri|fridays?|vendredis?',
  Saturday: 'sat|saturdays?|samedis?',
  Sunday: 'sun|sundays?|dimanches?',
}

const WEEKDAY_PATTERNS = (
  Object.entries(WEEKDAY_WORDS) as [MeetingWeekday, string][]
).map(([day, words]) => [day, new RegExp(`\\b(?:${words})\\b`, 'g')] as const)

/** Weekdays in order of first mention, each once. */
function weekdaysIn(folded: string): MeetingWeekday[] {
  const found: { day: MeetingWeekday; at: number }[] = []
  for (const [day, pattern] of WEEKDAY_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(folded)
    if (match) found.push({ day, at: match.index })
  }
  return found.sort((a, b) => a.at - b.at).map(f => f.day)
}

const BIWEEKLY =
  /\bevery\s+(?:other|second|2nd)\b|\bbi-?weekly\b|\bfortnightly\b|\balternat\w*|\bsur\s+deux\b|\baux?\s+(?:2|deux)\s+semaines?\b|\bevery\s+(?:2|two)\s+weeks\b/
/** The day is named but how often is not. */
const UNCERTAIN_CADENCE =
  /\btwice\b|\bmost\b|\bcheck\b|\brefer\b|\bcontact\b|\bvar(?:y|ies)\b|\boccasional\w*/

const ORDINAL_WORDS: [number, string][] = [
  [1, '1st|first|1er|1re|1ere'],
  [2, '2nd|second|2e|2eme'],
  [3, '3rd|third|3e|3eme'],
  [4, '4th|fourth|4e|4eme'],
  [5, '5th|fifth|5e|5eme'],
]
const MODE_WORDS: [MeetingMode, string][] = [
  ['hybrid', 'hybri\\w*'],
  ['in-person', 'in[\\s-]?person|en personne|presentiel\\w*'],
  ['online', 'online|on-line|virtual\\w*|virtuel\\w*|en ligne|zoom|teams'],
]
/** One token at a time: an ordinal week or a mode word. */
const ORDINAL_OR_MODE = new RegExp(
  [
    ...ORDINAL_WORDS.map(([n, w]) => `(?<w${n}>\\b(?:${w})\\b)`),
    ...MODE_WORDS.map(([, w], i) => `(?<m${i}>\\b(?:${w})\\b)`),
  ].join('|'),
  'g'
)

interface WeekGroup {
  weeks: number[]
  mode?: MeetingMode
}

/**
 * Ordinal weeks, grouped by the mode word that follows them:
 * "1st and 3rd in person (2nd online)" → [1,3] in-person, [2] online.
 * Mode words that follow no ordinal are returned as `loose`.
 */
function weekGroupsIn(folded: string): {
  groups: WeekGroup[]
  loose: MeetingMode[]
} {
  const groups: WeekGroup[] = []
  const loose: MeetingMode[] = []
  let pending: number[] = []
  ORDINAL_OR_MODE.lastIndex = 0
  for (const match of folded.matchAll(ORDINAL_OR_MODE)) {
    const named = match.groups ?? {}
    const week = ORDINAL_WORDS.find(([n]) => named[`w${n}`] !== undefined)
    if (week) {
      pending.push(week[0])
      continue
    }
    const modeIndex = MODE_WORDS.findIndex((_, i) => named[`m${i}`])
    const mode = MODE_WORDS[modeIndex]?.[0]
    if (!mode) continue
    if (pending.length > 0) {
      groups.push({ weeks: pending, mode })
      pending = []
    } else {
      loose.push(mode)
    }
  }
  if (pending.length > 0) groups.push({ weeks: pending })
  return {
    groups: groups.map(g => ({
      ...g,
      weeks: [...new Set(g.weeks)].sort((a, b) => a - b),
    })),
    loose,
  }
}

/* ── Times ─────────────────────────────────────────────────────────── */

interface TimeToken {
  start: number
  end: number
  hour: number
  minute: number
  /** h-notation ("19 h 00", "14h") or a leading zero ("07:15"). */
  twentyFour: boolean
  meridiem?: 'am' | 'pm'
}

const TIME_TOKEN =
  /\bnoon\b|\b(\d{1,2})(?:\s*([:h])\s*(\d{2}))?(\s*h\b)?\s*(am|pm)?(?!\d)/g
const RANGE_SEPARATOR = /^\s*(?:-|–|—|to|a|until|jusqu'?a)\s*$/
const LIST_SEPARATOR = /^\s*(?:et|and|&|,|\/)\s*$/

function timeTokensIn(text: string): TimeToken[] {
  const tokens: TimeToken[] = []
  TIME_TOKEN.lastIndex = 0
  for (const match of text.matchAll(TIME_TOKEN)) {
    const at = match.index ?? 0
    const end = at + match[0].length
    if (match[0] === 'noon') {
      tokens.push({ start: at, end, hour: 12, minute: 0, twentyFour: true })
      continue
    }
    const [, hourText, separator, minuteText, trailingH, meridiem] = match
    // A bare number ("UTC-5", "1hr") is not a time.
    if (!minuteText && !trailingH && !meridiem && separator !== 'h') continue
    const hour = Number(hourText)
    const minute = minuteText ? Number(minuteText) : 0
    if (hour > 23 || minute > 59) continue
    tokens.push({
      start: at,
      end: match[0].trimEnd().length + at,
      hour,
      minute,
      twentyFour:
        separator === 'h' ||
        trailingH !== undefined ||
        (hourText !== undefined &&
          hourText.length === 2 &&
          hourText[0] === '0'),
      ...(meridiem ? { meridiem: meridiem as 'am' | 'pm' } : {}),
    })
  }
  return tokens
}

/** Minutes after midnight, or undefined when am/pm cannot be known. */
function resolve(token: TimeToken, meridiem?: 'am' | 'pm'): number | undefined {
  const { hour, minute } = token
  // A 24-hour clock wins over a contradictory suffix ("19:00 pm", #1958).
  if (hour > 12 || hour === 0) return hour * 60 + minute
  const suffix = token.meridiem ?? meridiem
  if (suffix === 'pm') return ((hour % 12) + 12) * 60 + minute
  if (suffix === 'am') return (hour % 12) * 60 + minute
  if (token.twentyFour || hour === 12) return hour * 60 + minute
  return undefined
}

/** A suffix-less end of a range takes its partner's suffix, flipped when
 *  the clock wraps through noon ("11:00 - 1:00 pm" → 11 am). */
function inherited(
  bare: TimeToken,
  partner: TimeToken,
  bareIsStart: boolean
): 'am' | 'pm' | undefined {
  const suffix = partner.meridiem
  if (!suffix || bare.twentyFour || bare.hour === 12) return undefined
  if (partner.hour === 12) return bareIsStart ? 'am' : 'pm'
  const wraps = bareIsStart
    ? bare.hour > partner.hour
    : bare.hour < partner.hour
  if (!wraps) return suffix
  return suffix === 'pm' ? 'am' : 'pm'
}

interface Slot {
  startTime?: string
  endTime?: string
}

function clock(minutes: number | undefined): string | undefined {
  if (minutes === undefined) return undefined
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Meeting time slots: "7:00 pm - 9:00 pm" is one slot with an end; "18h30
 * pm et 7:00 am" is two. A token that follows prose ("link opens 7:15PM")
 * ends the list.
 */
function timeSlotsIn(time: string | null | undefined): Slot[] {
  if (typeof time !== 'string') return []
  const text = fold(time)
    .replace(/\b12(?::00)?\s*noon\b/g, 'noon')
    .replace(/\bnoon\s*\/\s*midi\b/g, 'noon')
    .replace(/(?<!-)\bmidi\b/g, 'noon')
    .replace(/\b([ap])\.?\s?m\b\.?/g, '$1m')
  const tokens = timeTokensIn(text)
  const between = (a: TimeToken, b: TimeToken): string =>
    text.slice(a.end, b.start)
  const slots: Slot[] = []
  let i = 0
  while (i < tokens.length) {
    const start = tokens[i] as TimeToken
    const next = tokens[i + 1]
    let slot: Slot
    if (next && RANGE_SEPARATOR.test(between(start, next))) {
      const startMinutes = resolve(start, inherited(start, next, true))
      const endMinutes = resolve(next, inherited(next, start, false))
      slot =
        startMinutes === undefined
          ? {}
          : { startTime: clock(startMinutes), endTime: clock(endMinutes) }
      i += 2
    } else {
      slot = { startTime: clock(resolve(start)) }
      i += 1
    }
    slots.push(slot)
    const following = tokens[i]
    const last = tokens[i - 1] as TimeToken
    if (!following || !LIST_SEPARATOR.test(between(last, following))) break
  }
  return slots
}

/* ── Parser ────────────────────────────────────────────────────────── */

export interface MeetingScheduleSource {
  meetingDay?: string | null
  meetingTime?: string | null
  /**
   * FAC Location, raw. Read only for the mode: its words count even on a
   * line the scrubber drops ("ZOOM - contact … for link" is online), but a
   * place only counts when a public line is left.
   */
  location?: string | null
}

function compact(entry: MeetingScheduleEntry): MeetingScheduleEntry {
  return Object.fromEntries(
    Object.entries(entry).filter(([, v]) => v !== undefined)
  ) as MeetingScheduleEntry
}

/**
 * Parse FAC free text into meetingSchedule[] entries. Undefined when the
 * day text names no weekday.
 */
export function parseMeetingSchedule(
  source: MeetingScheduleSource
): MeetingScheduleEntry[] | undefined {
  if (typeof source.meetingDay !== 'string') return undefined
  const dayText = fold(source.meetingDay)
  const days = weekdaysIn(dayText)
  if (days.length === 0) return undefined

  const { groups, loose } = weekGroupsIn(dayText)
  let cadence: Cadence | undefined
  if (BIWEEKLY.test(dayText)) cadence = 'biweekly'
  else if (groups.length > 0) cadence = 'monthly'
  else if (!UNCERTAIN_CADENCE.test(dayText)) cadence = 'weekly'

  const timeText =
    typeof source.meetingTime === 'string' ? fold(source.meetingTime) : ''
  const defaultMode =
    combineModes([...loose, ...modesIn(timeText)]) ??
    meetingModeFromText(source.location) ??
    meetingModeFromText(scrubFacLocation(source.location), { place: true })

  const slots = timeSlotsIn(source.meetingTime)
  const slotFor = (index: number): Slot =>
    (slots.length === days.length ? slots[index] : slots[0]) ?? {}

  const entries: MeetingScheduleEntry[] = []
  days.forEach((day, index) => {
    const { startTime, endTime } = slotFor(index)
    if (cadence === 'monthly') {
      for (const group of groups) {
        entries.push(
          compact({
            day,
            cadence,
            weeksOfMonth: group.weeks,
            startTime,
            endTime,
            mode: group.mode ?? defaultMode,
          })
        )
      }
    } else {
      entries.push(
        compact({ day, cadence, startTime, endTime, mode: defaultMode })
      )
    }
  })
  return entries
}

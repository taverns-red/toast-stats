/**
 * Meeting-time census (#2262, temporary; method of #2243) — read-only, public prod CDN, no credentials.
 *
 * For the latest snapshot, reads every district_{id}.json once, in memory,
 * and writes one JSONL row per club: district id, club id, the meetingTime
 * text (contact-scrubbed), the slots the published meetingSchedule[] holds,
 * the slots origin/main's parser ("base") and this branch's parser ("now")
 * give on the same input, and pattern labels. No address,
 * phone, email, link, location or person name is written.
 *
 *   npx tsx scripts/meeting-time-census.ts <out-dir>
 */
import { gunzipSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMeetingSchedule } from '../packages/collector-cli/src/services/FacMeetingSchedule.js'
import { parseMeetingSchedule as parseBase } from '../packages/collector-cli/src/services/FacMeetingScheduleBase.js'

const CDN = 'https://cdn.taverns.red'

async function get(path: string): Promise<unknown> {
  const r = await fetch(`${CDN}/${path}`)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  let b = Buffer.from(await r.arrayBuffer())
  if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b)
  return JSON.parse(b.toString('utf8'))
}

/** Drop anything contact-like; keep the time words. */
function scrub(text: string): string {
  return text
    .replace(/\S+@\S+/g, '[email]')
    .replace(
      /\b(pwd|passcode|password|pass|code|pin|id)\b[\s:#=]*\S+/gi,
      '$1 [redacted]'
    )
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '[url]')
    .replace(/\+?\(?\d[\d\s().-]*\d/g, m =>
      m.replace(/\D/g, '').length >= 7 ? '[digits]' : m
    )
    .replace(
      /\b(contact|call|ask|text|email|whatsapp|wechat|line|with|by)\b[\s:]*[^\s,;.]+(?:\s+[A-Z][^\s,;.]*)?/gi,
      '$1 [redacted]'
    )
    .slice(0, 120)
}

const PATTERNS: [string, RegExp][] = [
  ['dot-minutes', /\d\.\d{2}/],
  [
    'bare-hour-range',
    /\b\d{1,2}\s*(?:-|–|to|a)\s*\d{1,2}(?::\d{2})?\s*[ap]\.?\s?m/i,
  ],
  ['arrive-for', /\bfor\b/i],
  ['hhmm-4-digit', /(?<![\d:.])\d{4}(?![\d:.])/],
  ['hrs-hours-horas', /\b(?:hrs?|hours|horas?|uhr)\b/i],
  ['h-notation', /\d\s*h(?:\s*\d{2})?\b/i],
  ['tilde-range', /~|〜|～/],
  ['cjk', /[぀-ヿ㐀-鿿가-힯]/],
  ['full-width-digits', /[０-９：]/],
  ['noon-midnight', /noon|midi|midnight|mediod|meio-dia|mezzogiorno/i],
  ['12-am', /\b12(?::00)?\s*a\.?\s?m/i],
  [
    'weekday-in-time',
    /\b(?:mon|tue|wed|thu|fri|sat|sun|lun|mar|mie|jue|vie|sab|dom)[a-z]*\b/i,
  ],
  [
    'bare-24h-range',
    /^\s*\d{1,2}[:.h]\d{2}\s*(?:-|–|~|to|a)\s*\d{1,2}[:.h]\d{2}\s*$/i,
  ],
  ['question-marks', /\?{2,}/],
  [
    'tz-suffix',
    /\b(?:e[sd]t|c[sd]t|p[sd]t|cet|cest|kst|ist|aest|acst|sast|cat|gmt|utc|et|pt|bd)\b/i,
  ],
  [
    'non-english-words',
    /\b(?:tarde|noche|manana|mañana|soir|matin|abends|morgens|ore|uur|aanvang)\b/i,
  ],
  ['no-digits', /^[^\d０-９]*$/],
]

/** Day text reduced to whitelisted calendar words only (weekdays in
 *  en/fr/es/pt/nl/de/it, ordinals, cadence), so the parser can be re-run
 *  on the artifact without carrying free text. */
const WEEKDAYS = [
  'monday|tuesday|wednesday|thursday|friday|saturday|sunday',
  'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche',
  'lunes|martes|miercoles|jueves|viernes|sabado|domingo',
  'segunda|terca|quarta|quinta|sexta|feira',
  'maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag',
  'montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag',
  'lunedi|martedi|mercoledi|giovedi|venerdi',
].join('|')
const DAY_WORD = new RegExp(
  `^(?:\\d+(?:st|nd|rd|th|er|e|o|a|ro|do|to)?\\.?|&|and|y|et|of|the|each|every|month|week|weekly|bi-?weekly|other|first|second|third|fourth|fifth|last|primer|tercer|cuarto|quinto|premier|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun|(?:${WEEKDAYS})(?:s|es|avond|abend)?|(?:mon|tues|wednes|thurs|fri|satur|sun)days?)$`
)

function dayWordsOf(day: string | null | undefined): string | null {
  if (typeof day !== 'string') return null
  return day
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[\s,;/()\-–]+/)
    .filter(w => DAY_WORD.test(w))
    .join(' ')
}

function patternsOf(time: string): string[] {
  return PATTERNS.filter(([, re]) => re.test(time)).map(([name]) => name)
}

interface Club {
  clubId?: string
  meetingDay?: string | null
  meetingTime?: string | null
  meetingSchedule?: { day: string; startTime?: string }[]
}

const slots = (
  s: { day: string; startTime?: string; endTime?: string }[] | undefined
): string =>
  s === undefined
    ? 'NODAY'
    : s
        .map(
          e =>
            `${e.day.slice(0, 3)} ${e.startTime ?? '?'}${e.endTime ? '-' + e.endTime : ''}`
        )
        .join(',')

async function main(): Promise<void> {
  const out = process.argv[2] ?? 'census-out'
  mkdirSync(out, { recursive: true })
  const manifest = (await get('v1/latest.json')) as {
    latestSnapshotDate: string
  }
  const date = manifest.latestSnapshotDate
  const rankings = (await get(
    `snapshots/${date}/all-districts-rankings.json`
  )) as { rankings: { districtId: string }[] }
  const rows: string[] = []
  const errors: string[] = []
  for (const { districtId } of rankings.rankings) {
    try {
      const file = (await get(
        `snapshots/${date}/district_${districtId}.json`
      )) as {
        data: { clubs: Club[] }
      }
      for (const c of file.data.clubs) {
        const time = typeof c.meetingTime === 'string' ? c.meetingTime : null
        const input = { meetingDay: c.meetingDay, meetingTime: c.meetingTime }
        const now = parseMeetingSchedule(input)
        const base = parseBase(input)
        rows.push(
          JSON.stringify({
            d: districtId,
            club: c.clubId,
            dayWords: dayWordsOf(c.meetingDay),
            time: time === null ? null : scrub(time),
            prod: c.meetingSchedule ? slots(c.meetingSchedule) : 'NODAY',
            base: slots(base),
            now: slots(now),
            days: new Set((now ?? []).map(e => e.day)).size,
            patterns: time === null ? [] : patternsOf(time),
          })
        )
      }
    } catch (e) {
      errors.push(`${districtId}: ${(e as Error).message}`)
    }
  }
  writeFileSync(join(out, 'meeting-times.jsonl'), rows.join('\n') + '\n')
  writeFileSync(
    join(out, 'meta.json'),
    JSON.stringify(
      { date, districts: rankings.rankings.length, clubs: rows.length, errors },
      null,
      2
    )
  )
  console.error(`census ${date}: ${rows.length} clubs, ${errors.length} errors`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

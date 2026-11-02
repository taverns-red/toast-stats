import { describe, it, expect } from 'vitest'
import {
  DEADLINES_ICS_FILE,
  buildDeadlinesIcs,
  feedProgramYears,
} from '../deadlinesIcs'
import { deadlinesIcsPlugin } from '../deadlinesIcsPlugin'
import { deadlinesForProgramYear } from '../programYearDeadlines'

/* #2429 — the deadline table as a static iCalendar file, generated at build
   time from the same cited table the page reads. No calendar parser is a
   dependency of this repo, so the test carries its own RFC 5545 reader: it
   checks the line grammar (§3.1), folding (§3.1), component nesting and the
   required properties (§3.4, §3.6, §3.6.1), the value formats (§3.3.4,
   §3.3.5) and TEXT escaping (§3.3.11), then hands back the events. */

interface IcsProperty {
  name: string
  params: Record<string, string>
  value: string
}
interface IcsComponent {
  name: string
  props: IcsProperty[]
  children: IcsComponent[]
}

const CONTENT_LINE =
  /^([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^";:,]*))*):(.*)$/
const UTC_DATE_TIME = /^\d{8}T\d{6}Z$/
const DATE = /^(\d{4})(\d{2})(\d{2})$/

function isRealDate(value: string): boolean {
  const m = DATE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!))
  return (
    d.getUTCFullYear() === +m[1]! &&
    d.getUTCMonth() === +m[2]! - 1 &&
    d.getUTCDate() === +m[3]!
  )
}

/** Unescape an RFC 5545 TEXT value, failing on a bare `;` or `,`. */
function unescapeText(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!
    if (c === '\\') {
      const next = value[++i]
      if (next === 'n' || next === 'N') out += '\n'
      else if (next === '\\' || next === ';' || next === ',') out += next
      else throw new Error(`Bad TEXT escape \\${next ?? ''} in ${value}`)
    } else if (c === ';' || c === ',') {
      throw new Error(`Unescaped "${c}" in TEXT value: ${value}`)
    } else out += c
  }
  return out
}

/** A strict RFC 5545 reader for what the feed emits. Throws on any breach. */
function parseIcs(ics: string): IcsComponent {
  if (!ics.endsWith('\r\n')) throw new Error('Must end with CRLF (§3.1)')
  const physical = ics.slice(0, -2).split('\r\n')
  for (const line of physical) {
    if (/[\r\n]/.test(line)) throw new Error('Bare CR or LF (§3.1)')
    if (new TextEncoder().encode(line).length > 75) {
      throw new Error(`Line over 75 octets (§3.1): ${line}`)
    }
  }
  // Unfold: a line starting with one space or tab continues the previous.
  const lines: string[] = []
  for (const line of physical) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (lines.length === 0) throw new Error('Fold before any line')
      lines[lines.length - 1] += line.slice(1)
    } else lines.push(line)
  }

  const stack: IcsComponent[] = []
  let root: IcsComponent | null = null
  for (const line of lines) {
    const m = CONTENT_LINE.exec(line)
    if (!m) throw new Error(`Not a content line (§3.1): ${line}`)
    const name = m[1]!.toUpperCase()
    const params: Record<string, string> = {}
    for (const p of m[2]!.split(';').slice(1)) {
      const [k, v] = p.split('=') as [string, string]
      params[k.toUpperCase()] = v
    }
    const value = m[3]!
    if (name === 'BEGIN') {
      const comp: IcsComponent = { name: value, props: [], children: [] }
      if (stack.length === 0) {
        if (root) throw new Error('More than one top-level component')
        root = comp
      } else stack[stack.length - 1]!.children.push(comp)
      stack.push(comp)
    } else if (name === 'END') {
      const open = stack.pop()
      if (!open || open.name !== value) {
        throw new Error(`END:${value} does not close ${open?.name}`)
      }
    } else {
      const open = stack[stack.length - 1]
      if (!open) throw new Error(`Property outside a component: ${line}`)
      open.props.push({ name, params, value })
    }
  }
  if (stack.length) throw new Error(`Unclosed ${stack[0]!.name}`)
  if (!root || root.name !== 'VCALENDAR') throw new Error('No VCALENDAR')

  const one = (c: IcsComponent, prop: string): IcsProperty => {
    const found = c.props.filter(p => p.name === prop)
    if (found.length !== 1) {
      throw new Error(
        `${c.name} needs exactly one ${prop}, has ${found.length}`
      )
    }
    return found[0]!
  }
  // §3.6: PRODID and VERSION are required, once each.
  one(root, 'PRODID')
  if (one(root, 'VERSION').value !== '2.0') throw new Error('VERSION not 2.0')
  if (root.children.length === 0) throw new Error('No components (§3.6)')

  const uids = new Set<string>()
  for (const ev of root.children) {
    if (ev.name !== 'VEVENT') throw new Error(`Unexpected ${ev.name}`)
    // §3.6.1: UID and DTSTAMP required; DTSTART required without METHOD.
    const uid = one(ev, 'UID').value
    if (uids.has(uid)) throw new Error(`Duplicate UID ${uid}`)
    uids.add(uid)
    if (!UTC_DATE_TIME.test(one(ev, 'DTSTAMP').value)) {
      throw new Error('DTSTAMP must be a UTC DATE-TIME (§3.8.7.2)')
    }
    const start = one(ev, 'DTSTART')
    const end = one(ev, 'DTEND')
    for (const p of [start, end]) {
      if (p.params['VALUE'] !== 'DATE' || !isRealDate(p.value)) {
        throw new Error(`${p.name} is not a DATE (§3.3.4): ${p.value}`)
      }
    }
    if (!(end.value > start.value)) throw new Error('DTEND not after DTSTART')
    for (const p of ev.props) {
      if (p.name === 'SUMMARY' || p.name === 'DESCRIPTION') {
        unescapeText(p.value)
      }
    }
  }
  return root
}

const text = (ev: IcsComponent, name: string): string =>
  unescapeText(ev.props.find(p => p.name === name)?.value ?? '')
const prop = (ev: IcsComponent, name: string): string =>
  ev.props.find(p => p.name === name)?.value ?? ''

const STAMP = new Date('2026-11-01T12:34:56Z')

describe('the RFC 5545 reader used here', () => {
  it('rejects what a calendar would reject', () => {
    const ok = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//x//y//EN',
      'BEGIN:VEVENT',
      'UID:a@b',
      'DTSTAMP:20261101T000000Z',
      'DTSTART;VALUE=DATE:20261130',
      'DTEND;VALUE=DATE:20261201',
      'SUMMARY:ok',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
    expect(() => parseIcs(ok.join('\r\n') + '\r\n')).not.toThrow()
    // LF line ends, a missing UID, an unescaped comma, a long line, a bad
    // date and a duplicate UID each fail.
    expect(() => parseIcs(ok.join('\n') + '\n')).toThrow()
    expect(() =>
      parseIcs(ok.filter(l => !l.startsWith('UID')).join('\r\n') + '\r\n')
    ).toThrow(/UID/)
    expect(() =>
      parseIcs(ok.join('\r\n').replace('SUMMARY:ok', 'SUMMARY:a,b') + '\r\n')
    ).toThrow(/Unescaped/)
    expect(() =>
      parseIcs(
        ok.join('\r\n').replace('SUMMARY:ok', `SUMMARY:${'x'.repeat(80)}`) +
          '\r\n'
      )
    ).toThrow(/75 octets/)
    expect(() =>
      parseIcs(ok.join('\r\n').replace('20261130', '20260231') + '\r\n')
    ).toThrow(/DATE/)
    const twice = [...ok.slice(0, 10), ...ok.slice(3, 10), 'END:VCALENDAR']
    expect(() => parseIcs(twice.join('\r\n') + '\r\n')).toThrow(/Duplicate/)
  })
})

describe('buildDeadlinesIcs (#2429)', () => {
  const ics = buildDeadlinesIcs(['2026-2027', '2027-2028'], STAMP)
  const cal = parseIcs(ics)

  it('is a valid RFC 5545 calendar with one all-day event per deadline', () => {
    const table = [
      ...deadlinesForProgramYear('2026-2027'),
      ...deadlinesForProgramYear('2027-2028'),
    ]
    expect(cal.children).toHaveLength(table.length)
    expect(cal.children.map(ev => prop(ev, 'DTSTART'))).toEqual(
      table.map(d => d.date.replace(/-/g, ''))
    )
    expect(cal.children.map(ev => text(ev, 'SUMMARY'))).toEqual(
      table.map(d => d.label)
    )
  })

  it('ends each all-day event the next day (DTEND is exclusive)', () => {
    const r2close = cal.children.find(
      ev => prop(ev, 'UID') === 'training-r2-close-2027-2028@ts.taverns.red'
    )!
    expect(prop(r2close, 'DTSTART')).toBe('20280229')
    expect(prop(r2close, 'DTEND')).toBe('20280301')
  })

  it('derives each UID from the deadline id and program year only', () => {
    const uids = cal.children.map(ev => prop(ev, 'UID'))
    expect(uids).toContain('visits-r1-2026-2027@ts.taverns.red')
    expect(uids).toContain('visits-r1-2027-2028@ts.taverns.red')
    // A later build re-imports onto the same events.
    const later = parseIcs(
      buildDeadlinesIcs(
        ['2026-2027', '2027-2028'],
        new Date('2027-03-15T08:00:00Z')
      )
    )
    expect(later.children.map(ev => prop(ev, 'UID'))).toEqual(uids)
    expect(prop(later.children[0]!, 'DTSTAMP')).toBe('20270315T080000Z')
    expect(prop(cal.children[0]!, 'DTSTAMP')).toBe('20261101T123456Z')
  })

  it('names the cited owner, with its citation, and no owner where none is cited', () => {
    const byUid = (uid: string) =>
      cal.children.find(ev => prop(ev, 'UID') === uid)!
    const visit = text(
      byUid('visits-r1-2026-2027@ts.taverns.red'),
      'DESCRIPTION'
    )
    expect(visit).toContain('Owner: Area Director')
    expect(visit).toContain('Item 1490')
    expect(visit).toContain(
      'https://content.toastmasters.org/image/upload/1490-district-recognition-program.pdf'
    )
    const dues = text(
      byUid('dues-october-2026-2027@ts.taverns.red'),
      'DESCRIPTION'
    )
    expect(dues).toContain('Owner: Club Growth Director')
    expect(dues).toContain('Item 222 Rev. 03/2026, Club Growth Director, p. 25')
    // The date's own source is cited on every event, `;` and all.
    expect(dues).toContain('Item 1111')
    expect(dues).toContain('; https://www.toastmasters.org/')
    const csp = text(byUid('csp-2026-2027@ts.taverns.red'), 'DESCRIPTION')
    expect(csp).not.toContain('Owner')
    expect(csp).toContain('Item 1111')
  })
})

describe('feedProgramYears (#2429)', () => {
  it('covers the build date’s program year and the next one', () => {
    expect(feedProgramYears(new Date('2026-11-01T12:00:00Z'))).toEqual([
      '2026-2027',
      '2027-2028',
    ])
    expect(feedProgramYears(new Date('2027-06-30T23:00:00Z'))).toEqual([
      '2026-2027',
      '2027-2028',
    ])
    expect(feedProgramYears(new Date('2027-07-01T00:00:00Z'))).toEqual([
      '2027-2028',
      '2028-2029',
    ])
  })
})

describe('deadlinesIcsPlugin (#2429)', () => {
  it('emits the feed into the build as a static asset', () => {
    const emitted: { type: string; fileName: string; source: string }[] = []
    const plugin = deadlinesIcsPlugin(() => STAMP)
    const hook = plugin.generateBundle as unknown as (this: {
      emitFile: (f: (typeof emitted)[number]) => string
    }) => void
    hook.call({
      emitFile: f => {
        emitted.push(f)
        return 'ref'
      },
    })
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.type).toBe('asset')
    expect(emitted[0]!.fileName).toBe(DEADLINES_ICS_FILE)
    expect(emitted[0]!.source).toBe(
      buildDeadlinesIcs(feedProgramYears(STAMP), STAMP)
    )
    expect(() => parseIcs(emitted[0]!.source)).not.toThrow()
  })
})

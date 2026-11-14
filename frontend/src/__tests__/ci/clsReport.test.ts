import { describe, expect, it } from 'vitest'
import {
  CLS_REPORT_PREFIX,
  formatClsReport,
  reportCls,
  summarizeCls,
  type ClsShiftEntry,
} from '../../../e2e/helpers/clsReport'

const ENTRIES: ClsShiftEntry[] = [
  { t: 100, value: 0.02, sources: ['<DIV.a> y0 h10 -> y5 h10'] },
  {
    t: 200,
    value: 0.08,
    sources: ['<SECTION.kpi[strip]> y0 h50 -> y30 h50', '<P.x> y1 h1 -> y2 h1'],
  },
  { t: 300, value: 0.0001, sources: ['<I.tiny> y0 h1 -> y1 h1'] },
  { t: 400, value: 0.05, sources: ['<FOOTER.f> y9 h9 -> y90 h9'] },
]

describe('summarizeCls', () => {
  it('sums every entry into the total, to 5 places', () => {
    expect(summarizeCls(ENTRIES).total).toBe(0.1501)
  })

  it('ranks shift sources by their entry value, largest first, capped at topN', () => {
    const { top } = summarizeCls(ENTRIES, 3)
    expect(top).toEqual([
      { value: 0.08, t: 200, source: '<SECTION.kpi[strip]> y0 h50 -> y30 h50' },
      { value: 0.08, t: 200, source: '<P.x> y1 h1 -> y2 h1' },
      { value: 0.05, t: 400, source: '<FOOTER.f> y9 h9 -> y90 h9' },
    ])
  })

  it('reports zero and no sources for a page that never shifted', () => {
    expect(summarizeCls([])).toEqual({ total: 0, shifts: 0, top: [] })
  })
})

describe('formatClsReport', () => {
  it('is one prefixed line of JSON carrying label, total and top sources', () => {
    const line = formatClsReport('/district/61/clubs @375', ENTRIES, 1)
    expect(line.startsWith(`${CLS_REPORT_PREFIX} `)).toBe(true)
    expect(line).not.toContain('\n')
    const json = JSON.parse(line.slice(CLS_REPORT_PREFIX.length + 1))
    expect(json.label).toBe('/district/61/clubs @375')
    expect(json.total).toBe(0.1501)
    expect(json.shifts).toBe(4)
    expect(json.top).toHaveLength(1)
    expect(json.top[0].source).toContain('SECTION.kpi')
  })
})

describe('reportCls', () => {
  it('adds a cls annotation and returns the same line it logs', () => {
    const annotations: { type: string; description?: string }[] = []
    const logged: string[] = []
    const line = reportCls({ annotations }, 'landing @375', ENTRIES, {
      log: s => logged.push(s),
    })
    expect(annotations).toHaveLength(1)
    expect(annotations[0].type).toBe('cls')
    expect(annotations[0].description).toContain('0.1501')
    expect(logged).toEqual([line])
  })
})

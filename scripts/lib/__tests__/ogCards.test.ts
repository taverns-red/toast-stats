/**
 * Per-district Open Graph cards (#2304) — the pure half.
 *
 * The og-cards pipeline job renders one 1200x630 PNG per district from
 * staging's v1/rankings.json and snapshots/<date>/competitive-awards.json,
 * uploads them to staging og/v1/district/<id>.png, and copies them to prod
 * only when the data they were drawn from is what prod serves. These tests
 * pin the card content (Distinguished status + gap to the next tier, the
 * same integers the Overview trophy case shows), the PNG content check and
 * the promotion decision. Fixtures are trimmed real files (2026-06-30).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { deflateSync } from 'node:zlib'
import {
  buildDistrictCards,
  renderDistrictCardHtml,
  readPngSize,
  verifyCardSet,
  decideCardPromotion,
  formatAsOfDate,
  ogDistrictCardPath,
  OG_DISTRICT_PREFIX,
  OG_CACHE_CONTROL,
  OG_CONTENT_TYPE,
  OG_CARD_WIDTH,
  OG_CARD_HEIGHT,
} from '../ogCards.js'
import { DATA_PREFIXES } from '../videoPublish.js'

const FIX = path.join(process.cwd(), 'scripts/lib/__tests__/fixtures/og-cards')
const rankings = JSON.parse(
  fs.readFileSync(path.join(FIX, 'rankings.json'), 'utf8')
)
const awards = JSON.parse(
  fs.readFileSync(path.join(FIX, 'competitive-awards.json'), 'utf8')
)

/** A minimal valid PNG header (signature + IHDR) of the given size. */
function png(width: number, height: number, padTo = 20_000): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4, 'ascii')
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  const body = deflateSync(Buffer.alloc(16))
  const out = Buffer.concat([sig, ihdr, body])
  return out.length >= padTo
    ? out
    : Buffer.concat([out, Buffer.alloc(padTo - out.length)])
}

describe('buildDistrictCards', () => {
  const cards = buildDistrictCards(rankings, awards)
  const byId = new Map(cards.map(c => [c.districtId, c]))

  it('builds one card per district present in both inputs, sorted by id', () => {
    expect(cards.map(c => c.districtId)).toEqual([
      '10',
      '11',
      '17',
      '27',
      '59',
      '61',
    ])
  })

  it('names the district and prints the as-of date of the rankings', () => {
    const c = byId.get('61')!
    expect(c.title).toBe('District 61')
    expect(c.region).toBe('Region 5')
    expect(c.asOf).toBe('2026-06-30')
    expect(c.asOfLabel).toBe('Jun 30, 2026')
  })

  it('a district below Distinguished counts down with the canonical *Remaining fields', () => {
    const c = byId.get('11')!
    const ca = awards.distinguishedDistrict['11']
    expect(c.statusLabel).toBe('Not Yet Distinguished')
    expect(c.nextTierLabel).toBe('Distinguished District')
    expect(c.gaps).toEqual([
      { label: 'Paid Clubs', count: ca.paidClubsRemaining },
      { label: 'Payments', count: ca.paymentsRemaining },
      { label: 'Distinguished Clubs', count: ca.distinguishedClubsRemaining },
    ])
  })

  it('a Distinguished district counts down to Select from its rankings row (canonical fields are to the minimum tier)', () => {
    const c = byId.get('10')!
    expect(c.statusLabel).toBe('Distinguished District')
    expect(c.nextTierLabel).toBe('Select Distinguished District')
    // 50% of a 68-club base is 34; the district has 32 distinguished clubs.
    // Paid clubs (71 of 68) and payments (2,485 of 2,305) already clear +3%.
    expect(c.gaps).toEqual([
      { label: 'Paid Clubs', count: 0 },
      { label: 'Payments', count: 0 },
      { label: 'Distinguished Clubs', count: 2 },
    ])
  })

  it('a Smedley district has no next tier and no gaps', () => {
    const c = byId.get('17')!
    expect(c.statusLabel).toBe('Smedley Distinguished District')
    expect(c.nextTierLabel).toBeNull()
    expect(c.gaps).toEqual([])
  })

  it('skips a district the awards file does not cover (no made-up status)', () => {
    const partial = {
      ...awards,
      distinguishedDistrict: { '61': awards.distinguishedDistrict['61'] },
    }
    expect(
      buildDistrictCards(rankings, partial).map(c => c.districtId)
    ).toEqual(['61'])
  })

  it('refuses a district id that is not a plain id (path and markup safety)', () => {
    const bad = {
      ...rankings,
      rankings: [{ ...rankings.rankings[0], districtId: '../61' }],
    }
    const badAwards = {
      ...awards,
      distinguishedDistrict: {
        '../61': { ...awards.distinguishedDistrict['10'], districtId: '../61' },
      },
    }
    expect(() => buildDistrictCards(bad, badAwards)).toThrow(/district id/)
  })

  it('refuses a rankings file with no date or no rankings', () => {
    expect(() => buildDistrictCards({ rankings: [] }, awards)).toThrow(/date/)
    expect(() => buildDistrictCards({ date: '2026-06-30' }, awards)).toThrow(
      /rankings/
    )
  })
})

describe('formatAsOfDate', () => {
  it('formats a YYYY-MM-DD date without a timezone shift', () => {
    expect(formatAsOfDate('2026-10-01')).toBe('Oct 1, 2026')
    expect(formatAsOfDate('2026-07-31')).toBe('Jul 31, 2026')
  })
})

describe('renderDistrictCardHtml', () => {
  const cards = buildDistrictCards(rankings, awards)

  it('is a fixed 1200x630 page with the status, gaps and as-of date', () => {
    const html = renderDistrictCardHtml(cards.find(c => c.districtId === '11')!)
    expect(html).toContain('width: 1200px')
    expect(html).toContain('height: 630px')
    expect(html).toContain('District 11')
    expect(html).toContain('Not Yet Distinguished')
    expect(html).toContain('Gap to Distinguished District')
    expect(html).toContain('As of Jun 30, 2026')
    expect(html).toContain('ts.taverns.red')
  })

  it('shows a met metric as a check, and the top tier without gap tiles', () => {
    const d10 = renderDistrictCardHtml(cards.find(c => c.districtId === '10')!)
    expect(d10).toContain('✓')
    const d17 = renderDistrictCardHtml(cards.find(c => c.districtId === '17')!)
    expect(d17).not.toContain('Gap to')
    expect(d17).toContain('Top tier reached')
  })

  it('labels each tile as what is still needed, not as a count (#2389 review)', () => {
    const html = renderDistrictCardHtml(cards.find(c => c.districtId === '11')!)
    expect(html).toContain('Gap to Distinguished District')
    expect(html).toContain('>more paid clubs<')
    expect(html).toContain('>more payments<')
    expect(html).toContain('>more confirmed Distinguished clubs<')
    expect(html).not.toMatch(/>Paid Clubs<|>Payments<|>Distinguished Clubs</)
  })

  it('the Distinguished clubs tile says confirmed: the gap counts confirmed clubs, like the trophy case, not the KPI strip’s current count (Ron, 2026-10-28)', () => {
    const one = renderDistrictCardHtml({
      ...cards[0]!,
      nextTierLabel: 'Distinguished District',
      gaps: [{ label: 'Distinguished Clubs', count: 1 }],
    })
    expect(one).toContain('>more confirmed Distinguished club<')
  })

  it('a count of one is singular, and a met metric says met', () => {
    const one = renderDistrictCardHtml({
      ...cards[0]!,
      nextTierLabel: 'Distinguished District',
      gaps: [
        { label: 'Paid Clubs', count: 1 },
        { label: 'Payments', count: 1 },
        { label: 'Distinguished Clubs', count: 0 },
      ],
    })
    expect(one).toContain('>more paid club<')
    expect(one).toContain('>more payment<')
    expect(one).toContain('>Confirmed Distinguished clubs met<')
  })

  it('formats counts with thousands separators', () => {
    const c = {
      ...cards[0]!,
      gaps: [{ label: 'Payments', count: 2404 }],
    }
    expect(renderDistrictCardHtml(c)).toContain('2,404')
  })

  it('escapes markup in every text field', () => {
    const c = { ...cards[0]!, title: 'District <b>&', region: '"x"' }
    const html = renderDistrictCardHtml(c)
    expect(html).toContain('District &lt;b&gt;&amp;')
    expect(html).not.toContain('<b>&')
  })

  it('uses the legacy palette only: Loyal Blue, no --rt-stats amber or paper', () => {
    const html = renderDistrictCardHtml(cards[0]!).toLowerCase()
    expect(html).toContain('#004165')
    for (const banned of ['#d4873f', '--rt-stats', '#f4f1eb', '--rt-paper']) {
      expect(html).not.toContain(banned)
    }
  })

  it('embeds its fonts when given them, so the render needs no network', () => {
    const html = renderDistrictCardHtml(cards[0]!, '@font-face{x}')
    expect(html).toContain('@font-face{x}')
    expect(html).not.toMatch(/https?:\/\/fonts\./)
  })
})

describe('readPngSize / verifyCardSet', () => {
  const ids = ['10', '61']
  const good = () =>
    new Map(ids.map(id => [`${id}.png`, png(OG_CARD_WIDTH, OG_CARD_HEIGHT)]))

  it('reads a PNG IHDR size and rejects non-PNG bytes', () => {
    expect(readPngSize(png(1200, 630))).toEqual({ width: 1200, height: 630 })
    expect(readPngSize(Buffer.from('<html>not a png</html>'))).toBeNull()
  })

  it('passes exactly one 1200x630 PNG per card', () => {
    expect(verifyCardSet(ids, good())).toEqual({ ok: true, problems: [] })
  })

  it('fails a missing card, an extra file, a wrong size, a non-PNG and an implausible size', () => {
    const files = good()
    files.delete('10.png')
    files.set('99.png', png(1200, 630))
    files.set('61.png', png(600, 315))
    expect(verifyCardSet(ids, files).problems).toEqual([
      '10.png: missing',
      '61.png: 600x315, expected 1200x630',
      '99.png: not a planned card',
    ])
    const junk = new Map([
      ['10.png', Buffer.from('nope')],
      ['61.png', png(1200, 630, 100)],
    ])
    expect(verifyCardSet(ids, junk).problems).toEqual([
      '10.png: not a PNG',
      '61.png: 100 bytes, outside 5000..400000',
    ])
  })

  it('fails an empty plan (nothing to promote is not a pass)', () => {
    expect(verifyCardSet([], new Map()).ok).toBe(false)
  })
})

describe('decideCardPromotion', () => {
  const same = {
    stagingRankings: 'aaa==',
    prodRankings: 'aaa==',
    stagingAwards: 'bbb==',
    prodAwards: 'bbb==',
  }

  it('promotes when prod serves the exact rankings and awards the cards were drawn from', () => {
    expect(decideCardPromotion(same)).toEqual({ promote: true, reason: '' })
  })

  it('holds when either source differs (its date was held, or not yet promoted)', () => {
    expect(decideCardPromotion({ ...same, prodRankings: 'zzz==' })).toEqual({
      promote: false,
      reason:
        'prod v1/rankings.json differs from the staging copy the cards were drawn from',
    })
    expect(decideCardPromotion({ ...same, prodAwards: 'zzz==' }).promote).toBe(
      false
    )
  })

  it('fails closed on a missing hash', () => {
    expect(decideCardPromotion({ ...same, prodAwards: '' }).promote).toBe(false)
    expect(decideCardPromotion({ ...same, stagingRankings: '' }).promote).toBe(
      false
    )
  })
})

describe('placement', () => {
  it('cards live at og/v1/district/<id>.png', () => {
    expect(ogDistrictCardPath('61')).toBe('og/v1/district/61.png')
    expect(() => ogDistrictCardPath('61/../x')).toThrow(/district id/)
  })

  it('og/ is outside every prefix the data pipeline promotes, gates or prunes', () => {
    for (const p of DATA_PREFIXES) {
      expect(OG_DISTRICT_PREFIX.startsWith(p)).toBe(false)
      expect(p.startsWith('og/')).toBe(false)
    }
  })

  it('a stable URL overwritten daily: an hour of cache, PNG content type', () => {
    expect(OG_CACHE_CONTROL).toBe('public, max-age=3600')
    expect(OG_CONTENT_TYPE).toBe('image/png')
  })
})

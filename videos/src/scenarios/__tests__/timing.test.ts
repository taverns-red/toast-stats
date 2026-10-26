import { describe, expect, it } from 'vitest'
import { getScenario, SCENARIOS } from '../index'
import type { FormConfig, Scenario } from '../types'
import {
  countWords,
  MAX_CAPTION_WORDS,
  MAX_DURATION_SEC,
  validateScenario,
} from '../validate'

const captionsOf = (s: Scenario): string[] => [
  s.titleCard.caption,
  ...s.beats.map(b => b.caption),
  s.closing.caption,
  ...[s.titleCard.hint, s.closing.hint].filter(
    (h): h is string => h !== undefined
  ),
]

/** A minimal valid scenario; each sentinel breaks exactly one rule. */
function form(): FormConfig {
  return {
    device: {
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    readySelector: 'main',
    setup: [],
    beats: { a: { steps: [] }, b: { steps: [] } },
  }
}

function fixture(): Scenario {
  return {
    id: 'fixture',
    role: 'Tester',
    url: 'https://example.test/',
    fps: 30,
    durationSec: 14,
    titleCard: { startSec: 0, endSec: 3, caption: 'Title' },
    beats: [
      { id: 'a', startSec: 3, endSec: 7, caption: 'One' },
      { id: 'b', startSec: 7, endSec: 11, caption: 'Two' },
    ],
    closing: { startSec: 11, endSec: 14, caption: 'Bye' },
    forms: { desktop: form(), mobile: form() },
    music: 'music/x.wav',
  }
}

describe.each(Object.values(SCENARIOS))('scenario $id', scenario => {
  it(`is ${MAX_DURATION_SEC} s or shorter`, () => {
    expect(scenario.durationSec).toBeLessThanOrEqual(MAX_DURATION_SEC)
  })

  it('places every beat inside the duration', () => {
    for (const beat of scenario.beats) {
      expect(beat.startSec, beat.id).toBeGreaterThanOrEqual(0)
      expect(beat.endSec, beat.id).toBeLessThanOrEqual(scenario.durationSec)
      expect(beat.endSec, beat.id).toBeGreaterThan(beat.startSec)
    }
  })

  it(`keeps every caption to ${MAX_CAPTION_WORDS} words or fewer`, () => {
    for (const caption of captionsOf(scenario)) {
      expect(countWords(caption), caption).toBeLessThanOrEqual(
        MAX_CAPTION_WORDS
      )
      expect(countWords(caption), caption).toBeGreaterThan(0)
    }
  })

  it('passes every timing rule', () => {
    expect(validateScenario(scenario)).toEqual([])
  })
})

describe('countWords', () => {
  it('counts whitespace-separated words, ignoring punctuation-only tokens', () => {
    expect(
      countWords(
        'Four lists. Close to Distinguished, visits due, intervention, no CSP.'
      )
    ).toBe(10)
    expect(countWords("Your area's to-do list — built from the data.")).toBe(8)
  })

  it('counts a URL as one word', () => {
    expect(
      countWords(
        'Area Directors: ts.taverns.red/district/YOUR-DISTRICT/action-list'
      )
    ).toBe(3)
  })

  it('is zero for an empty caption', () => {
    expect(countWords('   ')).toBe(0)
  })
})

describe('validateScenario sentinels', () => {
  it('accepts the valid fixture', () => {
    expect(validateScenario(fixture())).toEqual([])
  })

  it('rejects a beat that ends after the duration', () => {
    const s = fixture()
    s.beats[1]!.endSec = 15
    s.closing = { ...s.closing, startSec: 15, endSec: 15 }
    expect(validateScenario(s).join('\n')).toMatch(/b.*after the duration/)
  })

  it('rejects a beat that starts before zero', () => {
    const s = fixture()
    s.beats[0]!.startSec = -1
    expect(validateScenario(s).join('\n')).toMatch(/a.*before 0/)
  })

  it(`rejects a caption over ${MAX_CAPTION_WORDS} words`, () => {
    const s = fixture()
    s.beats[0]!.caption =
      'one two three four five six seven eight nine ten eleven twelve thirteen'
    expect(validateScenario(s).join('\n')).toMatch(/13 words/)
  })

  it('rejects an empty caption', () => {
    const s = fixture()
    s.closing.caption = ''
    expect(validateScenario(s).join('\n')).toMatch(/empty caption/)
  })

  it(`rejects a duration over ${MAX_DURATION_SEC} s`, () => {
    const s = fixture()
    s.durationSec = 35
    s.closing = { ...s.closing, endSec: 35 }
    expect(validateScenario(s).join('\n')).toMatch(/35 s.*34 s/)
  })

  it('rejects overlapping or gapped beats', () => {
    const overlap = fixture()
    overlap.beats[1]!.startSec = 6
    expect(validateScenario(overlap).join('\n')).toMatch(/b.*starts at 6/)

    const gap = fixture()
    gap.beats[1]!.startSec = 8
    expect(validateScenario(gap).join('\n')).toMatch(/b.*starts at 8/)
  })

  it('rejects a beat too short to read', () => {
    const s = fixture()
    s.beats[0]!.endSec = 5
    s.beats[1]!.startSec = 5
    expect(validateScenario(s).join('\n')).toMatch(/a.*2 s.*at least 3 s/)
  })

  it('requires the title card at 0 and the closing card at the end', () => {
    const s = fixture()
    s.titleCard = { ...s.titleCard, startSec: 1 }
    s.closing = { ...s.closing, endSec: 13 }
    const problems = validateScenario(s).join('\n')
    expect(problems).toMatch(/title card must start at 0/)
    expect(problems).toMatch(/closing card must end at 14/)
  })

  it(`rejects a card hint over ${MAX_CAPTION_WORDS} words`, () => {
    const s = fixture()
    s.closing.hint =
      'one two three four five six seven eight nine ten eleven twelve thirteen'
    expect(validateScenario(s).join('\n')).toMatch(/closing card hint.*13/)
  })

  it('rejects an ALL-CAPS placeholder a viewer cannot fill in', () => {
    const s = fixture()
    s.closing.caption = 'Go to example.test/district/YOUR-DISTRICT/page'
    expect(validateScenario(s).join('\n')).toMatch(
      /closing card.*placeholder "YOUR-DISTRICT"/
    )
  })

  it('requires every form factor to script every beat, and no others', () => {
    const missing = fixture()
    delete missing.forms.mobile!.beats['b']
    expect(validateScenario(missing).join('\n')).toMatch(
      /mobile has no actions for beat "b"/
    )

    const extra = fixture()
    extra.forms.desktop.beats['zzz'] = { steps: [] }
    expect(validateScenario(extra).join('\n')).toMatch(
      /desktop scripts unknown beat "zzz"/
    )
  })

  it('requires at least one beat', () => {
    const s = fixture()
    s.beats = []
    expect(validateScenario(s).join('\n')).toMatch(/no beats/)
  })
})

describe('V2 closing card (Ron, PR #2295 review)', () => {
  it('shows a concrete example URL and says what the number means', () => {
    const { closing } = getScenario('v2')
    expect(closing.caption).toMatch(
      /ts\.taverns\.red\/district\/86\/action-list/
    )
    expect(closing.caption).not.toMatch(/YOUR-/)
    expect(closing.hint).toMatch(/86 = your district number/)
  })
})

describe('getScenario', () => {
  it('returns a registered scenario', () => {
    expect(getScenario('v2').role).toBe('Area Director')
  })

  it('names the known scenarios when the id is unknown', () => {
    expect(() => getScenario('nope')).toThrow(/Known: v2/)
  })
})

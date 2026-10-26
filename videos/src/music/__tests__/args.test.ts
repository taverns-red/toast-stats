import { describe, expect, it } from 'vitest'
import { parseMusicArgs } from '../args'
import { MUSIC_VARIANTS, TRACK_SEC } from '../variants'

// `npm run videos:music -- [variant…] [--seconds N]` → process.argv.slice(2)
describe('parseMusicArgs (#2336)', () => {
  it('defaults to every variant, 20-second clips', () => {
    expect(parseMusicArgs([])).toEqual({
      variants: MUSIC_VARIANTS.map(v => v.id),
      seconds: 20,
    })
  })

  it('takes named variants and --seconds in either form', () => {
    expect(parseMusicArgs(['light-pop', '--seconds', '12'])).toEqual({
      variants: ['light-pop'],
      seconds: 12,
    })
    expect(parseMusicArgs(['--seconds=8', 'bright-pluck'])).toEqual({
      variants: ['bright-pluck'],
      seconds: 8,
    })
  })

  it('rejects an unknown variant', () => {
    expect(() => parseMusicArgs(['dirge'])).toThrow(/Unknown music variant/)
  })

  it(`keeps --seconds between 5 and the track length (${TRACK_SEC} s)`, () => {
    expect(parseMusicArgs(['--seconds', String(TRACK_SEC)]).seconds).toBe(
      TRACK_SEC
    )
    for (const bad of ['4', String(TRACK_SEC + 1), 'ten', '']) {
      expect(() => parseMusicArgs(['--seconds', bad]), bad).toThrow(/--seconds/)
    }
  })
})

/**
 * Generator tests that need ffmpeg (#2336). Not in the default `vitest`
 * include, because main CI and the pre-push hook have no ffmpeg: they run
 * via `npm run test:audio` in videos.yml, after ffmpeg is installed, and
 * locally on any machine that has it. A missing ffmpeg fails, never skips.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { TARGET_LUFS, TRUE_PEAK_MAX_DB } from '../../music/master'
import { MUSIC_VARIANTS, TRACK_SEC } from '../../music/variants'
import { encodeClip, generateTrack, measureAudio } from '../music'

const dir = mkdtempSync(join(tmpdir(), 'music-2336-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const sha = (file: string): string =>
  createHash('sha256').update(readFileSync(file)).digest('hex')

describe.each(MUSIC_VARIANTS)('generated track $id', variant => {
  const wav = join(dir, `${variant.id}.wav`)
  generateTrack(variant.id, wav)
  const audio = measureAudio(wav)

  it(`covers the full track length (${TRACK_SEC} s)`, () => {
    expect(audio.durationSec).toBeCloseTo(TRACK_SEC, 2)
  })

  it(`is ${TARGET_LUFS} LUFS within 0.5 LU`, () => {
    expect(Math.abs(audio.integratedLufs - TARGET_LUFS)).toBeLessThanOrEqual(
      0.5
    )
  })

  it(`does not clip: true peak at or below ${TRUE_PEAK_MAX_DB} dBTP`, () => {
    expect(audio.truePeakDb).toBeLessThanOrEqual(TRUE_PEAK_MAX_DB)
    expect(audio.samplePeakDb).toBeLessThan(0)
  })

  it('is byte-for-byte deterministic', () => {
    const again = join(dir, `${variant.id}-again.wav`)
    generateTrack(variant.id, again)
    expect(sha(again)).toBe(sha(wav))
  })

  it('encodes a short AAC preview clip of the requested length', () => {
    const clip = join(dir, `${variant.id}.m4a`)
    encodeClip(wav, clip, 10)
    const preview = measureAudio(clip)
    expect(preview.codec).toBe('aac')
    expect(preview.durationSec).toBeGreaterThan(9.9)
    expect(preview.durationSec).toBeLessThan(10.2)
    expect(Math.abs(preview.integratedLufs - TARGET_LUFS)).toBeLessThan(1.5)
  })
})

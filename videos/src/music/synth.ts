import type { MusicVariant } from './variants'

export const SAMPLE_RATE = 48000
export const MIX_PEAK = 0.5

export function synthesize(
  _variant: MusicVariant,
  _durationSec: number
): { left: Float32Array; right: Float32Array } {
  throw new Error('not implemented (#2336 red)')
}

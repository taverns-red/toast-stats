export const TARGET_LUFS = -26
export const TRUE_PEAK_MAX_DB = -3

export interface Loudness {
  integratedLufs: number
  samplePeakDb: number
  truePeakDb: number
}

export function parseEbur128(_stderr: string): Loudness | null {
  throw new Error('not implemented (#2336 red)')
}

export function normalisationGainDb(
  _integratedLufs: number,
  _truePeakDb: number
): number {
  throw new Error('not implemented (#2336 red)')
}

export function encodeWav16(
  _left: Float32Array,
  _right: Float32Array,
  _sampleRate: number,
  _gainDb: number
): Buffer {
  throw new Error('not implemented (#2336 red)')
}

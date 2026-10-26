export interface MusicArgs {
  variants: string[]
  seconds: number
}

export function parseMusicArgs(_args: readonly string[]): MusicArgs {
  throw new Error('not implemented (#2336 red)')
}

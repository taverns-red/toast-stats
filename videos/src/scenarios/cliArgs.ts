import type { FormFactor } from './types'

export interface CliArgs {
  id: string
  format: FormFactor
}

export function parseCliArgs(_args: readonly string[]): CliArgs {
  return { id: '', format: 'desktop' }
}

export function outputName(_id: string, _format: FormFactor): string {
  return ''
}

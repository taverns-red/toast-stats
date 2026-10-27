import { getVariant } from '../music/variants'
import { FORM_FACTORS, type FormFactor } from './types'

export interface CliArgs {
  id: string
  format: FormFactor
  /** Generated music variant to use instead of the scenario's track (#2336). */
  music?: string
}

const USAGE =
  'Usage: npm run videos:<capture|render|build> -- <scenario> [--format desktop|mobile] [--music <variant>]'

function toFormat(value: string): FormFactor {
  const match = FORM_FACTORS.find(f => f === value)
  if (!match) {
    throw new Error(
      `Unknown format "${value}". Known: ${FORM_FACTORS.join(', ')}`
    )
  }
  return match
}

/**
 * Parse the arguments after `npm run videos:<cmd> --` (process.argv.slice(2)).
 * Desktop is the default form factor; `--music` picks a generated variant.
 */
export function parseCliArgs(args: readonly string[]): CliArgs {
  let id: string | undefined
  let format: FormFactor = 'desktop'
  let music: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg === '--format') {
      format = toFormat(args[++i] ?? '')
    } else if (arg.startsWith('--format=')) {
      format = toFormat(arg.slice('--format='.length))
    } else if (arg === '--music') {
      music = getVariant(args[++i] ?? '').id
    } else if (arg.startsWith('--music=')) {
      music = getVariant(arg.slice('--music='.length)).id
    } else if (!id) {
      id = arg
    }
  }
  if (!id) throw new Error(USAGE)
  return music ? { id, format, music } : { id, format }
}

/** Output basename: `v2` for desktop, `v2-mobile` for other form factors. */
export function outputName(id: string, format: FormFactor): string {
  return format === 'desktop' ? id : `${id}-${format}`
}

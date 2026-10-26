/**
 * `npm run videos:build -- <scenario> [--format mobile]` — re-record the
 * scenario on the live site, then render it: the one command to run after a
 * UI change (#2293). Desktop is the default format.
 */
import type { CliArgs } from '../scenarios/cliArgs'
import { capture } from './capture'
import { runIfMain } from './paths'
import { render } from './render'

export async function build(args: CliArgs): Promise<void> {
  await capture(args)
  await render(args)
}

runIfMain(import.meta.url, build)

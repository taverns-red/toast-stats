/**
 * `npm run videos:build -- <scenario>` — re-record the scenario on the live
 * site, then render it: the one command to run after a UI change (#2293).
 */
import { capture } from './capture'
import { runIfMain } from './paths'
import { render } from './render'

export async function build(id: string): Promise<void> {
  await capture(id)
  await render(id)
}

runIfMain(import.meta.url, build)

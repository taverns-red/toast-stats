import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import postcss from 'postcss'

// #1851 — a comment whose opener is lost turns its prose into a selector and
// swallows the next rule: "Cmd-K / Ctrl-K modal. … (comment close)
// .command-palette__backdrop" parsed as one bogus selector, so the palette
// backdrop lost its styles (and Prettier reflowed the prose one word per
// line). Parse the real file and check no rule selector carries a stray
// comment tail.

const __dirname = dirname(fileURLToPath(import.meta.url))
const appShellCss = readFileSync(
  resolve(__dirname, '../components/app-shell.css'),
  'utf-8'
)

describe('app-shell.css comment integrity (#1851)', () => {
  const selectors: string[] = []
  postcss.parse(appShellCss).walkRules(rule => {
    selectors.push(rule.selector)
  })

  it('has no rule selector containing a stray comment terminator', () => {
    expect(selectors.filter(s => s.includes('*/'))).toEqual([])
  })

  it('keeps the command palette backdrop as its own rule', () => {
    expect(selectors).toContain('.command-palette__backdrop')
  })
})

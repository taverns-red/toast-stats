/**
 * Brand font fallbacks (#2249, review S6). The Red Vote block is the first
 * live consumer of Space Grotesk and Inter, so the metric-matched fallback
 * faces the file header had only recorded must now exist, and the block's
 * stacks must name them, or the swap reflows the block.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fallbacks = readFileSync(
  resolve(here, '../tokens/font-fallbacks.css'),
  'utf8'
)
const block = readFileSync(
  resolve(here, '../components/red-vote-block.css'),
  'utf8'
)

describe('Space Grotesk / Inter fallback faces (#2249)', () => {
  it.each(['Space Grotesk', 'Inter'])(
    "declares a size-adjusted '%s Fallback' face",
    family => {
      const re = new RegExp(
        `@font-face\\s*\\{[^}]*font-family:\\s*'${family} Fallback'[^}]*size-adjust:\\s*[\\d.]+%[^}]*\\}`
      )
      expect(fallbacks).toMatch(re)
    }
  )

  it('the Red Vote block stacks name the fallback faces', () => {
    expect(block).toMatch(/'Space Grotesk',\s*'Space Grotesk Fallback'/)
    expect(block).toMatch(/'Inter',\s*'Inter Fallback'/)
  })

  it('no longer claims the brand pair has no live consumer', () => {
    expect(fallbacks).not.toMatch(/zero live consumers/)
  })
})

describe('the brand web fonts are not referenced until the block is near (#2249 LCP)', () => {
  it('base stacks name only the fallback faces; the modifier names the web fonts', () => {
    const base =
      /\.red-vote-block__heading\s*\{[^}]*font-family:\s*([^;]+);/.exec(block)
    expect(base, 'heading rule').not.toBeNull()
    expect(base![1]).toMatch(/'Space Grotesk Fallback'/)
    expect(base![1]).not.toMatch(/'Space Grotesk',/)
    expect(block).toMatch(
      /\.red-vote-block--brand-fonts\s+\.red-vote-block__heading[^{]*\{[^}]*'Space Grotesk',\s*'Space Grotesk Fallback'/
    )
    expect(block).toMatch(
      /\.red-vote-block--brand-fonts\s+\.red-vote-block__body[^{]*\{[^}]*'Inter',\s*'Inter Fallback'/
    )
  })
})

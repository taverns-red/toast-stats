import { describe, expect, it } from 'vitest'
import {
  contrast,
  declsFor,
  over,
  parseColor,
  prop,
  readSrcCss,
  tokens,
  type Rgba,
} from './cssColor'

const AA = 4.5
const VISIBLE = 1.1
const darkCss = readSrcCss('styles/dark-mode.css')
const darkTokens = tokens('dark')
const cardSurface = parseColor('var(--surface-card)', darkTokens)

const darkFill = (selector: string): Rgba => {
  const declarations = declsFor(darkCss, `[data-theme='dark'] ${selector}`)
  const colour = prop(declarations, 'background-color')
  expect(colour, `dark fill rule for ${selector}`).toBeDefined()
  expect(declarations, `important dark fill rule for ${selector}`).toMatch(
    /background-color:[^;]+!important/
  )
  return over(parseColor(colour!, darkTokens), cardSurface)
}

const darkText = (selector: string): Rgba => {
  const colour = prop(
    declsFor(darkCss, `[data-theme='dark'] ${selector}`),
    'color'
  )
  expect(colour, `dark text rule for ${selector}`).toBeDefined()
  return parseColor(colour!, darkTokens)
}

type ButtonState = {
  name: string
  rest: Rgba
  text: Rgba
  states: { name: string; selector: string }[]
}

const variants: ButtonState[] = [
  {
    name: 'primary',
    rest: darkFill('.bg-tm-loyal-blue'),
    text: parseColor('#ffffff', darkTokens),
    states: [
      {
        name: 'hover',
        selector: '.hover\\:bg-tm-loyal-blue\\/90:hover',
      },
      {
        name: 'active',
        selector: '.active\\:bg-tm-loyal-blue\\/80:active',
      },
    ],
  },
  {
    name: 'accent',
    rest: darkFill('.bg-tm-happy-yellow'),
    text: darkText('.text-tm-black'),
    states: [
      {
        name: 'hover',
        selector: '.hover\\:bg-tm-happy-yellow\\/90:hover',
      },
      {
        name: 'active',
        selector: '.active\\:bg-tm-happy-yellow\\/80:active',
      },
    ],
  },
  {
    name: 'ghost',
    rest: cardSurface,
    text: darkText('.text-tm-loyal-blue'),
    states: [
      {
        name: 'hover',
        selector: '.hover\\:bg-tm-loyal-blue\\/10:hover',
      },
    ],
  },
]

describe('dark button state feedback', () => {
  it.each(variants)('$name states are visible and readable', variant => {
    for (const state of variant.states) {
      const fill = darkFill(state.selector)
      expect(
        contrast(fill, variant.rest),
        `${variant.name} ${state.name} differs from rest`
      ).toBeGreaterThanOrEqual(VISIBLE)
      expect(
        contrast(variant.text, fill),
        `${variant.name} ${state.name} text`
      ).toBeGreaterThanOrEqual(AA)
    }
  })
})

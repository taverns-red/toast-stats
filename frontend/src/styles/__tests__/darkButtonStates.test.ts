import { describe, expect, it } from 'vitest'
import {
  contrast,
  declsFor,
  over,
  parseColor,
  prop,
  readSrcCss,
  surfaces,
  tokens,
  type Rgba,
} from './cssColor'

const AA = 4.5
// 1.2:1 between rest and hover is about the smallest step a reader notices
// on these dark fills; below it the state change is easy to miss.
const VISIBLE = 1.2
const darkCss = readSrcCss('styles/dark-mode.css')
const darkTokens = tokens('dark')
const darkSurfaces: Rgba[] = [
  ...surfaces('dark'),
  parseColor('var(--surface-3)', darkTokens),
]

const ruleColour = (selector: string, name: string): string => {
  const decls = declsFor(darkCss, `[data-theme='dark'] ${selector}`)
  const colour = prop(decls, name)
  expect(colour, `dark ${name} rule for ${selector}`).toBeDefined()
  expect(decls, `important dark ${name} rule for ${selector}`).toMatch(
    new RegExp(`${name}:[^;]+!important`)
  )
  return colour!
}

const fill = (selector: string) => {
  const colour = parseColor(
    ruleColour(selector, 'background-color'),
    darkTokens
  )
  return (surface: Rgba) => over(colour, surface)
}

type Variant = {
  name: string
  rest: (surface: Rgba) => Rgba
  text: Rgba
  states: { name: string; selector: string }[]
}

const variants: Record<string, () => Variant> = {
  primary: () => ({
    name: 'primary',
    rest: fill('.bg-tm-loyal-blue'),
    text: parseColor('#ffffff', darkTokens),
    states: [
      {
        name: 'hover',
        selector: '.hover\\:bg-tm-loyal-blue\\/90:hover:not(:disabled)',
      },
      {
        name: 'active',
        selector: '.active\\:bg-tm-loyal-blue\\/80:active:not(:disabled)',
      },
    ],
  }),
  accent: () => ({
    name: 'accent',
    rest: fill('.bg-tm-happy-yellow'),
    text: parseColor(
      ruleColour('.bg-tm-happy-yellow.text-tm-black', 'color'),
      darkTokens
    ),
    states: [
      {
        name: 'hover',
        selector: '.hover\\:bg-tm-happy-yellow\\/90:hover:not(:disabled)',
      },
      {
        name: 'active',
        selector: '.active\\:bg-tm-happy-yellow\\/80:active:not(:disabled)',
      },
    ],
  }),
  ghost: () => ({
    name: 'ghost',
    rest: surface => surface,
    text: parseColor(ruleColour('.text-tm-loyal-blue', 'color'), darkTokens),
    states: [
      {
        name: 'hover',
        selector: '.hover\\:bg-tm-loyal-blue\\/10:hover:not(:disabled)',
      },
    ],
  }),
}

describe('dark button state feedback', () => {
  it.each(['primary', 'accent', 'ghost'])(
    '%s is readable at rest and shows hover and press',
    name => {
      const variant = variants[name]()
      for (const surface of darkSurfaces) {
        const rest = variant.rest(surface)
        expect(
          contrast(variant.text, rest),
          `${variant.name} rest text`
        ).toBeGreaterThanOrEqual(AA)
        for (const state of variant.states) {
          const stateFill = fill(state.selector)(surface)
          expect(
            contrast(stateFill, rest),
            `${variant.name} ${state.name} differs from rest`
          ).toBeGreaterThanOrEqual(VISIBLE)
          expect(
            contrast(variant.text, stateFill),
            `${variant.name} ${state.name} text`
          ).toBeGreaterThanOrEqual(AA)
        }
      }
    }
  )
})

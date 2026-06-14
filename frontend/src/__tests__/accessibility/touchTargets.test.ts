/**
 * Touch Target Accessibility — interactive-element detection
 *
 * **Validates: Requirements 3.2** (brand-compliance Property 4: interactive
 * elements must meet the 44px touch-target floor).
 *
 * The `useTouchTarget` React hook that previously wrapped this logic was
 * unreachable production code and was removed in #1114. The *size* assertion
 * (44px geometry) is owned by the live Playwright smoke
 * (`e2e/touch-targets.smoke.ts`), which measures real rendered boxes — jsdom
 * geometry mocks can't (L66/L134). What remains genuinely unit-testable here is
 * `isInteractiveElement`, which inspects real DOM (tag/role/tabindex/onclick)
 * with no geometry mock. It is exercised directly from its source module,
 * `utils/touchTargetUtils.ts` — the same module the e2e smoke imports its
 * selector set from, so unit and e2e stay anchored to one definition (R20).
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { isInteractiveElement } from '../../utils/touchTargetUtils'

const interactiveTagArbitrary = fc.constantFrom(
  'button',
  'a',
  'input',
  'select',
  'textarea'
)
const interactiveRoleArbitrary = fc.constantFrom(
  'button',
  'link',
  'menuitem',
  'tab'
)

function createElement(
  tag: string,
  attributes: Record<string, string> = {}
): HTMLElement {
  const element = document.createElement(tag)
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value)
  })
  return element
}

describe('Touch Target Accessibility — isInteractiveElement', () => {
  describe('Property: interactive detection', () => {
    it('should correctly identify interactive elements by tag', () => {
      fc.assert(
        fc.property(interactiveTagArbitrary, tag => {
          const element = createElement(tag, tag === 'a' ? { href: '#' } : {})
          expect(isInteractiveElement(element)).toBe(true)
        }),
        { numRuns: 30 }
      )
    })

    it('should correctly identify elements with interactive roles', () => {
      fc.assert(
        fc.property(interactiveRoleArbitrary, role => {
          const element = createElement('div', { role })
          expect(isInteractiveElement(element)).toBe(true)
        }),
        { numRuns: 30 }
      )
    })
  })

  describe('Interactive element detection', () => {
    it('should detect all standard interactive elements', () => {
      const interactiveElements: Array<{
        tag: string
        attrs: Record<string, string>
      }> = [
        { tag: 'button', attrs: {} },
        { tag: 'a', attrs: { href: '#' } },
        { tag: 'input', attrs: { type: 'text' } },
        { tag: 'input', attrs: { type: 'button' } },
        { tag: 'select', attrs: {} },
        { tag: 'textarea', attrs: {} },
      ]

      interactiveElements.forEach(({ tag, attrs }) => {
        const element = createElement(tag, attrs)
        expect(isInteractiveElement(element)).toBe(true)
      })
    })

    it('should not detect non-interactive elements', () => {
      const nonInteractiveElements = ['div', 'span', 'p', 'h1', 'img']

      nonInteractiveElements.forEach(tag => {
        const element = createElement(tag)
        expect(isInteractiveElement(element)).toBe(false)
      })
    })

    it('should detect elements with tabindex', () => {
      const element = createElement('div', { tabindex: '0' })
      expect(isInteractiveElement(element)).toBe(true)

      const negativeTabIndex = createElement('div', { tabindex: '-1' })
      expect(isInteractiveElement(negativeTabIndex)).toBe(false)
    })

    it('should detect elements with onclick handlers', () => {
      const element = createElement('div', { onclick: 'return false;' })
      expect(isInteractiveElement(element)).toBe(true)
    })
  })
})

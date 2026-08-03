/* methodologyUrl codec — the URL contract for /methodology open-section state
   (#981, epic #969 Sprint 5). The parse is the chokepoint every entry path
   (typed URL, shared link, back button) flows through, so the whitelist /
   dedup invariants are asserted here, not only at the handler (Lesson 144). */

import { describe, it, expect } from 'vitest'
import {
  OPEN_SECTIONS_PARAM,
  parseOpenSections,
  serializeOpenSections,
  resolveHashTarget,
} from '../methodologyUrl'

const VALID = new Set(['borda-count', 'glossary', 'caveats'])
const parse = parseOpenSections(VALID)

// Deep-linkable anchors *inside* a section (#1400 rule-change entries): the
// fragment names the entry, but the section is what has to be expanded.
const ANCHORS = new Map([
  ['py-2026-2027-dcp-goals-2-3-eom', 'caveats'],
  ['py-2025-2026-club-success-plan-required', 'caveats'],
])

describe('methodologyUrl — parseOpenSections', () => {
  it('keeps only whitelisted section ids', () => {
    expect(parse('borda-count,bogus,glossary')).toEqual([
      'borda-count',
      'glossary',
    ])
  })

  it('drops an entirely unknown value to an empty list (no phantom seed)', () => {
    expect(parse('not-a-section')).toEqual([])
  })

  it('de-dups repeated ids, preserving first-seen order', () => {
    expect(parse('glossary,borda-count,glossary')).toEqual([
      'glossary',
      'borda-count',
    ])
  })

  it('trims whitespace and ignores empty segments', () => {
    expect(parse(' borda-count , , glossary ')).toEqual([
      'borda-count',
      'glossary',
    ])
  })

  it('returns an empty list for an empty string', () => {
    expect(parse('')).toEqual([])
  })
})

describe('methodologyUrl — serializeOpenSections', () => {
  it('joins ids with commas', () => {
    expect(serializeOpenSections(['borda-count', 'glossary'])).toBe(
      'borda-count,glossary'
    )
  })

  it('serializes an empty list to the empty string (the clean-URL default)', () => {
    expect(serializeOpenSections([])).toBe('')
  })

  it('round-trips through parse', () => {
    const ids = ['glossary', 'caveats']
    expect(parse(serializeOpenSections(ids))).toEqual(ids)
  })
})

describe('methodologyUrl — resolveHashTarget', () => {
  it('resolves a leading-# section fragment to itself', () => {
    expect(resolveHashTarget('#borda-count', VALID, ANCHORS)).toEqual({
      sectionId: 'borda-count',
      scrollToId: 'borda-count',
    })
  })

  it('resolves a bare id too', () => {
    expect(resolveHashTarget('glossary', VALID, ANCHORS)).toEqual({
      sectionId: 'glossary',
      scrollToId: 'glossary',
    })
  })

  it('resolves an in-section anchor to its owning section (#1400)', () => {
    expect(
      resolveHashTarget('#py-2026-2027-dcp-goals-2-3-eom', VALID, ANCHORS)
    ).toEqual({
      sectionId: 'caveats',
      scrollToId: 'py-2026-2027-dcp-goals-2-3-eom',
    })
  })

  it('returns null for an unknown fragment', () => {
    expect(resolveHashTarget('#bogus', VALID, ANCHORS)).toBeNull()
  })

  it('returns null for an unknown anchor that merely looks like one', () => {
    expect(
      resolveHashTarget('#py-9999-0000-invented', VALID, ANCHORS)
    ).toBeNull()
  })

  it('returns null for an empty hash', () => {
    expect(resolveHashTarget('', VALID, ANCHORS)).toBeNull()
  })

  it('treats the anchor map as optional (sections still resolve)', () => {
    expect(resolveHashTarget('#caveats', VALID)).toEqual({
      sectionId: 'caveats',
      scrollToId: 'caveats',
    })
  })
})

describe('methodologyUrl — constants', () => {
  it('uses a stable search-param key', () => {
    expect(OPEN_SECTIONS_PARAM).toBe('openSections')
  })
})

/* /methodology page — content correctness against authoritative sources
   (#439 DCP tier definitions, #440 Club health classifications). */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MethodologyPage from '../MethodologyPage'

const renderPage = () =>
  render(
    <MemoryRouter>
      <MethodologyPage />
    </MemoryRouter>
  )

describe('MethodologyPage — DCP tier definitions (#439)', () => {
  it('Distinguished tier alt is net growth ≥ 3 (NOT 75% retention)', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/distinguished.*net growth ≥ 3/i)
    // The fictional '75% retention' / 'net +5 / 75% retention' wording is gone
    expect(txt).not.toMatch(/75% retention/i)
  })

  it("Select Distinguished alt is net growth ≥ 5 (NOT 'same membership floor')", () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/select distinguished.*net growth ≥ 5/i)
  })

  it("President's Distinguished explicitly notes no growth alternative", () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(
      /president's distinguished[\s\S]{0,80}no growth alternative/i
    )
  })

  it('Smedley is named "Smedley Distinguished" with 10 goals + 25 members (not "Award" + chartered new club)', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/smedley distinguished[\s\S]{0,80}10[\s\S]{0,40}25/i)
    expect(txt).not.toMatch(/chartered new club/i)
  })
})

describe('MethodologyPage — Club health classifications (#440)', () => {
  it('lists exactly three statuses (no invented "Healthy" or "Watch" or "At-risk")', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/thriving/i)
    expect(txt).toMatch(/vulnerable/i)
    expect(txt).toMatch(/intervention required/i)
    // Invented tiers must not appear in the section copy
    expect(txt).not.toMatch(/\bhealthy\b/i)
    expect(txt).not.toMatch(/\bwatch\b.*missed renewal/i)
    expect(txt).not.toMatch(/under 8 paid members/i)
  })

  it('Thriving criteria mention all three actual gates: membership, DCP checkpoint, CSP', () => {
    renderPage()
    const txt = document.body.textContent || ''
    // Thriving text mentions all 3 requirements
    expect(txt).toMatch(/CSP|Club Success Plan/i)
    expect(txt).toMatch(/DCP checkpoint/i)
    expect(txt).toMatch(/20\+ paid members.*net growth ≥ 3/i)
  })

  it('Intervention Required uses < 12 (not under 8) AND net growth < 3', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/paid members\s*&?lt;?\s*12|paid members\s*<\s*12/i)
    expect(txt).toMatch(/net growth\s*&?lt;?\s*3|net growth\s*<\s*3/i)
  })
})

/**
 * Club Success Plan due dates (#1565) — from the Distinguished Club Program,
 * Item 1111 Rev. 06/2026, pp. 5 and 11. The completion paragraph must state
 * all three rules and the consequence, and must not promise that a late plan
 * can still be fixed.
 */
describe('MethodologyPage — Club Success Plan due dates (#1565)', () => {
  it('states the 30 September deadline and the loss of eligibility for the year', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/Club Success Plan[\s\S]{0,400}30 September/i)
    expect(txt).toMatch(
      /has not (?:filed|submitted)[\s\S]{0,120}cannot (?:earn|be) Distinguished[\s\S]{0,40}(?:that|this) program year/i
    )
  })

  it('states the 90-day rule for newly chartered clubs and automatic credit after 1 April', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(/90 days after (?:its|the) charter date/i)
    expect(txt).toMatch(
      /after 1 April[\s\S]{0,80}automatic(?:ally)? (?:receives? )?credit/i
    )
  })

  it('does not say a club is blocked "until" its plan is in — that wording is false after the deadline', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).not.toMatch(/Distinguished until/i)
    expect(txt).not.toMatch(/until (?:its|their) plans? (?:is|are) in/i)
  })
})

describe('MethodologyPage — pointer to the MCP server page (#1165)', () => {
  it('links to /mcp from the data source section', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /mcp server/i })).toHaveAttribute(
      'href',
      '/mcp'
    )
  })
})

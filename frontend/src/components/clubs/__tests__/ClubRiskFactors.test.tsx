import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClubRiskFactors } from '../ClubRiskFactors'
import { plainRiskFactor } from '../../../utils/plainRiskFactor'
import { RISK_FACTOR_MESSAGES as M } from '@taverns-red/analytics-core'

/* #2655 UNIT-21 — Risk Factors is a regular club panel with plain copy:
   no emoji, no Tailwind reds, no "need 3+ to override". The analytics
   strings are rewritten here so published snapshots from before and after
   any copy change both read plainly. */

describe('plainRiskFactor (#2655)', () => {
  it.each([
    ['Membership below 12 (critical)', 'Fewer than 12 members.'],
    [
      'Net growth since July: -5 (need 3+ to override)',
      'Net membership change since July is -5. It needs to reach +3 to lift the club out of this status.',
    ],
    [
      'Membership below threshold (15 members, need 20+ or net growth 3+)',
      '15 members. The club needs 20 or more, or a net gain of 3 since July.',
    ],
    [
      'DCP checkpoint not met: 1 goal achieved, 2 required for October',
      '1 goal met so far; 2 needed by October.',
    ],
    [
      'DCP checkpoint not met: 0 goals achieved, 1 required for August',
      '0 goals met so far; 1 needed by August.',
    ],
    ['CSP not submitted', 'Club Success Plan not submitted.'],
  ])('rewrites %j', (raw, plain) => {
    expect(plainRiskFactor(raw)).toBe(plain)
  })

  // The strings the pipeline publishes, built by the same functions
  // ClubHealthAnalyticsModule uses (analytics-core riskFactorMessages): a
  // wording change there fails here instead of falling through as raw text.
  it.each([
    ['membershipCritical', M.membershipCritical()],
    ['netGrowthOverride (negative)', M.netGrowthOverride(-5)],
    ['netGrowthOverride (zero)', M.netGrowthOverride(0)],
    ['membershipBelowThreshold', M.membershipBelowThreshold(15)],
    ['dcpCheckpointNotMet (one)', M.dcpCheckpointNotMet(1, 2, 'October')],
    ['dcpCheckpointNotMet (many)', M.dcpCheckpointNotMet(0, 3, 'November')],
    ['cspNotSubmitted', M.cspNotSubmitted()],
  ])('recognises the published %s message', (_name, raw) => {
    const plain = plainRiskFactor(raw)
    expect(plain).not.toBe(raw)
    expect(plain).not.toMatch(/override|need 3\+|CSP/)
  })

  it('states the net-change target, not a member count', () => {
    // From -5 the club needs a net change of +3 since July: 8 more members.
    // The copy names the target as a net change so it cannot read as "3 more".
    expect(plainRiskFactor(M.netGrowthOverride(-5))).toContain('reach +3')
    expect(plainRiskFactor(M.netGrowthOverride(-5))).not.toMatch(/gain of 3/)
  })

  it('passes an unknown message through unchanged', () => {
    expect(plainRiskFactor('Something new')).toBe('Something new')
  })
})

describe('ClubRiskFactors (#2655)', () => {
  it('is a club-panel named Risk factors with a list, no emoji', () => {
    render(
      <ClubRiskFactors
        factors={['Membership below 12 (critical)', 'CSP not submitted']}
      />
    )
    const region = screen.getByRole('region', { name: 'Risk factors' })
    expect(region).toHaveClass('club-panel')
    expect(region).toHaveClass('club-risk')
    expect(region.textContent).not.toContain('⚠')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(region).not.toHaveTextContent(/override/)
    expect(region.innerHTML).not.toMatch(/bg-red|text-red|border-red/)
  })

  it('renders nothing without factors', () => {
    const { container } = render(<ClubRiskFactors factors={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

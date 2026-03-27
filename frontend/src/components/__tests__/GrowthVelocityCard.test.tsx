import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GrowthVelocityCard } from '../GrowthVelocityCard'

describe('GrowthVelocityCard', () => {
  it('should render velocity value with sign', () => {
    render(
      <GrowthVelocityCard
        velocity={{ velocity: 5.2, acceleration: 0, trend: 'stable' }}
      />
    )
    expect(screen.getByText('+5.2')).toBeDefined()
    expect(screen.getByText('members / month')).toBeDefined()
  })

  it('should render negative velocity without plus sign', () => {
    render(
      <GrowthVelocityCard
        velocity={{ velocity: -3, acceleration: 0, trend: 'stable' }}
      />
    )
    expect(screen.getByText('-3')).toBeDefined()
  })

  it('should render accelerating trend badge', () => {
    render(
      <GrowthVelocityCard
        velocity={{ velocity: 10, acceleration: 2.5, trend: 'accelerating' }}
      />
    )
    expect(screen.getByText(/Accelerating/)).toBeDefined()
    expect(screen.getByText(/Acceleration: \+2\.5/)).toBeDefined()
  })

  it('should render decelerating trend badge', () => {
    render(
      <GrowthVelocityCard
        velocity={{ velocity: 10, acceleration: -1.5, trend: 'decelerating' }}
      />
    )
    expect(screen.getByText(/Decelerating/)).toBeDefined()
  })

  it('should hide acceleration when zero', () => {
    render(
      <GrowthVelocityCard
        velocity={{ velocity: 10, acceleration: 0, trend: 'stable' }}
      />
    )
    expect(screen.queryByText(/Acceleration/)).toBeNull()
  })

  it('should have accessible region role', () => {
    render(
      <GrowthVelocityCard
        velocity={{ velocity: 10, acceleration: 0, trend: 'stable' }}
      />
    )
    expect(
      screen.getByRole('region', { name: /Growth Velocity/ })
    ).toBeDefined()
  })
})

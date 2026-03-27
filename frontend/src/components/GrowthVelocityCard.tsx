import type { GrowthVelocity } from '@toastmasters/analytics-core'
import './GrowthVelocityCard.css'

interface GrowthVelocityCardProps {
  velocity: GrowthVelocity
}

/**
 * Card showing membership growth velocity — members/month rate,
 * acceleration indicator, and trend badge.
 */
export function GrowthVelocityCard({ velocity }: GrowthVelocityCardProps) {
  const trendIcon =
    velocity.trend === 'accelerating'
      ? '⬆'
      : velocity.trend === 'decelerating'
        ? '⬇'
        : '→'

  const trendClass =
    velocity.trend === 'accelerating'
      ? 'growth-velocity__trend--accelerating'
      : velocity.trend === 'decelerating'
        ? 'growth-velocity__trend--decelerating'
        : 'growth-velocity__trend--stable'

  const velocitySign = velocity.velocity >= 0 ? '+' : ''

  return (
    <div className="growth-velocity" role="region" aria-label="Growth Velocity">
      <h3 className="growth-velocity__title">Growth Velocity</h3>

      <div className="growth-velocity__metric">
        <span className="growth-velocity__value">
          {velocitySign}
          {velocity.velocity}
        </span>
        <span className="growth-velocity__unit">members / month</span>
      </div>

      <div className="growth-velocity__details">
        <span className={`growth-velocity__trend ${trendClass}`}>
          <span aria-hidden="true">{trendIcon}</span>{' '}
          {velocity.trend.charAt(0).toUpperCase() + velocity.trend.slice(1)}
        </span>

        {velocity.acceleration !== 0 && (
          <span className="growth-velocity__acceleration">
            Acceleration: {velocity.acceleration > 0 ? '+' : ''}
            {velocity.acceleration}
          </span>
        )}
      </div>
    </div>
  )
}

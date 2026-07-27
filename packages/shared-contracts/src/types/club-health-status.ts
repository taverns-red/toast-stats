/**
 * Club health status classification types.
 *
 * These types define the canonical health status values for clubs.
 * All packages (analytics-core, backend, frontend) must use these
 * values to ensure consistency across the system.
 *
 * @module club-health-status
 * @see Requirements 1.1, 1.3
 */

/**
 * Club health status classification.
 *
 * - 'thriving': Club meets all health requirements
 * - 'vulnerable': Club has some but not all requirements met
 * - 'intervention-required': Club needs immediate attention (membership < 12 AND net growth < 3)
 */
export type ClubHealthStatus =
  'thriving' | 'vulnerable' | 'intervention-required'

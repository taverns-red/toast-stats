import React from 'react'
import { ButtonProps } from './types'

/**
 * Button Component
 *
 * Brand-compliant button component using Toastmasters design system.
 *
 * Features:
 * - Primary variant uses TM Loyal Blue (#004165) background
 * - Secondary variant uses TM Loyal Blue border with transparent background
 * - Accent variant uses TM Happy Yellow (#F2DF74) background
 * - Ghost variant uses transparent background with TM Loyal Blue text
 * - TM Headline font (Montserrat) for button text
 * - 44px minimum touch target for accessibility
 * - Proper focus indicators with visible contrast
 * - Hover states with opacity changes
 * - Loading state support
 * - WCAG AA compliant contrast ratios
 *
 * @param children - Button content
 * @param variant - Button style variant
 * @param size - Button size (affects padding and font size)
 * @param disabled - Whether button is disabled
 * @param loading - Whether button is in loading state
 * @param type - Button type attribute
 * @param className - Additional CSS classes
 * @param aria-label - Accessible label
 */
const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  type = 'button',
  className = '',
  'aria-label': ariaLabel,
  ...props
}) => {
  const baseClasses = `
    font-tm-headline
    tm-touch-target
    inline-flex items-center justify-center
    font-semibold
    rounded-md
    transition-all duration-200
    focus-visible:outline-2 focus-visible:outline-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    ${loading ? 'cursor-wait' : ''}
  `
    .trim()
    .replace(/\s+/g, ' ')

  const variantClasses = {
    primary: `
      bg-tm-loyal-blue text-white
      hover:bg-tm-loyal-blue/90 active:bg-tm-loyal-blue/80
      focus-visible:outline-[var(--focus-ring)]
      disabled:hover:bg-tm-loyal-blue
    `,
    secondary: `
      bg-transparent text-tm-loyal-blue
      border-2 border-current
      hover:bg-tm-loyal-blue hover:text-white
      focus-visible:outline-tm-loyal-blue
      disabled:hover:bg-transparent disabled:hover:text-tm-loyal-blue
    `,
    accent: `
      bg-tm-happy-yellow text-tm-black
      hover:bg-tm-happy-yellow/90 active:bg-tm-happy-yellow/80
      focus-visible:outline-tm-black
      disabled:hover:bg-tm-happy-yellow
    `,
    ghost: `
      bg-transparent text-tm-loyal-blue
      hover:bg-tm-loyal-blue/10
      focus-visible:outline-tm-loyal-blue
      disabled:hover:bg-transparent
    `,
  }

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm min-h-[44px]',
    md: 'px-4 py-3 text-base min-h-[44px]',
    lg: 'px-6 py-4 text-lg min-h-[44px]',
  }

  const combinedClasses = `
    ${baseClasses}
    ${variantClasses[variant].trim().replace(/\s+/g, ' ')}
    ${sizeClasses[size]}
    ${className}
  `
    .trim()
    .replace(/\s+/g, ' ')

  return (
    <button
      type={type}
      className={combinedClasses}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}

export default Button

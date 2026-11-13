import React from 'react'
import { FormTextareaProps } from './types'

/**
 * FormTextarea - Brand-compliant textarea component
 *
 * Uses TM Cool Gray backgrounds, proper focus states with TM Loyal Blue,
 * and ensures minimum touch target requirements.
 *
 * Requirements: 4.2, 2.2, 1.3, 3.1, 3.2
 */
export const FormTextarea: React.FC<FormTextareaProps> = ({
  className = '',
  error = false,
  resize = 'vertical',
  ...props
}) => {
  const baseClasses = 'tm-form-textarea tm-body'
  const resizeClasses = {
    none: 'tm-form-textarea--resize-none',
    vertical: 'tm-form-textarea--resize-vertical',
    horizontal: 'tm-form-textarea--resize-horizontal',
    both: 'tm-form-textarea--resize-both',
  }
  const stateClasses = [error && 'tm-form-textarea--error']
    .filter(Boolean)
    .join(' ')

  return (
    <textarea
      className={`${baseClasses} ${resizeClasses[resize]} ${stateClasses} ${className}`.trim()}
      {...props}
    />
  )
}

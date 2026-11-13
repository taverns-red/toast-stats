import React from 'react'
import { cn } from '../../../utils/cn'

export interface AlertProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'highlight'
  size?: 'sm' | 'md' | 'lg'
  title?: string
  children: React.ReactNode
  className?: string
  onClose?: () => void
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  size = 'md',
  title,
  children,
  className,
  onClose,
}) => {
  const baseClasses = 'tm-alert rounded-md border tm-body tm-brand-compliant'

  const variantClasses = {
    success:
      'tm-alert-success bg-tm-loyal-blue-10 border-tm-loyal-blue text-tm-black',
    warning:
      'tm-alert-warning bg-tm-true-maroon-10 border-tm-true-maroon text-tm-black',
    error:
      'tm-alert-error bg-tm-true-maroon-10 border-tm-true-maroon text-tm-black',
    info: 'tm-alert-info bg-tm-cool-gray-20 border-tm-cool-gray text-tm-black',
    highlight:
      'tm-alert-highlight bg-tm-happy-yellow-20 border-tm-happy-yellow text-tm-black',
  }

  const sizeClasses = {
    sm: 'p-3 text-sm',
    md: 'p-4 text-base',
    lg: 'p-6 text-lg',
  }

  const iconClasses = {
    success: 'text-tm-loyal-blue',
    warning: 'text-tm-true-maroon',
    error: 'text-tm-true-maroon',
    info: 'text-tm-cool-gray',
    highlight: 'text-tm-black',
  }

  const getIcon = (variant: string) => {
    switch (variant) {
      case 'success':
        return '✓'
      case 'warning':
        return '⚠'
      case 'error':
        return '✕'
      case 'info':
        return 'ℹ'
      case 'highlight':
        return '★'
      default:
        return 'ℹ'
    }
  }

  return (
    <div
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex-shrink-0 font-bold text-lg',
            iconClasses[variant]
          )}
        >
          {getIcon(variant)}
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="tm-headline font-semibold mb-1 text-base">
              {title}
            </h4>
          )}
          <div className="tm-body-medium">{children}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={cn(
              'flex-shrink-0 tm-touch-target rounded-xs hover:bg-black/10 focus:outline-hidden focus:ring-2 focus:ring-tm-loyal-blue',
              'flex items-center justify-center w-6 h-6 text-lg font-bold',
              iconClasses[variant]
            )}
            aria-label="Close alert"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

export default Alert

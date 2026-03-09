'use client'

import { Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface SharePasswordRequirementsProps {
  password: string
  className?: string
}

export function SharePasswordRequirements({ password, className = '' }: SharePasswordRequirementsProps) {
  const t = useTranslations('auth')

  const results = [
    {
      label: t('sharePasswordMinChars'),
      passed: password.length >= 8,
    },
    {
      label: t('sharePasswordLetter'),
      passed: /[A-Za-z]/.test(password),
    },
    {
      label: t('sharePasswordNumber'),
      passed: /[0-9]/.test(password),
    },
  ]

  const allPassed = results.every((r) => r.passed)

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-sm font-medium text-foreground">{t('sharePasswordRequirements')}</p>
      <ul className="space-y-1">
        {results.map((result, index) => (
          <li
            key={index}
            className={`flex items-center gap-2 text-sm transition-colors ${
              result.passed ? 'text-success' : 'text-muted-foreground'
            }`}
          >
            {result.passed ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <X className="w-4 h-4 flex-shrink-0 opacity-30" />
            )}
            <span className={result.passed ? 'font-medium' : ''}>{result.label}</span>
          </li>
        ))}
      </ul>
      {allPassed && password.length > 0 && (
        <p className="text-sm text-success font-medium mt-2 flex items-center gap-1">
          <Check className="w-4 h-4" /> {t('sharePasswordMeetsAll')}
        </p>
      )}
    </div>
  )
}

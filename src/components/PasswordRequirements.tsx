'use client'

import { useMemo } from 'react'
import { Check, X } from 'lucide-react'

interface PasswordRequirementsProps {
  password: string
  className?: string
}

interface Requirement {
  label: string
  test: (password: string) => boolean
}

const requirements: Requirement[] = [
  {
    label: 'At least 12 characters',
    test: (pwd) => pwd.length >= 12,
  },
  {
    label: 'One uppercase letter (A-Z)',
    test: (pwd) => /[A-Z]/.test(pwd),
  },
  {
    label: 'One lowercase letter (a-z)',
    test: (pwd) => /[a-z]/.test(pwd),
  },
  {
    label: 'One number (0-9)',
    test: (pwd) => /[0-9]/.test(pwd),
  },
  {
    label: 'One special character (!@#$%^&*...)',
    test: (pwd) => /[^A-Za-z0-9]/.test(pwd),
  },
]

export function PasswordRequirements({ password, className = '' }: PasswordRequirementsProps) {
  const results = useMemo(() => {
    return requirements.map((req) => ({
      ...req,
      passed: req.test(password),
    }))
  }, [password])

  const allPassed = results.every((r) => r.passed)

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-sm font-medium text-foreground">Password Requirements:</p>
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
        <p className="text-sm text-success font-medium mt-2">✓ Password meets all requirements</p>
      )}
    </div>
  )
}

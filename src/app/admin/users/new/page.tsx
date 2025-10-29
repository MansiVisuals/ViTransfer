'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, UserPlus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { PasswordRequirements } from '@/components/PasswordRequirements'

export default function NewUserPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    name: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!formData.email || !formData.password) {
      setError('Email and password are required')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Password validation will be done by the API using the passwordSchema
    // which requires 12+ chars, uppercase, lowercase, number, and special char

    setLoading(true)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          username: formData.username || null,
          password: formData.password,
          name: formData.name || null,
          role: 'ADMIN',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create user')
      }

      router.push('/admin/users')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Add New Admin User</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">Create a new administrator account</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive-visible border-2 border-destructive-visible text-destructive font-medium px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <PasswordInput
                id="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
              <PasswordRequirements password={formData.password} className="mt-3" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <PasswordInput
                id="confirmPassword"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
              />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <X className="w-4 h-4" /> Passwords do not match
                </p>
              )}
              {formData.confirmPassword && formData.password === formData.confirmPassword && formData.password.length > 0 && (
                <p className="text-sm text-success flex items-center gap-1">
                  ✓ Passwords match
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" variant="default" size="default" disabled={loading}>
                <UserPlus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{loading ? 'Creating...' : 'Create User'}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => router.push('/admin/users')}
                disabled={loading}
              >
                <X className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Cancel</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

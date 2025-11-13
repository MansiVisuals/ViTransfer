'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Eye, EyeOff, RefreshCw, Copy, Check, Plus, X } from 'lucide-react'

// Generate a secure random password
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  let password = ''
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

export default function NewProjectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [isShareOnly, setIsShareOnly] = useState(false)
  const [passwordProtected, setPasswordProtected] = useState(true) // Default to enabled
  const [sharePassword, setSharePassword] = useState('')
  const [showPassword, setShowPassword] = useState(true) // Show by default so they see it
  const [copied, setCopied] = useState(false)

  // Generate password on mount
  useEffect(() => {
    setSharePassword(generateSecurePassword())
  }, [])

  function handleGeneratePassword() {
    setSharePassword(generateSecurePassword())
    setCopied(false)
  }

  function handleCopyPassword() {
    navigator.clipboard.writeText(sharePassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const isShareOnlyValue = formData.get('isShareOnly') === 'on'
    const data = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      companyName: formData.get('companyName') as string,
      recipientName: formData.get('recipientName') as string,
      recipientEmail: formData.get('recipientEmail') as string,
      sharePassword: passwordProtected ? sharePassword : '', // Only send password if enabled
      isShareOnly: isShareOnlyValue,
    }

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error('Failed to create project')

      const project = await response.json()
      router.push(`/admin/projects/${project.id}`)
    } catch (error) {
      alert('Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
            <CardDescription>Set up a new video project for your client</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Project Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="e.g., Video Project - Client Name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="e.g., Project details, deliverables, notes..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Company/Brand Name (Optional)</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  placeholder="e.g., Acme Studios"
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  Display name in emails: Company/Brand Name → Primary Contact → "Client"
                </p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipientName">Client Name (Optional)</Label>
                    <Input id="recipientName" name="recipientName" placeholder="e.g., Client Name" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recipientEmail">Client Email (Optional)</Label>
                    <Input
                      id="recipientEmail"
                      name="recipientEmail"
                      type="email"
                      placeholder="e.g., client@example.com"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add client name and email if you want to send notifications. You can add more recipients later in project settings.
                </p>
              </div>

              <div className="space-y-4 border rounded-lg p-4 bg-primary-visible border-2 border-primary-visible">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="passwordProtected" className="text-base font-semibold">
                      Password Protection (Recommended)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Secure by default. Clients need this password to view and approve the project.
                    </p>
                  </div>
                  <input
                    id="passwordProtected"
                    type="checkbox"
                    checked={passwordProtected}
                    onChange={(e) => setPasswordProtected(e.target.checked)}
                    className="h-5 w-5 rounded border-border text-primary focus:ring-primary mt-1"
                  />
                </div>

                {passwordProtected && (
                  <div className="space-y-3 pt-2 border-t">
                    <Label htmlFor="sharePassword">Share Password</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="sharePassword"
                          value={sharePassword}
                          onChange={(e) => setSharePassword(e.target.value)}
                          type={showPassword ? 'text' : 'password'}
                          className="pr-10 font-mono"
                          required={passwordProtected}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleGeneratePassword}
                        title="Generate new password"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCopyPassword}
                        title="Copy password"
                      >
                        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-warning">Important:</strong> Save this password! 
                      You'll need to share it with your client so they can view and approve the project.
                    </p>
                  </div>
                )}

                {!passwordProtected && (
                  <div className="flex items-start gap-2 p-3 bg-warning-visible border-2 border-warning-visible rounded-md">
                    <span className="text-warning text-sm font-bold">!</span>
                    <p className="text-sm text-warning font-medium">
                      Without password protection, anyone with the share link can view and approve your project.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      id="isShareOnly"
                      name="isShareOnly"
                      type="checkbox"
                      checked={isShareOnly}
                      onChange={(e) => setIsShareOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <Label htmlFor="isShareOnly" className="font-normal cursor-pointer">
                      Share Only
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Create an approved project for simple video sharing. Disables feedback and revision tracking.
                  </p>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> Additional options like revision tracking, comment restrictions, and feedback settings can be configured after project creation in Project Settings.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit" variant="default" size="lg" disabled={loading} className="flex-1">
                  <Plus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{loading ? 'Creating...' : 'Create Project'}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  onClick={() => router.back()}
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
    </div>
  )
}

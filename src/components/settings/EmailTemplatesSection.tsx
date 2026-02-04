'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, ChevronRight, RotateCcw, Save, Eye, Code, Copy, Check, AlertCircle, X, Braces } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { Label } from '@/components/ui/label'

interface PlaceholderDefinition {
  key: string
  description: string
  example: string
}

interface EmailTemplate {
  type: string
  name: string
  description: string
  category: 'client' | 'admin' | 'security'
  subject: string
  bodyContent: string
  isCustom: boolean
  enabled: boolean
  placeholders: PlaceholderDefinition[]
}

interface EmailTemplatesEditorProps {
  emailHeaderStyle: string
  setEmailHeaderStyle: (value: string) => void
}

// Embedded component for use inside AppearanceSection
export function EmailTemplatesEditor({ emailHeaderStyle, setEmailHeaderStyle }: EmailTemplatesEditorProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [editMode, setEditMode] = useState(false)

  // Edit state
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Preview state
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewSubject, setPreviewSubject] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Placeholders modal state
  const [showPlaceholders, setShowPlaceholders] = useState(false)

  // Copy state
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null)

  // Load templates
  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/settings/email-templates')
      if (!res.ok) throw new Error('Failed to load templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (err) {
      setError('Failed to load email templates')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (templates.length === 0) {
      loadTemplates()
    }
  }, [templates.length, loadTemplates])

  // Select a template for editing
  const handleSelectTemplate = useCallback((template: EmailTemplate) => {
    setSelectedTemplate(template)
    setEditSubject(template.subject)
    setEditBody(template.bodyContent)
    setEditMode(true)
    setShowPreview(false)
    setSaveSuccess(false)
  }, [])

  // Generate preview
  const handlePreview = useCallback(async () => {
    if (!selectedTemplate) return

    setPreviewLoading(true)
    try {
      const res = await apiFetch('/api/settings/email-templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedTemplate.type,
          subject: editSubject,
          bodyContent: editBody,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate preview')
      const data = await res.json()
      setPreviewHtml(data.html)
      setPreviewSubject(data.subject)
      setShowPreview(true)
    } catch (err) {
      console.error('Preview error:', err)
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedTemplate, editSubject, editBody])

  // Save template
  const handleSave = useCallback(async () => {
    if (!selectedTemplate) return

    setSaving(true)
    setSaveSuccess(false)
    try {
      const res = await apiFetch(`/api/settings/email-templates/${selectedTemplate.type}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: editSubject,
          bodyContent: editBody,
        }),
      })

      if (!res.ok) throw new Error('Failed to save template')

      setSaveSuccess(true)

      // Update local state
      setTemplates(prev =>
        prev.map(t =>
          t.type === selectedTemplate.type
            ? { ...t, subject: editSubject, bodyContent: editBody, isCustom: true }
            : t
        )
      )
      setSelectedTemplate(prev =>
        prev ? { ...prev, subject: editSubject, bodyContent: editBody, isCustom: true } : null
      )

      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }, [selectedTemplate, editSubject, editBody])

  // Reset template to default
  const handleReset = useCallback(async () => {
    if (!selectedTemplate) return
    if (!confirm('Reset this template to the default? Your customizations will be lost.')) return

    try {
      const res = await apiFetch(`/api/settings/email-templates/${selectedTemplate.type}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to reset template')
      const data = await res.json()

      setEditSubject(data.subject)
      setEditBody(data.bodyContent)

      // Update local state
      setTemplates(prev =>
        prev.map(t =>
          t.type === selectedTemplate.type
            ? { ...t, subject: data.subject, bodyContent: data.bodyContent, isCustom: false }
            : t
        )
      )
      setSelectedTemplate(prev =>
        prev ? { ...prev, subject: data.subject, bodyContent: data.bodyContent, isCustom: false } : null
      )
    } catch (err) {
      console.error('Reset error:', err)
    }
  }, [selectedTemplate])

  // Copy placeholder to clipboard
  const handleCopyPlaceholder = useCallback((placeholder: string) => {
    navigator.clipboard.writeText(placeholder)
    setCopiedPlaceholder(placeholder)
    setTimeout(() => setCopiedPlaceholder(null), 2000)
  }, [])

  // Back to template list
  const handleBack = useCallback(() => {
    setEditMode(false)
    setSelectedTemplate(null)
    setShowPreview(false)
  }, [])

  // Group templates by category
  const groupedTemplates = templates.reduce(
    (acc, template) => {
      const cat = template.category || 'client'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(template)
      return acc
    },
    {} as Record<string, EmailTemplate[]>
  )

  const categoryLabels: Record<string, string> = {
    client: 'Client Notifications',
    admin: 'Admin Notifications',
    security: 'Security',
  }

  return (
    <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
      <div className="flex items-center justify-between">
        <div>
          <Label>Email Templates</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Customize email content and design for all notification types
          </p>
        </div>
        {/* Minimal Email Header Style Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Header:</span>
          <button
            type="button"
            onClick={() => setEmailHeaderStyle(emailHeaderStyle === 'LOGO_ONLY' ? 'LOGO_AND_NAME' : 'LOGO_ONLY')}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-xs hover:border-primary/50 transition-colors"
            title={emailHeaderStyle === 'LOGO_ONLY' ? 'Logo only' : 'Logo + Company name'}
          >
            <Mail className="w-3 h-3" />
            <span>{emailHeaderStyle === 'LOGO_ONLY' ? 'Logo' : 'Logo + Name'}</span>
          </button>
        </div>
      </div>
      
      {/* Preview Modal - z-[60] to appear above Editor modal */}
      {showPreview && previewHtml && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[90vh] mx-4 bg-background rounded-lg shadow-xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <div>
                <h3 className="text-sm font-semibold">Email Preview</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Subject: <span className="font-medium text-foreground">{previewSubject}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-hidden">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[70vh] bg-white"
                title="Email preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}

      {/* Placeholders Modal - z-[60] to appear above Editor modal */}
      {showPlaceholders && selectedTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl max-h-[90vh] mx-4 bg-background rounded-lg shadow-xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <div>
                <h3 className="text-sm font-semibold">Available Placeholders</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click to copy a placeholder. Use in subject or body.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlaceholders(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Placeholders list */}
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedTemplate.placeholders.map(placeholder => (
                  <button
                    key={placeholder.key}
                    type="button"
                    onClick={() => handleCopyPlaceholder(placeholder.key)}
                    className="w-full text-left p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-xs font-mono text-primary">{placeholder.key}</code>
                      {copiedPlaceholder === placeholder.key ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{placeholder.description}</div>
                    {placeholder.example && (
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        Example: {placeholder.example}
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Special syntax help */}
              <div className="pt-4 border-t border-border">
                <h5 className="text-sm font-semibold mb-3">Special Syntax</h5>
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <code className="font-mono text-primary">{'{{BUTTON:Label:{{URL}}}}'}</code>
                    <p className="text-muted-foreground mt-1">Renders a styled button</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <code className="font-mono text-primary">class=&quot;info-box&quot;</code>
                    <p className="text-muted-foreground mt-1">Accent-colored info box</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <code className="font-mono text-primary">class=&quot;secondary-box&quot;</code>
                    <p className="text-muted-foreground mt-1">Neutral secondary box</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <code className="font-mono text-primary">class=&quot;info-label&quot;</code>
                    <p className="text-muted-foreground mt-1">Uppercase label text</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          Loading templates...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 py-4 text-destructive">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      ) : (
        // Template list view (always visible when not loading/error)
        <div className="space-y-4">
          {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
            <div key={category} className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {categoryLabels[category] || category}
              </h4>
              <div className="space-y-1">
                {categoryTemplates.map(template => (
                  <button
                    key={template.type}
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground">{template.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {template.isCustom && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                          Customized
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {editMode && selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[90vh] mx-4 bg-background rounded-lg shadow-xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <div>
                <h3 className="text-sm font-semibold">{selectedTemplate.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedTemplate.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedTemplate.isCustom && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPlaceholders(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Braces className="w-3.5 h-3.5" />
                  Placeholders
                </button>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {previewLoading ? 'Loading...' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    'Saving...'
                  ) : saveSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Save
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Subject line */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject Line</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={e => setEditSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Email subject..."
                />
              </div>

              {/* Body content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Body Content</label>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Code className="w-3 h-3" />
                    HTML supported
                  </span>
                </div>
                <textarea
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  rows={20}
                  className="w-full h-[50vh] px-3 py-2 text-sm font-mono border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  placeholder="Email body HTML..."
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

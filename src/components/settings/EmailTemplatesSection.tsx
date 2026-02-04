'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, ChevronRight, RotateCcw, Save, Eye, Code, Copy, Check, AlertCircle, X, Braces, Building2, Image, Type, EyeOff } from 'lucide-react'
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
    <div className="space-y-3 border p-3 sm:p-4 rounded-lg bg-muted/30">
      {/* Email Header Branding Style - dedicated section */}
      <div className="space-y-2 pb-3 border-b border-border">
        <Label className="text-sm font-medium">Email Header Branding</Label>
        <p className="text-xs text-muted-foreground">
          Choose what to display in the email header
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {[
            { value: 'LOGO_AND_NAME', label: 'Logo + Name', Icon: Building2 },
            { value: 'LOGO_ONLY', label: 'Logo Only', Icon: Image },
            { value: 'NAME_ONLY', label: 'Name Only', Icon: Type },
            { value: 'NONE', label: 'None', Icon: EyeOff },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setEmailHeaderStyle(option.value)}
              className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-xs transition-all ${
                emailHeaderStyle === option.value
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border bg-card hover:border-primary/50'
              }`}
            >
              <option.Icon className="w-4 h-4" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Email Templates Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <Label>Email Templates</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Customize email content and design
          </p>
        </div>
      </div>
      
      {/* Preview Modal - z-[60] to appear above Editor modal */}
      {showPreview && previewHtml && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
          <div className="relative w-full max-w-4xl max-h-[85vh] sm:max-h-[90vh] bg-background rounded-lg shadow-xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border bg-muted/50">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">Email Preview</h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Subject: <span className="font-medium text-foreground">{previewSubject}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors ml-2 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Body - iframe scales to fit width, vertical scroll only */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100">
              <iframe
                srcDoc={previewHtml.replace(
                  '</head>',
                  `<style>
                    body { margin: 0 !important; padding: 8px !important; min-width: 0 !important; }
                    table[width="600"], table[style*="max-width: 600px"] { 
                      max-width: 100% !important; 
                      width: 100% !important; 
                    }
                    img { max-width: 100% !important; height: auto !important; }
                    td { word-break: break-word !important; }
                  </style></head>`
                )}
                className="w-full h-[55vh] sm:h-[70vh] border-0"
                title="Email preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}

      {/* Placeholders Modal - z-[60] to appear above Editor modal */}
      {showPlaceholders && selectedTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
          <div className="relative w-full max-w-2xl max-h-[80vh] sm:max-h-[90vh] bg-background rounded-lg shadow-xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border bg-muted/50">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">Available Placeholders</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click to copy. Use in subject or body.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlaceholders(false)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors ml-2 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
              {/* Placeholders list */}
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                {selectedTemplate.placeholders.map(placeholder => (
                  <button
                    key={placeholder.key}
                    type="button"
                    onClick={() => handleCopyPlaceholder(placeholder.key)}
                    className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs font-mono text-primary break-all">{placeholder.key}</code>
                      {copiedPlaceholder === placeholder.key ? (
                        <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{placeholder.description}</div>
                    {placeholder.example && (
                      <div className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                        Example: {placeholder.example}
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Special syntax help */}
              <div className="pt-4 border-t border-border">
                <h5 className="text-sm font-semibold mb-3">Special Syntax</h5>
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 text-xs">
                  <div className="p-2.5 sm:p-3 rounded-lg bg-muted/50 border border-border">
                    <code className="font-mono text-primary text-[11px] sm:text-xs break-all">{'{{BUTTON:Label:{{URL}}}}'}</code>
                    <p className="text-muted-foreground mt-1">Renders a styled button</p>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-lg bg-muted/50 border border-border">
                    <code className="font-mono text-primary">class=&quot;info-box&quot;</code>
                    <p className="text-muted-foreground mt-1">Accent-colored info box</p>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-lg bg-muted/50 border border-border">
                    <code className="font-mono text-primary">class=&quot;secondary-box&quot;</code>
                    <p className="text-muted-foreground mt-1">Neutral secondary box</p>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-lg bg-muted/50 border border-border">
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
              <h4 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {categoryLabels[category] || category}
              </h4>
              <div className="space-y-1">
                {categoryTemplates.map(template => (
                  <button
                    key={template.type}
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className="w-full flex items-center justify-between p-2.5 sm:p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-muted/50 transition-colors text-left gap-2"
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{template.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{template.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                      {template.isCustom && (
                        <span className="text-[10px] sm:text-xs bg-primary/10 text-primary px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
                          Custom
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
          <div className="relative w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] bg-background rounded-lg shadow-xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border bg-muted/50 gap-2 sm:gap-0">
              <div className="min-w-0 flex-1 flex items-start justify-between sm:block">
                <div>
                  <h3 className="text-sm font-semibold truncate">{selectedTemplate.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{selectedTemplate.description}</p>
                </div>
                {/* Close button - mobile only in header row */}
                <button
                  type="button"
                  onClick={handleBack}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors sm:hidden flex-shrink-0 -mr-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
                {selectedTemplate.isCustom && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <RotateCcw className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                    <span className="hidden xs:inline">Reset</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPlaceholders(true)}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
                  title="Placeholders"
                >
                  <Braces className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                  <span className="hidden sm:inline">Placeholders</span>
                </button>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewLoading}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-border rounded-md hover:bg-muted/50 transition-colors"
                  title="Preview"
                >
                  <Eye className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                  <span className="hidden sm:inline">{previewLoading ? 'Loading...' : 'Preview'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    'Saving...'
                  ) : saveSuccess ? (
                    <>
                      <Check className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                      Save
                    </>
                  )}
                </button>
                {/* Close button - desktop only */}
                <button
                  type="button"
                  onClick={handleBack}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors ml-1 sm:ml-2 hidden sm:block"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
              {/* Subject line */}
              <div className="space-y-1.5 sm:space-y-2">
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
              <div className="space-y-1.5 sm:space-y-2">
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
                  className="w-full h-[40vh] sm:h-[50vh] px-3 py-2 text-sm font-mono border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
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

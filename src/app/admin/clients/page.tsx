'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Building2, Plus, Search, Users, Trash2, Edit, FolderKanban, User, Mail, ChevronRight, RefreshCw, AlertCircle, Check, Globe } from 'lucide-react'
import { apiFetch, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SUPPORTED_LOCALES, LOCALE_NAMES } from '@/i18n/locale'
import { logError } from '@/lib/logging'

interface ClientContact {
  id: string
  name: string
  email: string | null
  language: string | null
  companyId: string
}

interface ClientCompany {
  id: string
  name: string
  contacts: ClientContact[]
  _count: {
    projects: number
  }
}

export default function ClientsPage() {
  const t = useTranslations('clients')
  const tc = useTranslations('common')
  const [companies, setCompanies] = useState<ClientCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Modal states
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false)
  const [showEditCompanyModal, setShowEditCompanyModal] = useState(false)
  const [showContactsModal, setShowContactsModal] = useState(false)
  const [showAddContactModal, setShowAddContactModal] = useState(false)
  const [showEditContactModal, setShowEditContactModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // Form states
  const [newCompanyName, setNewCompanyName] = useState('')
  const [editingCompany, setEditingCompany] = useState<ClientCompany | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<ClientCompany | null>(null)
  const [newContactName, setNewContactName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [newContactLanguage, setNewContactLanguage] = useState('')
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'company' | 'contact'; id: string; name: string } | null>(null)
  
  // Action states
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [backfillStats, setBackfillStats] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)

  const loadCompanies = useCallback(async () => {
    try {
      const url = searchQuery 
        ? `/api/clients?search=${encodeURIComponent(searchQuery)}`
        : '/api/clients'
      const response = await apiFetch(url)
      if (response.ok) {
        const data = await response.json()
        setCompanies(data.companies || [])
      }
    } catch (err) {
      logError('Failed to load companies:', err)
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  useEffect(() => {
    loadCompanies()
  }, [loadCompanies])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCompanies()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, loadCompanies])

  async function handleAddCompany() {
    if (!newCompanyName.trim()) {
      setError(t('companyNameRequired'))
      return
    }

    setSaving(true)
    setError('')

    try {
      const response = await apiPost('/api/clients', { name: newCompanyName.trim() })
      setCompanies(prev => [...prev, response.company].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCompanyName('')
      setShowAddCompanyModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToAddCompany'))
    } finally {
      setSaving(false)
    }
  }

  async function handleEditCompany() {
    if (!editingCompany || !newCompanyName.trim()) {
      setError(t('companyNameRequired'))
      return
    }

    setSaving(true)
    setError('')

    try {
      const response = await apiPatch(`/api/clients/${editingCompany.id}`, { name: newCompanyName.trim() })
      setCompanies(prev =>
        prev.map(c => c.id === editingCompany.id ? response.company : c)
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setNewCompanyName('')
      setEditingCompany(null)
      setShowEditCompanyModal(false)

      // Update selected company if viewing contacts
      if (selectedCompany?.id === editingCompany.id) {
        setSelectedCompany(response.company)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToUpdateCompany'))
    } finally {
      setSaving(false)
    }
  }

  async function handleAddContact() {
    if (!selectedCompany || !newContactName.trim()) {
      setError(t('contactNameRequired'))
      return
    }

    setSaving(true)
    setError('')

    try {
      await apiPost(`/api/clients/${selectedCompany.id}/contacts`, {
        name: newContactName.trim(),
        email: newContactEmail.trim() || null,
        language: newContactLanguage && newContactLanguage !== 'default' ? newContactLanguage : null
      })

      // Reload companies to get updated contacts
      await loadCompanies()

      // Reload selected company contacts
      const response = await apiFetch(`/api/clients/${selectedCompany.id}`)
      if (response.ok) {
        const data = await response.json()
        setSelectedCompany(data.company)
      }

      setNewContactName('')
      setNewContactEmail('')
      setNewContactLanguage('')
      setShowAddContactModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToAddContact'))
    } finally {
      setSaving(false)
    }
  }

  async function handleEditContact() {
    if (!selectedCompany || !editingContact || !newContactName.trim()) {
      setError(t('contactNameRequired'))
      return
    }

    setSaving(true)
    setError('')

    try {
      await apiPatch(`/api/clients/${selectedCompany.id}/contacts/${editingContact.id}`, {
        name: newContactName.trim(),
        email: newContactEmail.trim() || null,
        language: newContactLanguage && newContactLanguage !== 'default' ? newContactLanguage : null
      })

      // Reload selected company contacts
      const response = await apiFetch(`/api/clients/${selectedCompany.id}`)
      if (response.ok) {
        const data = await response.json()
        setSelectedCompany(data.company)
      }

      setNewContactName('')
      setNewContactEmail('')
      setNewContactLanguage('')
      setEditingContact(null)
      setShowEditContactModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToUpdateContact'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    
    setSaving(true)
    setError('')
    
    try {
      if (deleteTarget.type === 'company') {
        await apiDelete(`/api/clients/${deleteTarget.id}`)
        setCompanies(prev => prev.filter(c => c.id !== deleteTarget.id))
        if (selectedCompany?.id === deleteTarget.id) {
          setSelectedCompany(null)
          setShowContactsModal(false)
        }
      } else if (selectedCompany) {
        await apiDelete(`/api/clients/${selectedCompany.id}/contacts/${deleteTarget.id}`)
        // Reload selected company contacts
        const response = await apiFetch(`/api/clients/${selectedCompany.id}`)
        if (response.ok) {
          const data = await response.json()
          setSelectedCompany(data.company)
        }
      }
      
      setDeleteTarget(null)
      setShowDeleteConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToDelete'))
    } finally {
      setSaving(false)
    }
  }

  async function handleBackfill() {
    setBackfilling(true)
    setBackfillStats(null)
    
    try {
      const response = await apiPost('/api/clients/backfill', {})
      setBackfillStats(response.message)
      await loadCompanies()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToBackfill'))
    } finally {
      setBackfilling(false)
    }
  }

  function openEditCompany(company: ClientCompany) {
    setEditingCompany(company)
    setNewCompanyName(company.name)
    setError('')
    setShowEditCompanyModal(true)
  }

  function openContactsModal(company: ClientCompany) {
    setSelectedCompany(company)
    setError('')
    setShowContactsModal(true)
  }

  function openAddContact() {
    setNewContactName('')
    setNewContactEmail('')
    setNewContactLanguage('')
    setError('')
    setShowAddContactModal(true)
  }

  function openEditContact(contact: ClientContact) {
    setEditingContact(contact)
    setNewContactName(contact.name)
    setNewContactEmail(contact.email || '')
    setNewContactLanguage(contact.language || '')
    setError('')
    setShowEditContactModal(true)
  }

  function confirmDelete(type: 'company' | 'contact', id: string, name: string) {
    setDeleteTarget({ type, id, name })
    setError('')
    setShowDeleteConfirm(true)
  }

  if (loading) {
    return (
      <div className="flex-1 min-h-0 bg-background">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="flex justify-between items-center gap-4 mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Building2 className="w-7 h-7 sm:w-8 sm:h-8" />
              {t('title')}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              {t('description')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="default"
              onClick={handleBackfill}
              disabled={backfilling}
              title={t('syncTitle')}
            >
              {backfilling ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="hidden sm:inline ml-2">{t('syncExisting')}</span>
            </Button>
            <Button
              variant="default"
              size="default"
              onClick={() => {
                setNewCompanyName('')
                setError('')
                setShowAddCompanyModal(true)
              }}
            >
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('addCompany')}</span>
            </Button>
          </div>
        </div>

        {backfillStats && (
          <div className="mb-4 p-3 bg-success-visible border border-success-visible rounded-md flex items-center gap-2">
            <Check className="w-4 h-4 text-success" />
            <span className="text-sm text-success">{backfillStats}</span>
          </div>
        )}
        
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore
            />
          </div>
        </div>

        {/* Companies List */}
        {companies.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">{t('noClients')}</p>
            <p className="text-sm mt-1">{t('noClientsHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {companies.map((company) => (
              <div
                key={company.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{company.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span className="sm:hidden">{company.contacts.length}</span>
                        <span className="hidden sm:inline">{t('contactCount', { count: company.contacts.length })}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <FolderKanban className="w-3 h-3" />
                        <span className="sm:hidden">{company._count.projects}</span>
                        <span className="hidden sm:inline">{t('projectCount', { count: company._count.projects })}</span>
                      </span>
                    </div>
                  </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditCompany(company)}
                        title={t('editCompany')}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirmDelete('company', company.id, company.name)}
                        title={t('deleteCompany')}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openContactsModal(company)}
                        className="ml-2"
                      >
                        <span className="hidden sm:inline mr-1">{t('contacts')}</span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
      </div>

      {/* Add Company Modal */}
      <Dialog open={showAddCompanyModal} onOpenChange={setShowAddCompanyModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {t('addClientCompany')}
            </DialogTitle>
            <DialogDescription>
              {t('addClientCompanyDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="companyName">{t('companyName')}</Label>
              <Input
                id="companyName"
                placeholder={t('companyNamePlaceholder')}
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCompany()}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tc('cancel')}</Button>
            </DialogClose>
            <Button onClick={handleAddCompany} disabled={saving}>
              {saving ? tc('adding') : t('addCompany')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Company Modal */}
      <Dialog open={showEditCompanyModal} onOpenChange={setShowEditCompanyModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-primary" />
              {t('editCompanyTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('editCompanyDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="editCompanyName">{t('companyName')}</Label>
              <Input
                id="editCompanyName"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEditCompany()}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tc('cancel')}</Button>
            </DialogClose>
            <Button onClick={handleEditCompany} disabled={saving}>
              {saving ? tc('saving') : tc('saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contacts Modal */}
      <Dialog open={showContactsModal} onOpenChange={setShowContactsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {selectedCompany?.name}
            </DialogTitle>
            <DialogDescription>
              {t('manageContacts')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium">{t('contacts')}</span>
              <Button size="sm" variant="outline" onClick={openAddContact}>
                <Plus className="w-4 h-4 mr-1" />
                {t('addContact')}
              </Button>
            </div>
            
            {selectedCompany?.contacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('noContacts')}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectedCompany?.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded bg-muted">
                        <User className="w-3 h-3" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{contact.name}</p>
                        {contact.email && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3" />
                            {contact.email}
                          </p>
                        )}
                        {contact.language && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <Globe className="w-3 h-3" />
                            {LOCALE_NAMES[contact.language] || contact.language}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditContact(contact)}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => confirmDelete('contact', contact.id, contact.name)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tc('close')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Modal */}
      <Dialog open={showAddContactModal} onOpenChange={setShowAddContactModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              {t('addContact')}
            </DialogTitle>
            <DialogDescription>
              {t('addContactDescription', { company: selectedCompany?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="contactName">{t('contactName')}</Label>
              <Input
                id="contactName"
                placeholder={t('contactNamePlaceholder')}
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">{t('contactEmail')}</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder={t('contactEmailPlaceholder')}
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddContact()}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactLanguage">{t('contactLanguage')}</Label>
              <Select value={newContactLanguage} onValueChange={setNewContactLanguage}>
                <SelectTrigger id="contactLanguage">
                  <SelectValue placeholder={t('contactLanguageDefault')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('contactLanguageDefault')}</SelectItem>
                  {SUPPORTED_LOCALES.map(code => (
                    <SelectItem key={code} value={code}>
                      {LOCALE_NAMES[code] || code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('contactLanguageHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tc('cancel')}</Button>
            </DialogClose>
            <Button onClick={handleAddContact} disabled={saving}>
              {saving ? tc('adding') : t('addContact')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Modal */}
      <Dialog open={showEditContactModal} onOpenChange={setShowEditContactModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-primary" />
              {t('editContact')}
            </DialogTitle>
            <DialogDescription>
              {t('editContactDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="editContactName">{t('contactName')}</Label>
              <Input
                id="editContactName"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editContactEmail">{t('contactEmail')}</Label>
              <Input
                id="editContactEmail"
                type="email"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEditContact()}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editContactLanguage">{t('contactLanguage')}</Label>
              <Select value={newContactLanguage} onValueChange={setNewContactLanguage}>
                <SelectTrigger id="editContactLanguage">
                  <SelectValue placeholder={t('contactLanguageDefault')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('contactLanguageDefault')}</SelectItem>
                  {SUPPORTED_LOCALES.map(code => (
                    <SelectItem key={code} value={code}>
                      {LOCALE_NAMES[code] || code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('contactLanguageHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tc('cancel')}</Button>
            </DialogClose>
            <Button onClick={handleEditContact} disabled={saving}>
              {saving ? tc('saving') : tc('saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              {t('confirmDeleteTitle')}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === 'company'
                ? t('confirmDeleteCompany', { name: deleteTarget?.name ?? '' })
                : t('confirmDeleteContact', { name: deleteTarget?.name ?? '' })
              }
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tc('cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? tc('deleting') : tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

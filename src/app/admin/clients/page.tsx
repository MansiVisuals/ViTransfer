'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Building2, Plus, Search, Users, Trash2, Edit, FolderKanban, User, Mail, ChevronRight, RefreshCw, AlertCircle, Check } from 'lucide-react'
import { apiFetch, apiPost, apiPatch, apiDelete } from '@/lib/api-client'

interface ClientContact {
  id: string
  name: string
  email: string | null
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
      console.error('Failed to load companies:', err)
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
      setError('Company name is required')
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
      setError(err instanceof Error ? err.message : 'Failed to add company')
    } finally {
      setSaving(false)
    }
  }

  async function handleEditCompany() {
    if (!editingCompany || !newCompanyName.trim()) {
      setError('Company name is required')
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
      setError(err instanceof Error ? err.message : 'Failed to update company')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddContact() {
    if (!selectedCompany || !newContactName.trim()) {
      setError('Contact name is required')
      return
    }
    
    setSaving(true)
    setError('')
    
    try {
      await apiPost(`/api/clients/${selectedCompany.id}/contacts`, {
        name: newContactName.trim(),
        email: newContactEmail.trim() || null
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
      setShowAddContactModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact')
    } finally {
      setSaving(false)
    }
  }

  async function handleEditContact() {
    if (!selectedCompany || !editingContact || !newContactName.trim()) {
      setError('Contact name is required')
      return
    }
    
    setSaving(true)
    setError('')
    
    try {
      await apiPatch(`/api/clients/${selectedCompany.id}/contacts/${editingContact.id}`, {
        name: newContactName.trim(),
        email: newContactEmail.trim() || null
      })
      
      // Reload selected company contacts
      const response = await apiFetch(`/api/clients/${selectedCompany.id}`)
      if (response.ok) {
        const data = await response.json()
        setSelectedCompany(data.company)
      }
      
      setNewContactName('')
      setNewContactEmail('')
      setEditingContact(null)
      setShowEditContactModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update contact')
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
      setError(err instanceof Error ? err.message : 'Failed to delete')
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
      setError(err instanceof Error ? err.message : 'Failed to backfill')
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
    setError('')
    setShowAddContactModal(true)
  }

  function openEditContact(contact: ClientContact) {
    setEditingContact(contact)
    setNewContactName(contact.name)
    setNewContactEmail(contact.email || '')
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
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Client Directory
                </CardTitle>
                <CardDescription>
                  Manage your client companies and contacts. New recipients are automatically added when created in projects.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackfill}
                  disabled={backfilling}
                  title="Import existing clients from historical projects"
                >
                  {backfilling ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline ml-2">Sync Existing</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setNewCompanyName('')
                    setError('')
                    setShowAddCompanyModal(true)
                  }}
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline ml-2">Add Company</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
                  placeholder="Search companies or contacts..."
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
                <p className="font-medium">No clients yet</p>
                <p className="text-sm mt-1">Add your first client company or import from existing projects</p>
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
                            {company.contacts.length} contact{company.contacts.length !== 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            <FolderKanban className="w-3 h-3" />
                            {company._count.projects} project{company._count.projects !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditCompany(company)}
                        title="Edit company"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirmDelete('company', company.id, company.name)}
                        title="Delete company"
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
                        <span className="hidden sm:inline mr-1">Contacts</span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Company Modal */}
      <Dialog open={showAddCompanyModal} onOpenChange={setShowAddCompanyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Client Company</DialogTitle>
            <DialogDescription>
              Create a new client company in your directory
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
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                placeholder="e.g., Acme Corporation"
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
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleAddCompany} disabled={saving}>
              {saving ? 'Adding...' : 'Add Company'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Company Modal */}
      <Dialog open={showEditCompanyModal} onOpenChange={setShowEditCompanyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>
              Update the company name
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
              <Label htmlFor="editCompanyName">Company Name</Label>
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
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleEditCompany} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contacts Modal */}
      <Dialog open={showContactsModal} onOpenChange={setShowContactsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {selectedCompany?.name}
            </DialogTitle>
            <DialogDescription>
              Manage contacts for this company
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
              <span className="text-sm font-medium">Contacts</span>
              <Button size="sm" variant="outline" onClick={openAddContact}>
                <Plus className="w-4 h-4 mr-1" />
                Add Contact
              </Button>
            </div>
            
            {selectedCompany?.contacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No contacts yet</p>
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
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Modal */}
      <Dialog open={showAddContactModal} onOpenChange={setShowAddContactModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Add a new contact to {selectedCompany?.name}
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
              <Label htmlFor="contactName">Name</Label>
              <Input
                id="contactName"
                placeholder="e.g., John Doe"
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
              <Label htmlFor="contactEmail">Email (Optional)</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder="e.g., john@example.com"
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
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleAddContact} disabled={saving}>
              {saving ? 'Adding...' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Modal */}
      <Dialog open={showEditContactModal} onOpenChange={setShowEditContactModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>
              Update contact information
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
              <Label htmlFor="editContactName">Name</Label>
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
              <Label htmlFor="editContactEmail">Email (Optional)</Label>
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
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleEditContact} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === 'company' 
                ? `Are you sure you want to delete "${deleteTarget?.name}"? All contacts for this company will also be deleted.`
                : `Are you sure you want to delete contact "${deleteTarget?.name}"?`
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
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

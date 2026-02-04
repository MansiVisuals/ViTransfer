'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Building2, User, ChevronDown, X, Plus, Check, Mail } from 'lucide-react'
import { apiFetch, apiPost } from '@/lib/api-client'

interface ClientContact {
  id: string
  name: string
  email: string | null
  companyId: string
  companyName: string
}

interface ClientCompany {
  id: string
  name: string
  contactCount: number
}

interface ClientSelectorProps {
  companyName: string
  onCompanyChange: (name: string, companyId: string | null) => void
  recipientName: string
  onRecipientNameChange: (name: string) => void
  recipientEmail: string
  onRecipientEmailChange: (email: string) => void
  disabled?: boolean
}

export function ClientSelector({
  companyName,
  onCompanyChange,
  recipientName,
  onRecipientNameChange,
  recipientEmail,
  onRecipientEmailChange,
  disabled = false
}: ClientSelectorProps) {
  const [companySearch, setCompanySearch] = useState(companyName)
  const [contactSearch, setContactSearch] = useState(recipientName)
  const [companies, setCompanies] = useState<ClientCompany[]>([])
  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  
  const companyRef = useRef<HTMLDivElement>(null)
  const contactRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (companyRef.current && !companyRef.current.contains(event.target as Node)) {
        setShowCompanyDropdown(false)
      }
      if (contactRef.current && !contactRef.current.contains(event.target as Node)) {
        setShowContactDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search companies
  const searchCompanies = useCallback(async (query: string) => {
    if (query.length < 1) {
      setCompanies([])
      return
    }

    setLoading(true)
    try {
      const response = await apiFetch(`/api/clients/search?q=${encodeURIComponent(query)}&type=company`)
      if (response.ok) {
        const data = await response.json()
        setCompanies(data.companies || [])
      }
    } catch (err) {
      console.error('Failed to search companies:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Search contacts
  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 1) {
      setContacts([])
      return
    }

    setLoading(true)
    try {
      const response = await apiFetch(`/api/clients/search?q=${encodeURIComponent(query)}&type=contact`)
      if (response.ok) {
        const data = await response.json()
        setContacts(data.contacts || [])
      }
    } catch (err) {
      console.error('Failed to search contacts:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showCompanyDropdown) {
        searchCompanies(companySearch)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [companySearch, showCompanyDropdown, searchCompanies])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (showContactDropdown) {
        searchContacts(contactSearch)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [contactSearch, showContactDropdown, searchContacts])

  function handleCompanySelect(company: ClientCompany) {
    setCompanySearch(company.name)
    setSelectedCompanyId(company.id)
    onCompanyChange(company.name, company.id)
    setShowCompanyDropdown(false)
  }

  function handleContactSelect(contact: ClientContact) {
    setContactSearch(contact.name)
    onRecipientNameChange(contact.name)
    if (contact.email) {
      onRecipientEmailChange(contact.email)
    }
    // Also set company if not already set
    if (!companySearch || companySearch !== contact.companyName) {
      setCompanySearch(contact.companyName)
      setSelectedCompanyId(contact.companyId)
      onCompanyChange(contact.companyName, contact.companyId)
    }
    setShowContactDropdown(false)
  }

  function handleCompanyInputChange(value: string) {
    setCompanySearch(value)
    onCompanyChange(value, null) // Clear company ID when manually typing
    setSelectedCompanyId(null)
    if (value.length >= 1) {
      setShowCompanyDropdown(true)
    } else {
      setShowCompanyDropdown(false)
    }
  }

  function handleContactInputChange(value: string) {
    setContactSearch(value)
    onRecipientNameChange(value)
    if (value.length >= 1) {
      setShowContactDropdown(true)
    } else {
      setShowContactDropdown(false)
    }
  }

  async function handleCreateCompany() {
    if (!companySearch.trim()) return

    try {
      const response = await apiPost('/api/clients', { name: companySearch.trim() })
      if (response.company) {
        setSelectedCompanyId(response.company.id)
        onCompanyChange(response.company.name, response.company.id)
        setShowCompanyDropdown(false)
      }
    } catch (err) {
      console.error('Failed to create company:', err)
    }
  }

  // Sync external prop changes
  useEffect(() => {
    setCompanySearch(companyName)
  }, [companyName])

  useEffect(() => {
    setContactSearch(recipientName)
  }, [recipientName])

  const showCreateCompanyOption = companySearch.trim().length > 0 && 
    !companies.some(c => c.name.toLowerCase() === companySearch.toLowerCase())

  return (
    <div className="space-y-4">
      {/* Company Selection */}
      <div className="space-y-2" ref={companyRef}>
        <Label htmlFor="companyName">Company/Brand Name (Optional)</Label>
        <div className="relative">
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="companyName"
              name="company-search-field"
              placeholder="e.g., XYZ Corporation"
              value={companySearch}
              onChange={(e) => handleCompanyInputChange(e.target.value)}
              onFocus={() => companySearch.length >= 1 && setShowCompanyDropdown(true)}
              disabled={disabled}
              className="pl-9 pr-8"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore
            />
            {selectedCompanyId && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Check className="w-4 h-4 text-success" />
              </div>
            )}
          </div>
          
          {showCompanyDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
              ) : (
                <>
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between"
                      onClick={() => handleCompanySelect(company)}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span>{company.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {company.contactCount} contact{company.contactCount !== 1 ? 's' : ''}
                      </span>
                    </button>
                  ))}
                  {showCreateCompanyOption && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 border-t border-border"
                      onClick={handleCreateCompany}
                    >
                      <Plus className="w-4 h-4 text-primary" />
                      <span>Create &quot;{companySearch.trim()}&quot;</span>
                    </button>
                  )}
                  {companies.length === 0 && !showCreateCompanyOption && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No matching companies</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Client Contact */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2" ref={contactRef}>
          <Label htmlFor="recipientName">Client Name (Optional)</Label>
          <div className="relative">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="recipientName"
                name="contact-search-field"
                placeholder="e.g., John Doe"
                value={contactSearch}
                onChange={(e) => handleContactInputChange(e.target.value)}
                onFocus={() => contactSearch.length >= 1 && setShowContactDropdown(true)}
                disabled={disabled}
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
            
            {showContactDropdown && contacts.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-accent"
                    onClick={() => handleContactSelect(contact)}
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{contact.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {contact.companyName}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipientEmail">Client Email (Optional)</Label>
          <Input
            id="recipientEmail"
            name="client-email-field"
            type="email"
            placeholder="e.g., client@example.com"
            value={recipientEmail}
            onChange={(e) => onRecipientEmailChange(e.target.value)}
            disabled={disabled}
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
      <p className="text-xs text-muted-foreground">
        Start typing to search your client directory. Selected contacts will auto-fill company and email.
      </p>
    </div>
  )
}

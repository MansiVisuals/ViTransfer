'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Building2, User, Search, Plus } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

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
  contacts: {
    id: string
    name: string
    email: string | null
  }[]
}

interface ClientDirectoryQuickAddProps {
  companyId: string | null
  onAddRecipient: (name: string, email: string | null) => void
  disabled?: boolean
}

/**
 * A component that allows quickly adding recipients from the client directory.
 * Shows contacts from the selected company, or allows searching all contacts.
 */
export function ClientDirectoryQuickAdd({
  companyId,
  onAddRecipient,
  disabled = false
}: ClientDirectoryQuickAddProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [companyContacts, setCompanyContacts] = useState<{id: string; name: string; email: string | null}[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load company contacts when companyId changes
  useEffect(() => {
    async function loadCompanyContacts() {
      if (!companyId) {
        setCompanyContacts([])
        return
      }

      try {
        const response = await apiFetch(`/api/clients/${companyId}`)
        if (response.ok) {
          const data = await response.json()
          setCompanyContacts(data.company?.contacts || [])
        }
      } catch (err) {
        console.error('Failed to load company contacts:', err)
      }
    }

    loadCompanyContacts()
  }, [companyId])

  // Search all contacts
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
      if (isOpen && searchQuery) {
        searchContacts(searchQuery)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [searchQuery, isOpen, searchContacts])

  function handleSelectContact(contact: { name: string; email: string | null }) {
    onAddRecipient(contact.name, contact.email)
    setIsOpen(false)
    setSearchQuery('')
  }

  // Determine which contacts to show
  const showCompanyContacts = companyId && !searchQuery && companyContacts.length > 0
  const showSearchResults = searchQuery && contacts.length > 0

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="gap-2"
      >
        <Building2 className="w-4 h-4" />
        Add from Directory
      </Button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-80 bg-popover border border-border rounded-lg shadow-lg">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {/* Company contacts (when no search) */}
            {showCompanyContacts && (
              <div className="p-2">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Company Contacts
                </p>
                {companyContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleSelectContact(contact)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-accent transition-colors"
                  >
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{contact.name}</p>
                    </div>
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}

            {/* Search results */}
            {showSearchResults && (
              <div className="p-2">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Search Results
                </p>
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleSelectContact(contact)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-accent transition-colors"
                  >
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{contact.name}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {contact.companyName}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            )}

            {/* Empty state */}
            {!loading && !showCompanyContacts && !showSearchResults && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {searchQuery 
                  ? 'No contacts found' 
                  : companyId 
                    ? 'No contacts in this company. Search to find others.'
                    : 'Search for contacts or select a company first'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

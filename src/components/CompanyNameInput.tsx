'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Building2, Check, Plus } from 'lucide-react'
import { apiFetch, apiPost } from '@/lib/api-client'

interface ClientCompany {
  id: string
  name: string
  contactCount: number
}

interface CompanyNameInputProps {
  value: string
  selectedId: string | null
  onChange: (name: string, id: string | null) => void
  disabled?: boolean
}

export function CompanyNameInput({
  value,
  selectedId,
  onChange,
  disabled = false
}: CompanyNameInputProps) {
  const [search, setSearch] = useState(value)
  const [companies, setCompanies] = useState<ClientCompany[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
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

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showDropdown) {
        searchCompanies(search)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [search, showDropdown, searchCompanies])

  function handleSelect(company: ClientCompany) {
    setSearch(company.name)
    onChange(company.name, company.id)
    setShowDropdown(false)
  }

  function handleInputChange(newValue: string) {
    setSearch(newValue)
    onChange(newValue, null) // Clear company ID when manually typing
    if (newValue.length >= 1) {
      setShowDropdown(true)
    } else {
      setShowDropdown(false)
    }
  }

  async function handleCreateCompany() {
    if (!search.trim()) return

    try {
      const response = await apiPost('/api/clients', { name: search.trim() })
      if (response.company) {
        onChange(response.company.name, response.company.id)
        setShowDropdown(false)
      }
    } catch (err) {
      console.error('Failed to create company:', err)
    }
  }

  // Sync external value changes
  useEffect(() => {
    setSearch(value)
  }, [value])

  const showCreateOption = search.trim().length > 0 && 
    !companies.some(c => c.name.toLowerCase() === search.toLowerCase())

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          id="companyName"
          placeholder="e.g., XYZ Corporation"
          value={search}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => search.length >= 1 && setShowDropdown(true)}
          disabled={disabled}
          className="pl-9 pr-8"
          autoComplete="off"
          maxLength={100}
        />
        {selectedId && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Check className="w-4 h-4 text-success" />
          </div>
        )}
      </div>
      
      {showDropdown && (
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
                  onClick={() => handleSelect(company)}
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
              {showCreateOption && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 border-t border-border"
                  onClick={handleCreateCompany}
                >
                  <Plus className="w-4 h-4 text-primary" />
                  <span>Add &quot;{search.trim()}&quot; to directory</span>
                </button>
              )}
              {companies.length === 0 && !showCreateOption && (
                <div className="px-3 py-2 text-sm text-muted-foreground">No matching companies</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

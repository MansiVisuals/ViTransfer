'use client'

import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Mail, Edit, Trash2, Plus, Star, Check, Bell, BellOff } from 'lucide-react'

interface Recipient {
  id?: string
  email: string | null
  name: string | null
  isPrimary: boolean
  receiveNotifications: boolean
}

interface RecipientManagerProps {
  projectId: string
  onError: (message: string) => void
}

export function RecipientManager({ projectId, onError }: RecipientManagerProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editName, setEditName] = useState('')

  useEffect(() => {
    loadRecipients()
  }, [projectId])

  const loadRecipients = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/recipients`)
      if (response.ok) {
        const data = await response.json()
        setRecipients(data.recipients || [])
      }
    } catch (error) {
      // Failed to load recipients - will show empty state
    } finally {
      setLoading(false)
    }
  }

  const addRecipient = async () => {
    if (!newEmail && !newName) {
      onError('Please enter at least a name or email address')
      return
    }

    if (newEmail && !newEmail.includes('@')) {
      onError('Please enter a valid email address')
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail || null,
          name: newName || null,
          isPrimary: recipients.length === 0,
        }),
      })

      if (response.ok) {
        setNewEmail('')
        setNewName('')
        setShowAddForm(false)
        await loadRecipients()
      } else {
        const data = await response.json()
        onError(data.error || 'Failed to add recipient')
      }
    } catch (error) {
      onError('Failed to add recipient')
    }
  }

  const deleteRecipient = async (recipientId: string) => {
    if (!confirm('Are you sure you want to remove this recipient?')) {
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/recipients/${recipientId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await loadRecipients()
      } else {
        const data = await response.json()
        onError(data.error || 'Failed to delete recipient')
      }
    } catch (error) {
      onError('Failed to delete recipient')
    }
  }

  const setPrimary = async (recipientId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/recipients/${recipientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      })

      if (response.ok) {
        await loadRecipients()
      } else {
        onError('Failed to set primary recipient')
      }
    } catch (error) {
      onError('Failed to set primary recipient')
    }
  }

  const toggleNotifications = async (recipientId: string, currentValue: boolean) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/recipients/${recipientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiveNotifications: !currentValue }),
      })

      if (response.ok) {
        await loadRecipients()
      } else {
        onError('Failed to update notification settings')
      }
    } catch (error) {
      onError('Failed to update notification settings')
    }
  }

  const startEdit = (recipient: Recipient) => {
    setEditingId(recipient.id!)
    setEditEmail(recipient.email || '')
    setEditName(recipient.name || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditEmail('')
    setEditName('')
  }

  const saveEdit = async () => {
    if (!editingId) return

    if (!editEmail && !editName) {
      onError('Please enter at least a name or email address')
      return
    }

    if (editEmail && !editEmail.includes('@')) {
      onError('Please enter a valid email address')
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/recipients/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName || null,
          email: editEmail || null
        }),
      })

      if (response.ok) {
        cancelEdit()
        await loadRecipients()
      } else {
        onError('Failed to update recipient')
      }
    } catch (error) {
      onError('Failed to update recipient')
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Loading recipients...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label>Recipients</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Manage who receives project notifications and updates
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Recipient
        </Button>
      </div>

      {recipients.length === 0 && !showAddForm ? (
        <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
          No recipients added yet. Click "Add Recipient" to add one.
        </div>
      ) : (
        <div className="space-y-2">
          {recipients.map((recipient) => (
            <div key={recipient.id} className="border rounded-lg bg-card">
              {editingId === recipient.id ? (
                <div className="p-4 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor={`edit-name-${recipient.id}`}>Client Name</Label>
                    <Input
                      id={`edit-name-${recipient.id}`}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="John Doe or Company Name"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-email-${recipient.id}`}>Client Email</Label>
                    <Input
                      id={`edit-email-${recipient.id}`}
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={saveEdit} size="sm">
                      <Check className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3">
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {recipient.name || recipient.email || 'No contact info'}
                      </span>
                      {recipient.isPrimary && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                          <Star className="w-3 h-3 mr-1" />
                          Primary
                        </span>
                      )}
                    </div>
                    {recipient.name && recipient.email && (
                      <div className="flex items-center gap-2 pl-6">
                        <span className="text-xs text-muted-foreground truncate">{recipient.email}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:ml-auto">
                    {!recipient.isPrimary && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPrimary(recipient.id!)}
                        title="Set as primary"
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    {recipient.email && (
                      <Button
                        type="button"
                        variant={recipient.receiveNotifications ? "ghost" : "outline"}
                        size="sm"
                        onClick={() => toggleNotifications(recipient.id!, recipient.receiveNotifications)}
                        title={recipient.receiveNotifications ? "Notifications enabled" : "Notifications disabled"}
                        className={!recipient.receiveNotifications ? "text-muted-foreground" : ""}
                      >
                        {recipient.receiveNotifications ? (
                          <Bell className="w-4 h-4 text-green-600" />
                        ) : (
                          <BellOff className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(recipient)}
                      title="Edit recipient"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRecipient(recipient.id!)}
                      title="Remove recipient"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {showAddForm && (
            <div className="p-4 border-2 border-dashed rounded-lg space-y-3">
              <div className="space-y-2">
                <Label htmlFor="newRecipientName">Client Name</Label>
                <Input
                  id="newRecipientName"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="John Doe or Company Name"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newRecipientEmail">Client Email</Label>
                <Input
                  id="newRecipientEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={addRecipient}
                  size="sm"
                  disabled={!newEmail && !newName}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false)
                    setNewEmail('')
                    setNewName('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

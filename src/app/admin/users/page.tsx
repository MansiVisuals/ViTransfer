'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Users, UserPlus, Edit, Trash2, Mail, User, Search, RefreshCw, AlertCircle, Eye, EyeOff, Copy, Check, KeyRound, Fingerprint, Plus } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { apiDelete, apiFetch, apiPost, apiPatch } from '@/lib/api-client'
import { PasswordRequirements } from '@/components/PasswordRequirements'
import { startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'

interface UserData {
  id: string
  email: string
  username: string | null
  name: string | null
  role: string
  createdAt: string
  updatedAt: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [loggedInUser, setLoggedInUser] = useState<UserData | null>(null)

  // Modal states
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showEditUserModal, setShowEditUserModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showPasskeyModal, setShowPasskeyModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form states
  const [editingUser, setEditingUser] = useState<UserData | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null)

  // New user form
  const [newUserData, setNewUserData] = useState({
    email: '',
    username: '',
    name: '',
    password: '',
    confirmPassword: '',
  })

  // Edit user form
  const [editFormData, setEditFormData] = useState({
    email: '',
    username: '',
    name: '',
  })

  // Password form
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [copiedPassword, setCopiedPassword] = useState(false)

  // Passkey state
  const [passkeys, setPasskeys] = useState<any[]>([])
  const [passkeyAvailable, setPasskeyAvailable] = useState(false)

  // Action states
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/users')
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data.users)
    } catch (err) {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLoggedInUser = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/session')
      if (res.ok) {
        const data = await res.json()
        setLoggedInUser(data.user)
      }
    } catch (err) {
      // Silently fail
    }
  }, [])

  const fetchPasskeyStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/passkey/status')
      if (res.ok) {
        const data = await res.json()
        setPasskeyAvailable(data.available)
      }
    } catch (err) {
      // Silently fail
    }
  }, [])

  const fetchPasskeys = useCallback(async (userId: string) => {
    try {
      const res = await apiFetch(`/api/auth/passkey/list?userId=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setPasskeys(data.passkeys || [])
      }
    } catch (err) {
      // Silently fail
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchLoggedInUser()
    fetchPasskeyStatus()
  }, [fetchUsers, fetchLoggedInUser, fetchPasskeyStatus])

  // Filter users by search
  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      user.email.toLowerCase().includes(query) ||
      user.name?.toLowerCase().includes(query) ||
      user.username?.toLowerCase().includes(query)
    )
  })

  // Password generation
  const generateRandomPassword = (forNewUser = false) => {
    const length = 16
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const lowercase = 'abcdefghijklmnopqrstuvwxyz'
    const numbers = '0123456789'
    const special = '!@#$%^&*'
    const all = uppercase + lowercase + numbers + special

    const getRandomInt = (max: number) => {
      const array = new Uint32Array(1)
      crypto.getRandomValues(array)
      return array[0] % max
    }

    let password = ''
    password += uppercase[getRandomInt(uppercase.length)]
    password += lowercase[getRandomInt(lowercase.length)]
    password += numbers[getRandomInt(numbers.length)]
    password += special[getRandomInt(special.length)]

    for (let i = password.length; i < length; i++) {
      password += all[getRandomInt(all.length)]
    }

    const chars = password.split('')
    for (let i = chars.length - 1; i > 0; i--) {
      const j = getRandomInt(i + 1)
      ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    password = chars.join('')

    if (forNewUser) {
      setNewUserData(prev => ({ ...prev, password, confirmPassword: password }))
    } else {
      setPasswordData(prev => ({ ...prev, password, confirmPassword: password }))
    }
    setShowPassword(true)
    setShowConfirmPassword(true)
  }

  const copyPassword = async (password: string) => {
    await navigator.clipboard.writeText(password)
    setCopiedPassword(true)
    setTimeout(() => setCopiedPassword(false), 2000)
  }

  // Add user
  async function handleAddUser() {
    if (!newUserData.email || !newUserData.password) {
      setError('Email and password are required')
      return
    }
    if (newUserData.password !== newUserData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSaving(true)
    setError('')

    try {
      await apiPost('/api/users', {
        email: newUserData.email,
        username: newUserData.username || undefined,
        name: newUserData.name || undefined,
        password: newUserData.password,
      })
      await fetchUsers()
      setNewUserData({ email: '', username: '', name: '', password: '', confirmPassword: '' })
      setShowAddUserModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  // Edit user
  function openEditModal(user: UserData) {
    setEditingUser(user)
    setEditFormData({
      email: user.email,
      username: user.username || '',
      name: user.name || '',
    })
    setError('')
    setShowEditUserModal(true)
  }

  async function handleEditUser() {
    if (!editingUser || !editFormData.email) {
      setError('Email is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      await apiPatch(`/api/users/${editingUser.id}`, {
        email: editFormData.email,
        username: editFormData.username || null,
        name: editFormData.name || null,
      })
      await fetchUsers()
      setShowEditUserModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  // Change password
  function openPasswordModal(user: UserData) {
    setEditingUser(user)
    setPasswordData({ oldPassword: '', password: '', confirmPassword: '' })
    setShowPassword(false)
    setShowConfirmPassword(false)
    setError('')
    setShowPasswordModal(true)
  }

  async function handleChangePassword() {
    if (!editingUser) return

    const isOwnAccount = loggedInUser?.id === editingUser.id
    if (isOwnAccount && !passwordData.oldPassword) {
      setError('Current password is required')
      return
    }
    if (!passwordData.password) {
      setError('New password is required')
      return
    }
    if (passwordData.password !== passwordData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSaving(true)
    setError('')

    try {
      await apiPatch(`/api/users/${editingUser.id}/password`, {
        oldPassword: isOwnAccount ? passwordData.oldPassword : undefined,
        newPassword: passwordData.password,
      })
      setShowPasswordModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  // Passkeys
  function openPasskeyModal(user: UserData) {
    setEditingUser(user)
    setError('')
    fetchPasskeys(user.id)
    setShowPasskeyModal(true)
  }

  async function handleRegisterPasskey() {
    if (!editingUser) return

    setError('')
    setSaving(true)

    try {
      const options: PublicKeyCredentialCreationOptionsJSON = await apiPost('/api/auth/passkey/register/options', {})
      const attestation = await startRegistration({ optionsJSON: options })
      await apiPost('/api/auth/passkey/register/verify', attestation)
      await fetchPasskeys(editingUser.id)
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Cancelled or timed out')
      } else if (err.name === 'InvalidStateError') {
        setError('This authenticator is already registered')
      } else {
        setError('Failed to register PassKey')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePasskey(passkeyId: string) {
    if (!editingUser || !confirm('Delete this PassKey?')) return

    try {
      await apiDelete(`/api/auth/passkey/${passkeyId}?userId=${editingUser.id}`)
      await fetchPasskeys(editingUser.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete passkey')
    }
  }

  // Delete user
  function confirmDelete(user: UserData) {
    setDeleteTarget(user)
    setError('')
    setShowDeleteConfirm(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return

    setSaving(true)
    setError('')

    try {
      await apiDelete(`/api/users/${deleteTarget.id}`)
      await fetchUsers()
      setShowDeleteConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setSaving(false)
    }
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
              <Users className="w-7 h-7 sm:w-8 sm:h-8" />
              User Management
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Manage administrator accounts
            </p>
          </div>
          <Button
            variant="default"
            size="default"
            onClick={() => {
              setNewUserData({ email: '', username: '', name: '', password: '', confirmPassword: '' })
              setShowPassword(false)
              setShowConfirmPassword(false)
              setError('')
              setShowAddUserModal(true)
            }}
          >
            <UserPlus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Add User</span>
          </Button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
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

        {/* Users List */}
        {filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No users found</p>
            <p className="text-sm mt-1">
              {searchQuery ? 'Try a different search term' : 'Add your first admin user to get started'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{user.name || user.username || user.email}</p>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-info-visible text-info border border-info-visible flex-shrink-0">
                        ADMIN
                      </span>
                      {loggedInUser?.id === user.id && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-success-visible text-success border border-success-visible flex-shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <span className="truncate">{user.email}</span>
                      </span>
                      {user.username && (
                        <span>@{user.username}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Created {formatDate(user.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1 ml-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditModal(user)}
                    title="Edit user"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openPasswordModal(user)}
                    title="Change password"
                  >
                    <KeyRound className="w-4 h-4" />
                  </Button>
                  {passkeyAvailable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openPasskeyModal(user)}
                      title="Manage passkeys"
                    >
                      <Fingerprint className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => confirmDelete(user)}
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete user"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Add New User
            </DialogTitle>
            <DialogDescription>
              Create a new administrator account
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 py-1">
            {error && (
              <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="newEmail" className="text-xs">Email *</Label>
              <Input
                id="newEmail"
                type="email"
                placeholder="admin@example.com"
                value={newUserData.email}
                onChange={(e) => setNewUserData(prev => ({ ...prev, email: e.target.value }))}
                className="h-8"
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="newUsername" className="text-xs">Username</Label>
                <Input
                  id="newUsername"
                  placeholder="admin"
                  value={newUserData.username}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, username: e.target.value }))}
                  className="h-8"
                  autoComplete="off"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="newName" className="text-xs">Display Name</Label>
                <Input
                  id="newName"
                  placeholder="John Doe"
                  value={newUserData.name}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, name: e.target.value }))}
                  className="h-8"
                  autoComplete="off"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="newPassword" className="text-xs">Password *</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => generateRandomPassword(true)}
                    className="h-6 px-2 text-xs"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Generate
                  </Button>
                  {newUserData.password && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyPassword(newUserData.password)}
                      className="h-6 px-2 text-xs"
                    >
                      {copiedPassword ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  )}
                </div>
              </div>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newUserData.password}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                  className="pr-8 h-8"
                  autoComplete="new-password"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="newConfirmPassword" className="text-xs">Confirm Password *</Label>
              <div className="relative">
                <Input
                  id="newConfirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={newUserData.confirmPassword}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="pr-8 h-8"
                  autoComplete="new-password"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>
            <PasswordRequirements password={newUserData.password} />
          </div>
          <DialogFooter className="pt-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleAddUser} disabled={saving}>
              {saving ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditUserModal} onOpenChange={setShowEditUserModal}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-primary" />
              Edit User
            </DialogTitle>
            <DialogDescription>
              Update user information
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email *</Label>
              <Input
                id="editEmail"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editUsername">Username</Label>
              <Input
                id="editUsername"
                value={editFormData.username}
                onChange={(e) => setEditFormData(prev => ({ ...prev, username: e.target.value }))}
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editName">Display Name</Label>
              <Input
                id="editName"
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                autoComplete="off"
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
            <Button onClick={handleEditUser} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              {editingUser && loggedInUser?.id === editingUser.id
                ? 'Enter your current password and choose a new one'
                : `Set a new password for ${editingUser?.name || editingUser?.email}`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}
            {editingUser && loggedInUser?.id === editingUser.id && (
              <div className="space-y-2">
                <Label htmlFor="oldPassword">Current Password *</Label>
                <Input
                  id="oldPassword"
                  type="password"
                  value={passwordData.oldPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, oldPassword: e.target.value }))}
                  autoComplete="current-password"
                />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">New Password *</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => generateRandomPassword(false)}
                    className="h-7 px-2 text-xs"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Generate
                  </Button>
                  {passwordData.password && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyPassword(passwordData.password)}
                      className="h-7 px-2 text-xs"
                    >
                      {copiedPassword ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  )}
                </div>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordData.password}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, password: e.target.value }))}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <PasswordRequirements password={passwordData.password} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleChangePassword} disabled={saving}>
              {saving ? 'Changing...' : 'Change Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Passkeys Modal */}
      <Dialog open={showPasskeyModal} onOpenChange={setShowPasskeyModal}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-primary" />
              Passkeys
            </DialogTitle>
            <DialogDescription>
              Manage passkeys for {editingUser?.name || editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}

            {passkeys.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Fingerprint className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No passkeys registered</p>
                <p className="text-xs mt-1">Add a passkey for passwordless login</p>
              </div>
            ) : (
              <div className="space-y-2">
                {passkeys.map((passkey) => (
                  <div
                    key={passkey.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Fingerprint className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {passkey.deviceType || 'Unknown Device'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Added {formatDate(passkey.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePasskey(passkey.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {loggedInUser?.id === editingUser?.id && (
              <Button
                onClick={handleRegisterPasskey}
                disabled={saving}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                {saving ? 'Registering...' : 'Add New Passkey'}
              </Button>
            )}

            {loggedInUser?.id !== editingUser?.id && (
              <p className="text-xs text-muted-foreground text-center">
                Users can only add passkeys to their own account
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user &quot;{deleteTarget?.name || deleteTarget?.email}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

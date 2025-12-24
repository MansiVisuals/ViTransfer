'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, UserPlus, Edit, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { apiDelete, apiFetch } from '@/lib/api-client'

interface User {
  id: string
  email: string
  username: string | null
  name: string | null
  role: string
  createdAt: string
  updatedAt: string
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/users')
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data.users)
    } catch (err) {
      setError('Failed to load users')
    } finally{
      setLoading(false)
    }
  }

  const handleDelete = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to delete user ${userEmail}?`)) {
      return
    }

    try {
      await apiDelete(`/api/users/${userId}`)

      // Refresh user list
      fetchUsers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading) {
    return (
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <p className="text-muted-foreground">Loading users...</p>
      </div>
    )
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Users className="w-7 h-7 sm:w-8 sm:h-8" />
            User Management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Manage admin users and their permissions</p>
        </div>
        <Button variant="default" size="default" onClick={() => router.push('/admin/users/new')}>
          <UserPlus className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Add New User</span>
        </Button>
      </div>

      {error && (
        <div className="bg-destructive-visible border-2 border-destructive-visible text-destructive font-medium px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {users.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-muted-foreground">
              No users found. Create your first user to get started.
            </CardContent>
          </Card>
        ) : (
          users.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold">{user.name || user.username || user.email}</h3>
                      <span className="px-2 py-1 text-xs rounded-full bg-info-visible text-info border-2 border-info-visible">
                        ADMIN
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                      <p>{user.email}</p>
                      {user.username && <p>@{user.username}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {formatDate(user.createdAt)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/admin/users/${user.id}`)}
                    >
                      <Edit className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">Edit</span>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(user.id, user.email)}
                    >
                      <Trash2 className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">Delete</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

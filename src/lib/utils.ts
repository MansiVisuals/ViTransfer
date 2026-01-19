import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { NextRequest } from 'next/server'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}

export function formatTimestamp(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) {
    return '0:00'
  }
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  // Show hours format for videos 60+ minutes
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  // Show minutes format for videos under 60 minutes
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format date with timezone awareness
 * Uses browser's timezone (client-side) or TZ env variable (server-side)
 * Format adapts based on detected timezone region
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date

  // Client-side: use browser timezone
  // Server-side: use TZ environment variable
  const timezone = typeof window !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : process.env.TZ!

  // Format date parts using Intl.DateTimeFormat with timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(d)
  const year = parts.find(p => p.type === 'year')?.value || ''
  const month = parts.find(p => p.type === 'month')?.value || ''
  const day = parts.find(p => p.type === 'day')?.value || ''

  // US/Americas format (MM-dd-yyyy)
  if (timezone.startsWith('America/') || timezone.startsWith('US/')) {
    return `${month}-${day}-${year}`
  }

  // European format (dd-MM-yyyy)
  if (timezone.startsWith('Europe/') || timezone.startsWith('Africa/')) {
    return `${day}-${month}-${year}`
  }

  // Asian/ISO format (yyyy-MM-dd) - also default
  return `${year}-${month}-${day}`
}

/**
 * Format date and time with timezone awareness
 * Uses browser's timezone (client-side) or TZ env variable (server-side)
 * Time is displayed in user's local timezone
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date

  // Client-side: use browser timezone
  // Server-side: use TZ environment variable
  const timezone = typeof window !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : process.env.TZ!

  const dateStr = formatDate(d)

  // Format time using Intl.DateTimeFormat with timezone
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false, // 24-hour format
  })

  const timeStr = timeFormatter.format(d)
  return `${dateStr} ${timeStr}`
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

export async function generateUniqueSlug(
  title: string,
  prisma: any,
  excludeId?: string
): Promise<string> {
  let slug = generateSlug(title)
  let counter = 1

  // Check if slug exists
  while (true) {
    const existing = await prisma.project.findUnique({
      where: { slug },
    })

    if (!existing || existing.id === excludeId) {
      break
    }

    // Append counter to make it unique
    slug = `${generateSlug(title)}-${counter}`
    counter++
  }

  return slug
}

export function getClientIpAddress(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Color assignment system with persistence and uniqueness guarantees
 * Ensures different names always get different colors within the same palette
 * 
 * @param name - User's name for color generation
 * @param isSender - True if this is the sender (your message), false for receiver
 */

// In-memory color registry (persists during page session)
const colorRegistry = {
  sender: new Map<string, string>(),
  receiver: new Map<string, string>()
}

export function getUserColor(name: string | null | undefined, isSender: boolean = false): { border: string } {
  if (!name) {
    // Default gray for anonymous
    return { border: 'border-gray-500' }
  }

  // Normalize name for consistency (trim, lowercase)
  const normalizedName = name.trim().toLowerCase()
  const palette = isSender ? 'sender' : 'receiver'
  
  // Check if this name already has a color assigned
  if (colorRegistry[palette].has(normalizedName)) {
    return { border: colorRegistry[palette].get(normalizedName)! }
  }

  // Expanded color palettes for better distribution
  const senderColors = [
    // Earth tones for sender (admins/studio) - 20 colors
    'border-amber-700',
    'border-orange-800',
    'border-stone-600',
    'border-yellow-700',
    'border-lime-700',
    'border-green-700',
    'border-emerald-800',
    'border-teal-800',
    'border-slate-600',
    'border-zinc-600',
    'border-amber-800',
    'border-yellow-800',
    'border-lime-800',
    'border-green-800',
    'border-teal-700',
    'border-cyan-800',
    'border-stone-700',
    'border-slate-700',
    'border-neutral-600',
    'border-orange-900',
  ]

  const receiverColors = [
    // Vibrant high-contrast colors for receiver (clients) - 20 colors
    'border-red-500',
    'border-orange-500',
    'border-amber-500',
    'border-yellow-400',
    'border-lime-500',
    'border-green-500',
    'border-emerald-500',
    'border-teal-500',
    'border-cyan-500',
    'border-sky-500',
    'border-blue-500',
    'border-indigo-500',
    'border-violet-500',
    'border-purple-500',
    'border-fuchsia-500',
    'border-pink-500',
    'border-rose-500',
    'border-red-600',
    'border-orange-600',
    'border-yellow-500',
  ]

  const colors = isSender ? senderColors : receiverColors
  
  // Get already assigned colors in this palette
  const assignedColors = new Set(colorRegistry[palette].values())
  
  // Find first available color (not yet assigned)
  let selectedColor: string
  const availableColors = colors.filter(color => !assignedColors.has(color))
  
  if (availableColors.length > 0) {
    // Use improved hash function for better distribution among available colors
    const hash = hashString(normalizedName)
    const colorIndex = Math.abs(hash) % availableColors.length
    selectedColor = availableColors[colorIndex]
  } else {
    // All colors assigned - fall back to hash-based selection (collision possible but rare)
    const hash = hashString(normalizedName)
    const colorIndex = Math.abs(hash) % colors.length
    selectedColor = colors[colorIndex]
  }
  
  // Store the assignment
  colorRegistry[palette].set(normalizedName, selectedColor)
  
  return { border: selectedColor }
}

/**
 * Improved hash function with better distribution
 * Uses djb2 algorithm which produces fewer collisions
 */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i) // hash * 33 + c
  }
  return hash
}

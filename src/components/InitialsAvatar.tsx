'use client'

import { cn, getUserColor } from '@/lib/utils'

type AvatarSize = 'sm' | 'md' | 'lg'

const COLOR_MAP: Record<string, { bg: string; ring: string; text: string }> = {
  'border-gray-500': {
    bg: 'bg-gray-500/20 dark:bg-gray-500/30',
    ring: 'ring-gray-500/30',
    text: 'text-gray-700 dark:text-gray-100',
  },
  'border-red-500': {
    bg: 'bg-red-500/20 dark:bg-red-500/30',
    ring: 'ring-red-500/30',
    text: 'text-red-700 dark:text-red-100',
  },
  'border-orange-500': {
    bg: 'bg-orange-500/20 dark:bg-orange-500/30',
    ring: 'ring-orange-500/30',
    text: 'text-orange-700 dark:text-orange-100',
  },
  'border-amber-500': {
    bg: 'bg-amber-500/20 dark:bg-amber-500/30',
    ring: 'ring-amber-500/30',
    text: 'text-amber-800 dark:text-amber-100',
  },
  'border-yellow-400': {
    bg: 'bg-yellow-400/25 dark:bg-yellow-400/30',
    ring: 'ring-yellow-400/30',
    text: 'text-yellow-900 dark:text-yellow-100',
  },
  'border-lime-500': {
    bg: 'bg-lime-500/20 dark:bg-lime-500/30',
    ring: 'ring-lime-500/30',
    text: 'text-lime-800 dark:text-lime-100',
  },
  'border-green-500': {
    bg: 'bg-green-500/20 dark:bg-green-500/30',
    ring: 'ring-green-500/30',
    text: 'text-green-800 dark:text-green-100',
  },
  'border-emerald-500': {
    bg: 'bg-emerald-500/20 dark:bg-emerald-500/30',
    ring: 'ring-emerald-500/30',
    text: 'text-emerald-800 dark:text-emerald-100',
  },
  'border-pink-500': {
    bg: 'bg-pink-500/20 dark:bg-pink-500/30',
    ring: 'ring-pink-500/30',
    text: 'text-pink-800 dark:text-pink-100',
  },
  'border-rose-500': {
    bg: 'bg-rose-500/20 dark:bg-rose-500/30',
    ring: 'ring-rose-500/30',
    text: 'text-rose-800 dark:text-rose-100',
  },
  'border-fuchsia-500': {
    bg: 'bg-fuchsia-500/20 dark:bg-fuchsia-500/30',
    ring: 'ring-fuchsia-500/30',
    text: 'text-fuchsia-800 dark:text-fuchsia-100',
  },

  // Sender palette (darker, earth tones)
  'border-amber-700': {
    bg: 'bg-amber-700/15 dark:bg-amber-700/30',
    ring: 'ring-amber-600/30',
    text: 'text-amber-900 dark:text-amber-50',
  },
  'border-orange-800': {
    bg: 'bg-orange-800/15 dark:bg-orange-800/30',
    ring: 'ring-orange-700/30',
    text: 'text-orange-950 dark:text-orange-50',
  },
  'border-stone-600': {
    bg: 'bg-stone-600/15 dark:bg-stone-600/30',
    ring: 'ring-stone-500/30',
    text: 'text-stone-900 dark:text-stone-50',
  },
  'border-yellow-700': {
    bg: 'bg-yellow-700/15 dark:bg-yellow-700/30',
    ring: 'ring-yellow-600/30',
    text: 'text-yellow-950 dark:text-yellow-50',
  },
  'border-lime-700': {
    bg: 'bg-lime-700/15 dark:bg-lime-700/30',
    ring: 'ring-lime-600/30',
    text: 'text-lime-950 dark:text-lime-50',
  },
  'border-green-700': {
    bg: 'bg-green-700/15 dark:bg-green-700/30',
    ring: 'ring-green-600/30',
    text: 'text-green-950 dark:text-green-50',
  },
  'border-emerald-800': {
    bg: 'bg-emerald-800/15 dark:bg-emerald-800/30',
    ring: 'ring-emerald-700/30',
    text: 'text-emerald-950 dark:text-emerald-50',
  },
  'border-teal-800': {
    bg: 'bg-teal-800/15 dark:bg-teal-800/30',
    ring: 'ring-teal-700/30',
    text: 'text-teal-950 dark:text-teal-50',
  },
  'border-slate-600': {
    bg: 'bg-slate-600/15 dark:bg-slate-600/30',
    ring: 'ring-slate-500/30',
    text: 'text-slate-900 dark:text-slate-50',
  },
  'border-zinc-600': {
    bg: 'bg-zinc-600/15 dark:bg-zinc-600/30',
    ring: 'ring-zinc-500/30',
    text: 'text-zinc-900 dark:text-zinc-50',
  },
  
  // Additional sender colors (expanded palette)
  'border-amber-800': {
    bg: 'bg-amber-800/15 dark:bg-amber-800/30',
    ring: 'ring-amber-700/30',
    text: 'text-amber-950 dark:text-amber-50',
  },
  'border-yellow-800': {
    bg: 'bg-yellow-800/15 dark:bg-yellow-800/30',
    ring: 'ring-yellow-700/30',
    text: 'text-yellow-950 dark:text-yellow-50',
  },
  'border-lime-800': {
    bg: 'bg-lime-800/15 dark:bg-lime-800/30',
    ring: 'ring-lime-700/30',
    text: 'text-lime-950 dark:text-lime-50',
  },
  'border-green-800': {
    bg: 'bg-green-800/15 dark:bg-green-800/30',
    ring: 'ring-green-700/30',
    text: 'text-green-950 dark:text-green-50',
  },
  'border-teal-700': {
    bg: 'bg-teal-700/15 dark:bg-teal-700/30',
    ring: 'ring-teal-600/30',
    text: 'text-teal-950 dark:text-teal-50',
  },
  'border-cyan-800': {
    bg: 'bg-cyan-800/15 dark:bg-cyan-800/30',
    ring: 'ring-cyan-700/30',
    text: 'text-cyan-950 dark:text-cyan-50',
  },
  'border-stone-700': {
    bg: 'bg-stone-700/15 dark:bg-stone-700/30',
    ring: 'ring-stone-600/30',
    text: 'text-stone-950 dark:text-stone-50',
  },
  'border-slate-700': {
    bg: 'bg-slate-700/15 dark:bg-slate-700/30',
    ring: 'ring-slate-600/30',
    text: 'text-slate-950 dark:text-slate-50',
  },
  'border-neutral-600': {
    bg: 'bg-neutral-600/15 dark:bg-neutral-600/30',
    ring: 'ring-neutral-500/30',
    text: 'text-neutral-900 dark:text-neutral-50',
  },
  'border-orange-900': {
    bg: 'bg-orange-900/15 dark:bg-orange-900/30',
    ring: 'ring-orange-800/30',
    text: 'text-orange-950 dark:text-orange-50',
  },
  
  // Additional receiver colors (expanded palette)
  'border-teal-500': {
    bg: 'bg-teal-500/20 dark:bg-teal-500/30',
    ring: 'ring-teal-500/30',
    text: 'text-teal-800 dark:text-teal-100',
  },
  'border-cyan-500': {
    bg: 'bg-cyan-500/20 dark:bg-cyan-500/30',
    ring: 'ring-cyan-500/30',
    text: 'text-cyan-800 dark:text-cyan-100',
  },
  'border-sky-500': {
    bg: 'bg-sky-500/20 dark:bg-sky-500/30',
    ring: 'ring-sky-500/30',
    text: 'text-sky-800 dark:text-sky-100',
  },
  'border-blue-500': {
    bg: 'bg-blue-500/20 dark:bg-blue-500/30',
    ring: 'ring-blue-500/30',
    text: 'text-blue-800 dark:text-blue-100',
  },
  'border-indigo-500': {
    bg: 'bg-indigo-500/20 dark:bg-indigo-500/30',
    ring: 'ring-indigo-500/30',
    text: 'text-indigo-800 dark:text-indigo-100',
  },
  'border-violet-500': {
    bg: 'bg-violet-500/20 dark:bg-violet-500/30',
    ring: 'ring-violet-500/30',
    text: 'text-violet-800 dark:text-violet-100',
  },
  'border-purple-500': {
    bg: 'bg-purple-500/20 dark:bg-purple-500/30',
    ring: 'ring-purple-500/30',
    text: 'text-purple-800 dark:text-purple-100',
  },
  'border-red-600': {
    bg: 'bg-red-600/20 dark:bg-red-600/30',
    ring: 'ring-red-600/30',
    text: 'text-red-900 dark:text-red-100',
  },
  'border-orange-600': {
    bg: 'bg-orange-600/20 dark:bg-orange-600/30',
    ring: 'ring-orange-600/30',
    text: 'text-orange-900 dark:text-orange-100',
  },
  'border-yellow-500': {
    bg: 'bg-yellow-500/25 dark:bg-yellow-500/30',
    ring: 'ring-yellow-500/30',
    text: 'text-yellow-900 dark:text-yellow-100',
  },
}

function initialsFromName(name: string | null | undefined): string {
  const value = (name || '').trim()
  if (!value) return '?'

  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    const word = parts[0]
    return word.slice(0, Math.min(2, word.length)).toUpperCase()
  }

  const first = parts[0][0] || ''
  const last = parts[parts.length - 1][0] || ''
  const initials = `${first}${last}`.trim()
  return initials ? initials.toUpperCase() : '?'
}

function sizeClasses(size: AvatarSize) {
  switch (size) {
    case 'sm':
      return 'h-7 w-7 text-[11px]'
    case 'lg':
      return 'h-10 w-10 text-sm'
    case 'md':
    default:
      return 'h-8 w-8 text-xs'
  }
}

export function InitialsAvatar(props: {
  name?: string | null
  size?: AvatarSize
  className?: string
  title?: string
  isInternal?: boolean // True if this is an internal/admin user (sender), false for client (receiver)
}) {
  const { name, size = 'md', className, title, isInternal = false } = props

  const color = getUserColor(name, isInternal)
  const classes = COLOR_MAP[color.border] || COLOR_MAP['border-gray-500']

  return (
    <div
      title={title || (name || undefined)}
      className={cn(
        'flex items-center justify-center rounded-full font-semibold ring-1 ring-inset select-none',
        sizeClasses(size),
        classes.bg,
        classes.ring,
        classes.text,
        className
      )}
    >
      {initialsFromName(name)}
    </div>
  )
}

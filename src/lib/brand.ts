import { prisma } from '@/lib/db'

type AccentKey =
  | 'blue'
  | 'purple'
  | 'green'
  | 'orange'
  | 'red'
  | 'pink'
  | 'teal'
  | 'amber'
  | 'stone'
  | 'gold'

const accentPalette: Record<AccentKey, string> = {
  blue: 'hsl(211 100% 50%)',
  purple: 'hsl(262 83% 58%)',
  green: 'hsl(145 63% 42%)',
  orange: 'hsl(25 95% 53%)',
  red: 'hsl(0 84% 60%)',
  pink: 'hsl(330 81% 60%)',
  teal: 'hsl(173 80% 40%)',
  amber: 'hsl(38 92% 50%)',
  stone: 'hsl(30 12% 50%)',
  gold: 'hsl(37 56% 65%)',
}

export async function getAccentColor(): Promise<string> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { accentColor: true },
    })
    const accentKey = (settings?.accentColor as AccentKey | undefined) || 'blue'
    return accentPalette[accentKey] || accentPalette.blue
  } catch {
    return accentPalette.blue
  }
}

export function buildLogoSvg(accentColor: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <style>
    :root {
      --logo-bg: #000000;
      --logo-slit: #000000;
      --logo-wedge: #ffffff;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --logo-bg: #f5f7fb;
        --logo-slit: #f5f7fb;
        --logo-wedge: #0b1220;
      }
    }
  </style>
  <rect width="64" height="64" rx="14" fill="var(--logo-bg)"/>
  <rect x="7" y="16" width="38" height="32" rx="9" fill="${accentColor}"/>
  <rect x="39" y="24" width="12" height="16" rx="5" fill="var(--logo-slit)"/>
  <path d="M57 24C55.5 22.2 52.5 22.2 51 24L46.5 30C44.5 31.8 44.5 32.2 46.5 34L51 40C52.5 41.8 55.5 41.8 57 40C54.5 34 54.5 30 57 24Z" fill="var(--logo-wedge)"/>
</svg>`
}

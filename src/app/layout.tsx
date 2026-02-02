import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AccentColorProvider } from "@/components/AccentColorProvider";
import { ServiceWorkerProvider } from "@/components/ServiceWorkerProvider";
import { prisma } from "@/lib/db";

const inter = Inter({ subsets: ["latin"] });

// Force Node.js runtime across the app to allow use of Node APIs (e.g., crypto).
export const runtime = 'nodejs';

// Prevent caching to ensure fresh appearance settings on every request
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "ViTransfer",
  description: "Professional video review and approval platform",
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.svg', type: 'image/svg+xml', sizes: '192x192' },
      { url: '/icons/icon-512.svg', type: 'image/svg+xml', sizes: '512x512' },
    ],
    apple: [
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ViTransfer',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0a0a0a',
}

// Fetch appearance settings server-side for immediate application
async function getAppearanceSettings() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { defaultTheme: true, accentColor: true },
    })
    return {
      defaultTheme: settings?.defaultTheme || 'auto',
      accentColor: settings?.accentColor || 'blue',
    }
  } catch {
    return { defaultTheme: 'auto', accentColor: 'blue' }
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch admin appearance settings server-side
  const appearance = await getAppearanceSettings()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Server-injected admin defaults (used when no localStorage cache)
                  var serverDefaultTheme = '${appearance.defaultTheme}';
                  var serverAccentColor = '${appearance.accentColor}';

                  // Apply theme
                  var userTheme = localStorage.getItem('theme');
                  var isDark = false;
                  if (userTheme === 'dark') {
                    document.documentElement.classList.add('dark');
                    isDark = true;
                  } else if (userTheme === 'light') {
                    document.documentElement.classList.remove('dark');
                  } else {
                    // No user preference - use cached admin default or server default
                    var adminDefault = localStorage.getItem('adminDefaultTheme') || serverDefaultTheme;
                    if (adminDefault === 'dark') {
                      document.documentElement.classList.add('dark');
                      isDark = true;
                    } else if (adminDefault === 'light') {
                      document.documentElement.classList.remove('dark');
                    } else {
                      // Admin default is 'auto' - use system preference
                      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        document.documentElement.classList.add('dark');
                        isDark = true;
                      }
                    }
                  }

                  // Apply accent color from cache or server default
                  var accentColors = {
                    blue: { light: '211 100% 50%', dark: '209 100% 60%' },
                    purple: { light: '262 83% 58%', dark: '262 83% 68%' },
                    green: { light: '145 63% 42%', dark: '145 63% 49%' },
                    orange: { light: '25 95% 53%', dark: '25 95% 60%' },
                    red: { light: '0 84% 60%', dark: '0 84% 65%' },
                    pink: { light: '330 81% 60%', dark: '330 81% 65%' },
                    teal: { light: '173 80% 40%', dark: '173 80% 50%' },
                    amber: { light: '38 92% 50%', dark: '38 92% 55%' },
                    stone: { light: '30 12% 50%', dark: '30 12% 62%' },
                    gold: { light: '37 56% 65%', dark: '37 56% 72%' }
                  };
                  var accentKey = localStorage.getItem('adminAccentColor') || serverAccentColor;
                  if (accentKey && accentColors[accentKey]) {
                    var color = accentColors[accentKey];
                    var hsl = isDark ? color.dark : color.light;
                    var parts = hsl.split(' ');
                    var h = parts[0], s = parts[1];
                    document.documentElement.style.setProperty('--primary', hsl);
                    document.documentElement.style.setProperty('--ring', hsl);
                    document.documentElement.style.setProperty('--accent-foreground', hsl);
                    document.documentElement.style.setProperty('--primary-visible', isDark ? h + ' ' + s + ' 20%' : h + ' ' + s + ' 95%');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} flex flex-col min-h-dvh overflow-x-hidden`}>
        <AccentColorProvider />
        <ServiceWorkerProvider />
        <main className="flex-1 min-h-0 flex flex-col">{children}</main>
      </body>
    </html>
  );
}

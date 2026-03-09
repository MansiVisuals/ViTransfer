import ShareLocaleProvider from '@/components/ShareLocaleProvider'

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ShareLocaleProvider>
      {children}
    </ShareLocaleProvider>
  )
}

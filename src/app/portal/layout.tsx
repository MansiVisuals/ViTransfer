import ShareLocaleProvider from '@/components/ShareLocaleProvider'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <ShareLocaleProvider>{children}</ShareLocaleProvider>
}

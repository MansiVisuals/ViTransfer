import { UnsubscribeClient } from './unsubscribe-client'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <UnsubscribeClient token={token || ''} />
}

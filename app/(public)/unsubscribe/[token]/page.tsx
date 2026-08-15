export const dynamic = 'force-dynamic'

import { UnsubscribeConfirm } from '@/components/storefront/UnsubscribeConfirm'

// No unsubscribeByToken call during render — a bare GET (link prefetch, mail
// scanner) must not have side effects. The actual unsubscribe only happens
// from a click inside the client confirm component below.
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <UnsubscribeConfirm token={token} />
}

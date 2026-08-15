export const dynamic = 'force-dynamic'

import { unsubscribeByToken } from '@/actions/storefront-public'

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const { ok } = await unsubscribeByToken(token)
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">{ok ? "You're unsubscribed" : 'Link not recognized'}</h1>
      <p className="mt-2 text-sm text-gray-600">
        {ok
          ? "You won't get drop reminders from this shop anymore."
          : 'This unsubscribe link is invalid or was already used.'}
      </p>
    </div>
  )
}

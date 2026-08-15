'use client'

import { useState } from 'react'
import { unsubscribeByToken } from '@/actions/storefront-public'
import { Button } from '@/components/ui/button'

// Requires an explicit click before unsubscribing (spec: a bare GET must not
// have side effects — link prefetchers and mail-client scanners follow GETs
// and would otherwise silently unsubscribe recipients who never asked to be).
export function UnsubscribeConfirm({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')
  const [ok, setOk] = useState(false)

  async function handleClick() {
    setState('working')
    const result = await unsubscribeByToken(token)
    setOk(result.ok)
    setState('done')
  }

  if (state === 'done') {
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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">Unsubscribe from drop reminders?</h1>
      <p className="mt-2 text-sm text-gray-600">
        You&apos;ll stop getting emails when this shop schedules a new drop.
      </p>
      <Button className="mt-4" onClick={handleClick} disabled={state === 'working'}>
        {state === 'working' ? 'Unsubscribing…' : 'Unsubscribe'}
      </Button>
    </div>
  )
}

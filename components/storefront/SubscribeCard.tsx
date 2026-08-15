'use client'

import { useRef, useState, useEffect } from 'react'
import { subscribeToDrops } from '@/actions/storefront-public'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SubscribeCard({ handle }: { handle: string }) {
  const mountedAt = useRef(0)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')   // honeypot — humans never see it
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mountedAt.current === 0) mountedAt.current = Date.now()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('saving')
    setError(null)
    try {
      await subscribeToDrops(
        handle,
        { email, ...(name.trim() ? { name } : {}), ...(website ? { website } : {}) },
        Date.now() - mountedAt.current,
      )
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-2xl border p-4 text-center">
        <p className="font-semibold">You&apos;re on the list 🎉</p>
        <p className="mt-1 text-sm text-gray-600">We&apos;ll email you when the next drop is scheduled.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border p-4">
      <p className="font-semibold">Don&apos;t miss the next drop</p>
      <div className="mt-3 grid gap-2">
        <Label htmlFor="subscribe-name">Name (optional)</Label>
        <Input id="subscribe-name" value={name} onChange={(e) => setName(e.target.value)} />
        <Label htmlFor="subscribe-email">Email</Label>
        <Input id="subscribe-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1} autoComplete="off" aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
        />
      </div>
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      <Button type="submit" disabled={state === 'saving'} className="mt-3 w-full">
        {state === 'saving' ? 'Saving…' : "Don't miss the next one"}
      </Button>
    </form>
  )
}

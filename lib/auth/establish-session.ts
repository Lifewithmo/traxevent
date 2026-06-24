'use client'

import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

// Exchange the current user's fresh ID token for an httpOnly server session cookie.
export async function establishSession(): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const idToken = await user.getIdToken(true)
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  if (!res.ok) throw new Error('Failed to establish session')
}

// Clear the server session cookie and sign out of Firebase client auth.
export async function endSession(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE' })
  await signOut(auth)
}

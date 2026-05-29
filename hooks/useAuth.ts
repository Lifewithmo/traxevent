'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export interface AuthState {
  user: User | null
  loading: boolean
  orgId: string | null
  orgSlug: string | null
  role: string | null
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    orgId: null,
    orgSlug: null,
    role: null,
  })

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        const result = await user.getIdTokenResult()
        setState({
          user,
          loading: false,
          orgId: (result.claims.orgId as string) ?? null,
          orgSlug: (result.claims.orgSlug as string) ?? null,
          role: (result.claims.role as string) ?? null,
        })
      } else {
        setState({ user: null, loading: false, orgId: null, orgSlug: null, role: null })
      }
    })
  }, [])

  return state
}

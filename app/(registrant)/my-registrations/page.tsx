'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getAllRegistrationsByUid, getClaimableRegistrations, claimRegistration } from '@/actions/registrations'
import { RegistrationCard } from '@/components/registrant/RegistrationCard'
import type { Family } from '@/lib/types'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function MyRegistrationsPage() {
  const { user, loading } = useAuth()
  const [registrations, setRegistrations] = useState<Family[]>([])
  const [claimable, setClaimable] = useState<Family[]>([])
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (user) {
      setFetching(true)
      getAllRegistrationsByUid(user.uid)
        .then(setRegistrations)
        .finally(() => setFetching(false))
      getClaimableRegistrations().then(setClaimable).catch(() => setClaimable([]))
    }
  }, [user])

  async function handleClaim(f: Family) {
    await claimRegistration(f.org_id, f.camp_id, f.id)
    setClaimable((prev) => prev.filter((c) => c.id !== f.id))
    setRegistrations((prev) => [f, ...prev])
  }

  if (loading || fetching) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
    )
  }

  if (!user) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 mb-4">Sign in to see your registrations.</p>
        <Link href="/login">
          <Button className="bg-[#7C3AED]">Sign in</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#4C1D95]">My registrations</h1>
        <p className="text-sm text-gray-500 mt-1">
          All camps you&apos;ve registered for, across every organization.
        </p>
      </div>

      {claimable.length > 0 && (
        <div className="rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] p-4 space-y-3">
          <div>
            <p className="font-semibold text-[#4C1D95]">We found registrations under your email</p>
            <p className="text-sm text-gray-500">Link them to your account to manage them here.</p>
          </div>
          <ul className="space-y-2">
            {claimable.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{f.camp_name} <span className="text-gray-400">· {f.org_name}</span></span>
                <Button size="sm" className="bg-[#7C3AED]" onClick={() => handleClaim(f)}>Claim</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {registrations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-base">No registrations yet.</p>
          <p className="text-sm mt-1">
            Register for a camp using the link your organization shared with you.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {registrations.map((reg) => (
            <RegistrationCard key={reg.id} family={reg} />
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-[#DDD6FE]">
        <p className="text-xs text-gray-400">
          Setting up an organization?{' '}
          <Link href="/onboarding" className="text-[#7C3AED] hover:underline">
            Create your org
          </Link>
        </p>
      </div>
    </div>
  )
}

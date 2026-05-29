'use client'

import { useState } from 'react'
import { createInvitation } from '@/actions/members'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { OrgRole } from '@/lib/types'

export function InviteMemberModal({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('staff')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() {
    setEmail('')
    setRole('staff')
    setInviteLink(null)
    setError(null)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const inv = await createInvitation(orgId, email, role)
      setInviteLink(
        `${window.location.origin}/accept-invite?token=${inv.token}`
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        setOpen(v)
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        Invite member
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
        </DialogHeader>

        {!inviteLink ? (
          <form onSubmit={handleInvite} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label htmlFor="invEmail">Email address</Label>
              <Input
                id="invEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invRole">Role</Label>
              <select
                id="invRole"
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
              >
                <option value="admin">Admin — full org access</option>
                <option value="staff">Staff — per-camp page access</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create invite link'}
            </Button>
          </form>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-gray-600">
              Share this link with your team member:
            </p>
            <code className="block bg-gray-100 rounded-md p-3 text-xs break-all select-all">
              {inviteLink}
            </code>
            <p className="text-xs text-gray-400">Expires in 7 days.</p>
            <Button className="w-full" onClick={() => { reset(); setOpen(false) }}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

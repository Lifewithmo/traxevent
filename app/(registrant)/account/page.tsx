'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getRegistrantProfile, updateRegistrantProfile } from '@/actions/registrant-auth'
import type { RegistrantProfile } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AccountPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<RegistrantProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (user) getRegistrantProfile(user.uid).then(setProfile)
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !profile) return
    setSaving(true)
    await updateRegistrantProfile(user.uid, {
      display_name: profile.display_name,
      phone: profile.phone,
      address: profile.address,
      emergency_contact: profile.emergency_contact,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function update<K extends keyof RegistrantProfile>(key: K, value: RegistrantProfile[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p))
  }

  if (!profile) return <div className="py-12 text-center text-gray-400">Loading…</div>

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <h1 className="text-2xl font-bold text-[#4C1D95]">My account</h1>

      <Card className="border-[#DDD6FE]">
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="display_name">Full name</Label>
            <Input id="display_name" value={profile.display_name} onChange={(e) => update('display_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={profile.email} disabled className="bg-gray-50" />
              <p className="text-xs text-gray-400">Contact support to change email.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={profile.phone} onChange={(e) => update('phone', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#DDD6FE]">
        <CardHeader><CardTitle className="text-base">Emergency contact</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="ec_name">Name</Label>
              <Input id="ec_name" value={profile.emergency_contact.name}
                onChange={(e) => update('emergency_contact', { ...profile.emergency_contact, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec_phone">Phone</Label>
              <Input id="ec_phone" type="tel" value={profile.emergency_contact.phone}
                onChange={(e) => update('emergency_contact', { ...profile.emergency_contact, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ec_rel">Relationship</Label>
            <Input id="ec_rel" value={profile.emergency_contact.relationship}
              onChange={(e) => update('emergency_contact', { ...profile.emergency_contact, relationship: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]" disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
      </Button>
    </form>
  )
}

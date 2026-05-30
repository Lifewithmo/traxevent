'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getRegistrantProfile, upsertSavedMember, deleteSavedMember } from '@/actions/registrant-auth'
import type { SavedFamilyMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function SavedFamilyPage() {
  const { user } = useAuth()
  const [members, setMembers] = useState<SavedFamilyMember[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newYear, setNewYear] = useState('')

  useEffect(() => {
    if (user) getRegistrantProfile(user.uid).then((p) => p && setMembers(p.saved_members))
  }, [user])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !newName.trim()) return
    const member = await upsertSavedMember(user.uid, {
      first_name: newName,
      last_name: newLast,
      birth_year: parseInt(newYear) || 0,
      gender: '',
    })
    setMembers((prev) => [...prev, member])
    setNewName(''); setNewLast(''); setNewYear(''); setAdding(false)
  }

  async function handleDelete(memberId: string) {
    if (!user) return
    await deleteSavedMember(user.uid, memberId)
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#4C1D95]">Saved family members</h1>
        <Button
          variant="outline"
          className="border-[#7C3AED] text-[#7C3AED]"
          onClick={() => setAdding(true)}
        >
          + Add member
        </Button>
      </div>
      <p className="text-sm text-gray-500">
        Saved members are pre-filled when you register for another camp.
      </p>

      {members.length === 0 && !adding && (
        <p className="text-sm text-gray-400 text-center py-8">No saved family members yet.</p>
      )}

      <div className="space-y-3">
        {members.map((m) => (
          <Card key={m.id} className="border-[#DDD6FE]">
            <CardContent className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">{m.first_name} {m.last_name}</p>
                {m.birth_year > 0 && <p className="text-xs text-gray-400">b. {m.birth_year}</p>}
              </div>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-red-600"
                onClick={() => handleDelete(m.id)}>
                Remove
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {adding && (
        <Card className="border-[#7C3AED]">
          <CardContent className="pt-4">
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new_fn">First name</Label>
                  <Input id="new_fn" value={newName} onChange={(e) => setNewName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new_ln">Last name</Label>
                  <Input id="new_ln" value={newLast} onChange={(e) => setNewLast(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="new_yr">Birth year</Label>
                <Input id="new_yr" type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} min={1920} max={2030} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9]">Save</Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { submitIntake } from '@/actions/intake-public'

interface IntakeFormProps {
  token: string
  orgName: string
}

export function IntakeForm({ token, orgName }: IntakeFormProps) {
  const [mountedAt] = useState(() => Date.now())
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) return
    setSending(true)
    setError(null)
    try {
      const parsedGuests = guestCount.trim() === '' ? undefined : Number(guestCount)
      await submitIntake(
        token,
        {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          event_type: eventType.trim() || undefined,
          event_date: eventDate.trim() || undefined,
          message: message.trim() || undefined,
          website,
          ...(parsedGuests != null && !Number.isNaN(parsedGuests)
            ? { guest_count: parsedGuests }
            : {}),
        },
        Date.now() - mountedAt
      )
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-2">
          <p className="text-lg font-medium">Thanks — your inquiry is in.</p>
          <p className="text-sm text-muted-foreground">{orgName} will get back to you soon.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div aria-live="polite" aria-atomic="true">
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeName">Your name</Label>
          <Input id="intakeName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeEmail">Email</Label>
          <Input id="intakeEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakePhone">Phone</Label>
          <Input id="intakePhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeEventType">Event type</Label>
          <Input id="intakeEventType" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g. Wedding" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeEventDate">Event date</Label>
          <Input id="intakeEventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeGuestCount">Guest count</Label>
          <Input id="intakeGuestCount" type="number" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="intakeMessage">Message</Label>
          <textarea
            id="intakeMessage"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us about your event"
            className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div aria-hidden="true" className="sr-only">
          <label htmlFor="intakeWebsite">Website</label>
          <input
            id="intakeWebsite"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={sending || !name.trim() || !email.trim()}
        >
          {sending ? 'Sending…' : 'Send inquiry'}
        </Button>
      </CardContent>
    </Card>
  )
}

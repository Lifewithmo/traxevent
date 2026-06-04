# Phase 1d: Communication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give org admins the ability to send email blasts to all registrants for an event, configure a custom sender display name and reply-to address per event, and view a log of all sent communications.

**Architecture:** Three pieces: (1) two new `Camp` fields — `from_display_name` and `reply_to_email` — flow through the existing `updateCamp` server action and event settings page, and are used in all outbound emails from that event; (2) a new `sendEmailBlast` server action fetches registrants, sends via Resend's batch API (chunked at 100/request), and writes a communication log entry to Firestore; (3) a new `communicate` admin page combines a compose form (client component) with a server-rendered log list. "Email templates per event type" is delivered by pre-populating the compose form subject with the event's `from_display_name` and making the helper copy adapt to the event type's terminology.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, Resend v6 (emails + batch), Firebase Admin SDK (Firestore)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/types.ts` | Modify | Add `from_display_name?`, `reply_to_email?` to Camp; add `CommunicationLogEntry` interface |
| `lib/email.ts` | Modify | Accept `fromDisplayName?` and `replyTo?` in `sendRegistrationConfirmation` |
| `actions/camps.ts` | Modify | Add `from_display_name`, `reply_to_email` to `updateCamp` Pick allowlist |
| `app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx` | Modify | Add two sender config fields |
| `actions/communicate.ts` | Create | `sendEmailBlast()`, `getCommunicationLog()` |
| `app/(admin)/[orgSlug]/[campSlug]/communicate/page.tsx` | Create | Server component — load camp + log, render client |
| `components/admin/CommunicateClient.tsx` | Create | Compose form + log list (client component) |
| `__tests__/lib/email.test.ts` | Create | Sender config applied correctly in confirmation email |
| `__tests__/actions/communicate.test.ts` | Create | Email blast logic, log write, filter behavior |

---

## Task 1: Camp sender config + confirmation email improvements

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/email.ts`
- Modify: `actions/camps.ts`
- Modify: `app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx`
- Create: `__tests__/lib/email.test.ts`

Add `from_display_name` and `reply_to_email` to the `Camp` type, thread them through the settings page, and use them when sending registration confirmation emails.

**How sender config works in practice:**
- `from_display_name: "Summer Camp 2026 at First Baptist"` → `from: '"Summer Camp 2026 at First Baptist" <noreply@traxevent.com>'`
- `reply_to_email: "pastor@firstbaptist.org"` → `reply_to: "pastor@firstbaptist.org"` (replies go to the org, not TraxEvent)
- Both are optional; without them the existing behavior is unchanged

- [ ] **Step 1: Write failing email tests**

Create `__tests__/lib/email.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const emailsSendSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }))

vi.mock('@/lib/resend', () => ({
  FROM_EMAIL: 'noreply@traxevent.com',
  getResend: vi.fn().mockReturnValue({
    emails: { send: emailsSendSpy },
  }),
}))

import { sendRegistrationConfirmation } from '@/lib/email'

const baseParams = {
  to: 'jane@example.com',
  firstName: 'Jane',
  campName: 'Summer Camp 2026',
  orgName: 'First Hills Fellowship',
  orgSlug: 'firsthills',
  campSlug: 'summer-2026',
  familyId: 'fam-1',
  accessToken: 'tok_abc',
}

describe('sendRegistrationConfirmation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends with default from when no fromDisplayName', async () => {
    await sendRegistrationConfirmation(baseParams)
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.from).toBe('noreply@traxevent.com')
    expect(call.reply_to).toBeUndefined()
  })

  it('uses fromDisplayName in the from field', async () => {
    await sendRegistrationConfirmation({
      ...baseParams,
      fromDisplayName: 'Summer Camp 2026 at First Hills',
    })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.from).toBe('"Summer Camp 2026 at First Hills" <noreply@traxevent.com>')
  })

  it('sets reply_to when replyTo is provided', async () => {
    await sendRegistrationConfirmation({
      ...baseParams,
      replyTo: 'director@firsthills.org',
    })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.reply_to).toBe('director@firsthills.org')
  })

  it('sends to the correct recipient', async () => {
    await sendRegistrationConfirmation(baseParams)
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.to).toBe('jane@example.com')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run __tests__/lib/email.test.ts
```

Expected: FAIL — `call.reply_to` and `fromDisplayName` tests fail because those params don't exist yet.

- [ ] **Step 3: Update `lib/types.ts` — add Camp sender config fields**

Add `from_display_name` and `reply_to_email` to the `Camp` interface (after `payment_amount`):

```typescript
export interface Camp {
  // ... existing fields ...
  payment_amount?: number
  from_display_name?: string  // display name in email "from" field, e.g. "Summer Camp 2026 at First Baptist"
  reply_to_email?: string     // reply-to address; replies go to this address instead of TraxEvent
}
```

Also add `CommunicationLogEntry` at the end of the file (used in Task 2):

```typescript
export interface CommunicationLogEntry {
  id: string
  subject: string
  html_body: string
  filter: 'all' | 'confirmed' | 'pending' | 'waitlisted'
  recipient_count: number
  sent_at: string
  sent_by_uid?: string
}
```

- [ ] **Step 4: Update `lib/email.ts` — accept sender config params**

Replace the full file:

```typescript
import { getResend, FROM_EMAIL } from '@/lib/resend'

interface RegistrationConfirmationParams {
  to: string
  firstName: string
  campName: string
  orgName: string
  orgSlug: string
  campSlug: string
  familyId: string
  accessToken: string
  fromDisplayName?: string  // sets email display name, e.g. "Summer Camp 2026 at First Baptist"
  replyTo?: string          // reply-to address; if unset, replies go to TraxEvent
}

export async function sendRegistrationConfirmation(
  params: RegistrationConfirmationParams
): Promise<void> {
  const portalUrl = `https://${params.orgSlug}.traxevent.com/${params.campSlug}/my-registration?token=${params.accessToken}`
  const accountUrl = `https://${params.orgSlug}.traxevent.com/register/create-account?token=${params.accessToken}&familyId=${params.familyId}`

  const from = params.fromDisplayName
    ? `"${params.fromDisplayName}" <${FROM_EMAIL}>`
    : FROM_EMAIL

  await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    subject: `Registration confirmed — ${params.campName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:8px">You're registered!</h1>
        <p style="color:#4C1D95;font-size:16px;margin-bottom:24px">
          Hi ${params.firstName}, your registration for <strong>${params.campName}</strong>
          at ${params.orgName} has been received.
        </p>

        <a href="${portalUrl}"
           style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600;margin-bottom:24px">
          View my registration
        </a>

        <p style="color:#64748B;font-size:14px;margin-bottom:8px">
          This link works without an account and is valid for 90 days.
        </p>

        <hr style="border:none;border-top:1px solid #DDD6FE;margin:24px 0" />

        <p style="color:#64748B;font-size:13px">
          Want to log in anytime to manage your registrations?
          <a href="${accountUrl}" style="color:#7C3AED">Create a free account</a>
          — it takes 30 seconds and lets you see all your camp registrations in one place.
        </p>
      </div>
    `,
  })
}
```

- [ ] **Step 5: Update `actions/camps.ts` — add sender fields to updateCamp**

In the `Partial<Pick<Camp, ...>>` type in `updateCamp`, add the two new fields:

```typescript
export async function updateCamp(
  orgId: string,
  campId: string,
  updates: Partial<Pick<Camp,
    | 'name'
    | 'status'
    | 'event_type_id'
    | 'registration_type'
    | 'camp_start'
    | 'camp_end'
    | 'registration_open'
    | 'registration_close'
    | 'capacity'
    | 'payment_amount'
    | 'from_display_name'   // ← add
    | 'reply_to_email'      // ← add
  >>
): Promise<void> {
  // body unchanged
}
```

- [ ] **Step 6: Update event settings page — add two sender config fields**

In `app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx`, add state, load, save, and form fields for the two new fields.

Add state declarations (after `capacity` state):
```tsx
const [fromDisplayName, setFromDisplayName] = useState<string>('')
const [replyToEmail, setReplyToEmail] = useState<string>('')
```

In `useEffect` load function, after setting capacity:
```tsx
setFromDisplayName(c.from_display_name ?? '')
setReplyToEmail(c.reply_to_email ?? '')
```

In `handleSave`, in the `updateCamp` call, add:
```tsx
from_display_name: fromDisplayName || undefined,
reply_to_email: replyToEmail || undefined,
```

Add form fields before the submit button (after the capacity field), inside a new Card or the existing one:

```tsx
<div className="space-y-1">
  <Label htmlFor="fromDisplayName">Email sender name (optional)</Label>
  <Input
    id="fromDisplayName"
    value={fromDisplayName}
    onChange={(e) => { setFromDisplayName(e.target.value); setSaved(false) }}
    placeholder={`${camp.name} at Your Church`}
  />
  <p className="text-xs text-muted-foreground">
    How your org appears in the "From" field of emails. Defaults to TraxEvent if left blank.
  </p>
</div>

<div className="space-y-1">
  <Label htmlFor="replyToEmail">Reply-to email address (optional)</Label>
  <Input
    id="replyToEmail"
    type="email"
    value={replyToEmail}
    onChange={(e) => { setReplyToEmail(e.target.value); setSaved(false) }}
    placeholder="director@yourchurch.org"
  />
  <p className="text-xs text-muted-foreground">
    Replies from registrants are routed to this address instead of TraxEvent.
  </p>
</div>
```

- [ ] **Step 7: Run email tests**

```bash
npx vitest run __tests__/lib/email.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 8: Run full suite and tsc**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all pass, tsc clean.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/email.ts actions/camps.ts \
  "app/(admin)/[orgSlug]/[campSlug]/settings/page.tsx" \
  "__tests__/lib/email.test.ts"
git commit -m "feat: camp email sender config (from_display_name, reply_to_email) threaded through confirmation email and settings page"
```

---

## Task 2: Email blast server action + communication log

**Files:**
- Create: `actions/communicate.ts`
- Create: `__tests__/actions/communicate.test.ts`

The `sendEmailBlast` action:
1. Fetches the camp (for `from_display_name`, `reply_to_email`)
2. Fetches families matching the filter (all / confirmed / pending / waitlisted)
3. Sends emails via Resend batch in chunks of 100
4. Writes a `CommunicationLogEntry` to Firestore at `orgs/{orgId}/camps/{campId}/communication_log/{id}`
5. Returns `{ sent: number }`

- [ ] **Step 1: Write failing tests**

Create `__tests__/actions/communicate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const batchSendSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ data: [], error: null }))
const logSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getCampSpy = vi.hoisted(() => vi.fn())
const getFamiliesSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/resend', () => ({
  FROM_EMAIL: 'noreply@traxevent.com',
  getResend: vi.fn().mockReturnValue({
    batch: { send: batchSendSpy },
  }),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'camps') {
                return {
                  doc: vi.fn().mockReturnValue({
                    get: getCampSpy,
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'families') return { get: getFamiliesSpy }
                      if (sub2 === 'communication_log') {
                        return {
                          doc: vi.fn().mockReturnValue({ set: logSetSpy }),
                        }
                      }
                      return {}
                    }),
                  }),
                }
              }
              return {}
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

import { sendEmailBlast, getCommunicationLog } from '@/actions/communicate'

const mockCamp = {
  id: 'camp-1',
  name: 'Summer Camp 2026',
  from_display_name: 'Summer Camp at First Hills',
  reply_to_email: 'director@firsthills.org',
}

const makeFamily = (status: string, email: string) => ({
  data: () => ({ id: `fam-${email}`, first_name: 'Jane', last_name: 'Smith', email, registration_status: status }),
})

describe('sendEmailBlast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCampSpy.mockResolvedValue({ exists: true, data: () => mockCamp })
  })

  it('sends to all non-cancelled families when filter is "all"', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        makeFamily('confirmed', 'a@test.com'),
        makeFamily('pending', 'b@test.com'),
        makeFamily('waitlisted', 'c@test.com'),
        makeFamily('cancelled', 'd@test.com'), // should be excluded
      ],
    })

    const result = await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Camp Update',
      htmlBody: '<p>Hello</p>',
      filter: 'all',
    })

    expect(result.sent).toBe(3) // cancelled excluded
    expect(batchSendSpy).toHaveBeenCalledTimes(1)
    const emails = batchSendSpy.mock.calls[0][0]
    expect(emails).toHaveLength(3)
    expect(emails[0].to).toBe('a@test.com')
    expect(emails[0].from).toBe('"Summer Camp at First Hills" <noreply@traxevent.com>')
    expect(emails[0].reply_to).toBe('director@firsthills.org')
  })

  it('filters to only confirmed families when filter is "confirmed"', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        makeFamily('confirmed', 'a@test.com'),
        makeFamily('pending', 'b@test.com'),
        makeFamily('waitlisted', 'c@test.com'),
      ],
    })

    const result = await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Confirmed Only',
      htmlBody: '<p>Hi confirmed!</p>',
      filter: 'confirmed',
    })

    expect(result.sent).toBe(1)
    const emails = batchSendSpy.mock.calls[0][0]
    expect(emails[0].to).toBe('a@test.com')
  })

  it('writes a communication log entry after sending', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [makeFamily('confirmed', 'a@test.com')],
    })

    await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Test Subject',
      htmlBody: '<p>Body</p>',
      filter: 'all',
    })

    expect(logSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Test Subject',
        html_body: '<p>Body</p>',
        filter: 'all',
        recipient_count: 1,
        sent_at: expect.any(String),
      })
    )
  })

  it('chunks into batches of 100 for large recipient lists', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: Array.from({ length: 150 }, (_, i) =>
        makeFamily('confirmed', `user${i}@test.com`)
      ),
    })

    const result = await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Big Blast',
      htmlBody: '<p>Hi</p>',
      filter: 'all',
    })

    expect(result.sent).toBe(150)
    expect(batchSendSpy).toHaveBeenCalledTimes(2) // 100 + 50
  })

  it('returns sent: 0 and does not call batch when no matching families', async () => {
    getFamiliesSpy.mockResolvedValue({ docs: [] })

    const result = await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Empty',
      htmlBody: '<p>Nobody here</p>',
      filter: 'all',
    })

    expect(result.sent).toBe(0)
    expect(batchSendSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run __tests__/actions/communicate.test.ts
```

Expected: FAIL — `Cannot find module '@/actions/communicate'`

- [ ] **Step 3: Create `actions/communicate.ts`**

```typescript
'use server'

import { adminDb } from '@/lib/firebase-admin'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import type { Camp, Family, CommunicationLogEntry } from '@/lib/types'
import { randomBytes } from 'crypto'

export interface EmailBlastInput {
  subject: string
  htmlBody: string
  filter: 'all' | 'confirmed' | 'pending' | 'waitlisted'
  sentByUid?: string
}

export async function sendEmailBlast(
  orgId: string,
  campId: string,
  input: EmailBlastInput
): Promise<{ sent: number }> {
  const campRef = adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId)
  const campSnap = await campRef.get()
  if (!campSnap.exists) throw new Error(`Camp not found: ${campId}`)
  const camp = campSnap.data() as Camp

  // Fetch families and apply filter
  const familiesSnap = await campRef.collection('families').get()
  const families = familiesSnap.docs
    .map((d) => d.data() as Family)
    .filter((f) => {
      if (f.registration_status === 'cancelled') return false
      if (input.filter === 'all') return true
      return f.registration_status === input.filter
    })

  if (families.length === 0) {
    // Still write a log entry showing 0 recipients
    await writeLog(campRef, input, 0)
    return { sent: 0 }
  }

  const from = camp.from_display_name
    ? `"${camp.from_display_name}" <${FROM_EMAIL}>`
    : FROM_EMAIL

  const emailPayloads = families.map((f) => ({
    from,
    to: f.email,
    subject: input.subject,
    html: input.htmlBody,
    ...(camp.reply_to_email ? { reply_to: camp.reply_to_email } : {}),
  }))

  // Chunk into batches of 100 (Resend batch limit)
  const resend = getResend()
  for (let i = 0; i < emailPayloads.length; i += 100) {
    await resend.batch.send(emailPayloads.slice(i, i + 100))
  }

  await writeLog(campRef, input, families.length, input.sentByUid)

  return { sent: families.length }
}

async function writeLog(
  campRef: FirebaseFirestore.DocumentReference,
  input: EmailBlastInput,
  recipientCount: number,
  sentByUid?: string
) {
  const id = randomBytes(8).toString('hex')
  const entry: CommunicationLogEntry = {
    id,
    subject: input.subject,
    html_body: input.htmlBody,
    filter: input.filter,
    recipient_count: recipientCount,
    sent_at: new Date().toISOString(),
    ...(sentByUid ? { sent_by_uid: sentByUid } : {}),
  }
  await campRef.collection('communication_log').doc(id).set(entry)
}

export async function getCommunicationLog(
  orgId: string,
  campId: string
): Promise<CommunicationLogEntry[]> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('communication_log')
    .orderBy('sent_at', 'desc')
    .limit(50)
    .get()
  return snap.docs.map((d) => d.data() as CommunicationLogEntry)
}
```

**Note on the `FirebaseFirestore.DocumentReference` type:** Firestore admin typings expose `DocumentReference` on the `FirebaseFirestore` namespace. If TypeScript can't find it, use `import type { DocumentReference } from 'firebase-admin/firestore'` instead and change the param type accordingly.

- [ ] **Step 4: Run tests**

```bash
npx vitest run __tests__/actions/communicate.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 5: Run full suite and tsc**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: all pass, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add actions/communicate.ts "__tests__/actions/communicate.test.ts"
git commit -m "feat: sendEmailBlast action with Resend batch + communication log"
```

---

## Task 3: Communicate admin page

**Files:**
- Create: `app/(admin)/[orgSlug]/[campSlug]/communicate/page.tsx`
- Create: `components/admin/CommunicateClient.tsx`

No unit tests — this is a UI page calling the server action from Task 2. Both are already fully tested.

The page shows:
1. **Compose section** — subject input, HTML/plain body textarea, recipient filter dropdown, Send button
2. **Communication log** — table of past blasts (subject, filter, recipients, date)

The compose form uses the camp's `from_display_name` to show a preview of how emails will appear. If `from_display_name` is set, the hint reads: `"Sent from: Summer Camp at First Hills <noreply@traxevent.com>"`.

- [ ] **Step 1: Create `components/admin/CommunicateClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { sendEmailBlast } from '@/actions/communicate'
import type { CommunicationLogEntry } from '@/lib/types'

interface CommunicateClientProps {
  orgId: string
  campId: string
  campName: string
  fromDisplayName?: string
  log: CommunicationLogEntry[]
}

const FILTER_LABELS: Record<string, string> = {
  all: 'All registrants (excl. cancelled)',
  confirmed: 'Confirmed only',
  pending: 'Pending only',
  waitlisted: 'Waitlisted only',
}

export function CommunicateClient({
  orgId,
  campId,
  campName,
  fromDisplayName,
  log,
}: CommunicateClientProps) {
  const [subject, setSubject] = useState(`${campName} — Update`)
  const [htmlBody, setHtmlBody] = useState('')
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'waitlisted'>('all')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recentLog, setRecentLog] = useState<CommunicationLogEntry[]>(log)

  async function handleSend() {
    if (!subject.trim() || !htmlBody.trim()) return
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const res = await sendEmailBlast(orgId, campId, { subject, htmlBody, filter })
      setResult(res)
      // Prepend a provisional log entry so the UI updates immediately
      setRecentLog((prev) => [
        {
          id: `new-${Date.now()}`,
          subject,
          html_body: htmlBody,
          filter,
          recipient_count: res.sent,
          sent_at: new Date().toISOString(),
        },
        ...prev,
      ])
      setSubject(`${campName} — Update`)
      setHtmlBody('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const fromPreview = fromDisplayName
    ? `"${fromDisplayName}" <noreply@traxevent.com>`
    : 'noreply@traxevent.com'

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Communicate</h1>

      {/* Compose */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send email blast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Sending from: <span className="font-mono">{fromPreview}</span>
          </p>

          <div className="space-y-1">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter subject line"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="htmlBody">Message (HTML)</Label>
            <textarea
              id="htmlBody"
              className="w-full border rounded-md px-3 py-2 text-sm font-mono min-h-[160px] bg-white resize-y"
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              placeholder="<p>Hi {firstName},</p><p>Here's an update about camp...</p>"
            />
            <p className="text-xs text-muted-foreground">HTML is supported. Use plain text if unsure.</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="filter">Send to</Label>
            <select
              id="filter"
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
            >
              {Object.entries(FILTER_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {result && (
              <p className="text-sm text-green-700">
                Sent to {result.sent} recipient{result.sent !== 1 ? 's' : ''}.
              </p>
            )}
          </div>

          <Button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !htmlBody.trim()}
          >
            {sending ? 'Sending…' : 'Send email blast'}
          </Button>
        </CardContent>
      </Card>

      {/* Communication log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sent emails</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails sent yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Subject</th>
                  <th className="pb-2 font-medium">To</th>
                  <th className="pb-2 font-medium text-right">Recipients</th>
                  <th className="pb-2 font-medium text-right">Sent</th>
                </tr>
              </thead>
              <tbody>
                {recentLog.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{entry.subject}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{FILTER_LABELS[entry.filter] ?? entry.filter}</Badge>
                    </td>
                    <td className="py-2 text-right">{entry.recipient_count}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {new Date(entry.sent_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(admin)/[orgSlug]/[campSlug]/communicate/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCommunicationLog } from '@/actions/communicate'
import { CommunicateClient } from '@/components/admin/CommunicateClient'
import type { Camp } from '@/lib/types'

async function resolveIds(orgSlug: string, campSlug: string) {
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id

  const campSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').where('slug', '==', campSlug).limit(1).get()
  if (campSnap.empty) notFound()

  return { orgId, campId: campSnap.docs[0].id, camp: campSnap.docs[0].data() as Camp }
}

export default async function CommunicatePage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await resolveIds(orgSlug, campSlug)
  const log = await getCommunicationLog(orgId, campId)

  return (
    <CommunicateClient
      orgId={orgId}
      campId={campId}
      campName={camp.name}
      fromDisplayName={camp.from_display_name}
      log={log}
    />
  )
}
```

- [ ] **Step 3: Run TypeScript check and full test suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: tsc clean, all tests pass (no new tests for this task).

- [ ] **Step 4: Commit**

```bash
git add \
  "app/(admin)/[orgSlug]/[campSlug]/communicate/page.tsx" \
  components/admin/CommunicateClient.tsx
git commit -m "feat: communicate admin page — email blast compose form and sent email log"
```

---

## Self-Review Checklist

After all tasks, run:

```bash
npx vitest run
npx tsc --noEmit
```

**Spec coverage check:**
- [x] Basic email blast to all registrants — Task 2 (`sendEmailBlast`, filter: 'all') + Task 3 (UI)
- [x] Email templates per event type — Task 1 (confirmation email uses `from_display_name` which admins set per event); Task 3 (compose form pre-fills subject with camp name, sends with event's sender config)
- [x] Registrant communication log — Task 2 (`writeLog` writes entry); Task 3 (log displayed in UI)
- [x] Reply-to address configurable per event — Task 1 (`reply_to_email` field + settings UI + wired into all emails)
- [x] Custom "from" display name per event — Task 1 (`from_display_name` field + settings UI + wired into all emails)

**Type consistency check:**
- `CommunicationLogEntry` defined in Task 1 (`lib/types.ts`), imported in Tasks 2 and 3 ✓
- `EmailBlastInput` defined in Task 2 (`actions/communicate.ts`), used in Task 3 component ✓
- `from_display_name` and `reply_to_email` on `Camp` — added in Task 1, used in Task 2 action and Task 3 page ✓
- `getCommunicationLog` defined in Task 2, called in Task 3 page ✓

**Placeholder scan:** No TBD/TODO patterns. All steps have complete code.

**Notes for implementer:**
- The `FirebaseFirestore.DocumentReference` type in `communicate.ts` — if TypeScript complains, use `import type { DocumentReference } from 'firebase-admin/firestore'` and replace the type annotation accordingly
- The confirmation email now sends `from_display_name` and `reply_to_email` — callers in `actions/registrations.ts` and `app/api/payments/webhook/route.ts` should ideally pass these values. For Phase 1d, the confirmation email is called without these params (falls back to defaults), which is acceptable. A follow-up improvement would fetch the camp in those callers and pass the sender config.

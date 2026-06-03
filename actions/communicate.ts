'use server'

import { adminDb } from '@/lib/firebase-admin'
import { getResend, FROM_EMAIL } from '@/lib/resend'
import type { Camp, Family, CommunicationLogEntry } from '@/lib/types'
import type { DocumentReference } from 'firebase-admin/firestore'
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
  const campRef = adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)

  const campSnap = await campRef.get()
  if (!campSnap.exists) throw new Error(`Camp not found: ${campId}`)
  const camp = campSnap.data() as Camp

  const familiesSnap = await campRef.collection('families').get()
  const families = familiesSnap.docs
    .map((d) => d.data() as Family)
    .filter((f) => {
      if (f.registration_status === 'cancelled') return false
      if (input.filter === 'all') return true
      return f.registration_status === input.filter
    })

  if (families.length === 0) {
    await writeLog(campRef as unknown as DocumentReference, input, 0)
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
    ...(camp.reply_to_email ? { replyTo: camp.reply_to_email } : {}),
  }))

  // Before sending, write the log (records the attempt even if delivery partially fails):
  await writeLog(campRef as unknown as DocumentReference, input, families.length, input.sentByUid)

  const resend = getResend()
  for (let i = 0; i < emailPayloads.length; i += 100) {
    await resend.batch.send(emailPayloads.slice(i, i + 100))
  }

  return { sent: families.length }
}

async function writeLog(
  campRef: DocumentReference,
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

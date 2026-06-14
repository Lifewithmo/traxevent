'use server'

import { adminDb } from '@/lib/firebase-admin'
import { getResend, buildFromAddress, deriveLocalPart, resolveSenderEmail } from '@/lib/resend'
import { getVerifiedSendingDomain } from '@/actions/domains'
import type { Camp, Family, CommunicationLogEntry, OrgMember } from '@/lib/types'
import { randomBytes } from 'crypto'

export interface EmailBlastInput {
  subject: string
  htmlBody: string
  filter: 'all' | 'confirmed' | 'pending' | 'waitlisted'
  sentByUid?: string  // when set, the blast is sent AS this org member (on the verified domain)
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
    const logId = randomBytes(8).toString('hex')
    await campRef.collection('communication_log').doc(logId).set({
      id: logId,
      subject: input.subject,
      html_body: input.htmlBody,
      filter: input.filter,
      recipient_count: 0,
      sent_at: new Date().toISOString(),
      ...(input.sentByUid ? { sent_by_uid: input.sentByUid } : {}),
    } satisfies CommunicationLogEntry)
    return { sent: 0 }
  }

  const sendingDomain = await getVerifiedSendingDomain(orgId)
  // Default: the camp identity. If the blast is sent as a specific org member AND the
  // org has a verified domain, reconstruct the sender address authoritatively from the
  // member record — never trust a client-supplied address.
  let from = buildFromAddress({ displayName: camp.from_display_name, domain: sendingDomain })
  if (input.sentByUid && sendingDomain) {
    const memberSnap = await adminDb
      .collection('orgs').doc(orgId)
      .collection('members').doc(input.sentByUid)
      .get()
    const member = memberSnap.exists ? (memberSnap.data() as OrgMember) : null
    const senderEmail = member
      ? resolveSenderEmail({ verifiedDomain: sendingDomain, localPart: deriveLocalPart(member.email) })
      : undefined
    if (member && senderEmail) {
      from = buildFromAddress({ displayName: member.display_name, senderEmail })
    }
  }

  const emailPayloads = families.map((f) => ({
    from,
    to: f.email,
    subject: input.subject,
    html: input.htmlBody,
    ...(camp.reply_to_email ? { replyTo: camp.reply_to_email } : {}),
  }))

  // Before sending, write the log (records the attempt even if delivery partially fails):
  const logId = randomBytes(8).toString('hex')
  const entry: CommunicationLogEntry = {
    id: logId,
    subject: input.subject,
    html_body: input.htmlBody,
    filter: input.filter,
    recipient_count: families.length,
    sent_at: new Date().toISOString(),
    ...(input.sentByUid ? { sent_by_uid: input.sentByUid } : {}),
  }
  await campRef.collection('communication_log').doc(logId).set(entry)

  const resend = getResend()
  for (let i = 0; i < emailPayloads.length; i += 100) {
    await resend.batch.send(emailPayloads.slice(i, i + 100))
  }

  return { sent: families.length }
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

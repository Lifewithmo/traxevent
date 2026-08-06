'use server'

import { assertEventPage } from '@/lib/auth/assert'
import { adminBucket } from '@/lib/firebase-admin'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * Upload a checklist evidence photo; returns a stable public URL for
 * OpsChecklistStep.evidence_value. Public-by-obscure-URL is the documented
 * MVP tradeoff (see phase-3 plan Task 9).
 */
export async function uploadEvidencePhoto(
  orgId: string,
  eventId: string,
  formData: FormData,
): Promise<{ url: string }> {
  await assertEventPage(orgId, eventId, 'ops')

  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('No file provided')
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are allowed')
  if (file.size > MAX_BYTES) throw new Error('Photo must be under 8MB')

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `ops-evidence/${orgId}/${eventId}/${Date.now()}-${safeName}`
  const blob = adminBucket.file(path)
  await blob.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
  })
  await blob.makePublic()
  return { url: blob.publicUrl() }
}

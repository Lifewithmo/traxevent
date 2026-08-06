'use server'

import { assertOrgAdmin } from '@/lib/auth/assert'
import { adminBucket } from '@/lib/firebase-admin'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * Upload a proposal document image and return a stable public URL.
 *
 * Unlike ops evidence photos (where public-by-obscure-URL is a documented
 * tradeoff), proposal images are intended to be visible to anyone holding the
 * proposal link, so makePublic() is the correct behavior rather than a
 * compromise.
 */
export async function uploadProposalImage(
  orgId: string,
  proposalId: string,
  formData: FormData,
): Promise<{ url: string }> {
  await assertOrgAdmin(orgId)

  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('No file provided')
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are allowed')
  if (file.size > MAX_BYTES) throw new Error('Image must be under 8MB')

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `proposal-images/${orgId}/${proposalId}/${Date.now()}-${safeName}`
  const blob = adminBucket.file(path)
  await blob.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
  })
  await blob.makePublic()
  return { url: blob.publicUrl() }
}

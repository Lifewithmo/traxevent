'use server'

import { randomUUID } from 'crypto'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { adminBucket } from '@/lib/firebase-admin'
import { assertImageUpload, safeUploadName, tokenizedDownloadUrl } from '@/lib/uploads'

/**
 * Upload a proposal document image and return a stable download URL.
 *
 * Proposal images are intended to be visible to anyone holding the proposal
 * link, so a Firebase download token in the URL is the correct access model —
 * same unguessable-link trust as the proposal token. (Per-object ACLs are
 * forbidden by org policy on the prod bucket; see tokenizedDownloadUrl.)
 */
export async function uploadProposalImage(
  orgId: string,
  proposalId: string,
  formData: FormData,
): Promise<{ url: string }> {
  await assertOrgAdmin(orgId)

  const file = assertImageUpload(formData.get('file'))
  const path = `proposal-images/${orgId}/${proposalId}/${Date.now()}-${safeUploadName(file.name)}`
  const token = randomUUID()
  const blob = adminBucket.file(path)
  await blob.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  return { url: tokenizedDownloadUrl(adminBucket.name, path, token) }
}

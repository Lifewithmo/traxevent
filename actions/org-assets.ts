'use server'

import { assertOrgAdmin } from '@/lib/auth/assert'
import { adminBucket } from '@/lib/firebase-admin'
import { assertImageUpload, safeUploadName } from '@/lib/uploads'

const ASSET_KINDS = ['logo', 'cover']

/**
 * Upload an org brand asset (logo / cover) and return a stable public URL.
 * Same caps and public-visibility rationale as uploadProposalImage — brand
 * assets render on public proposal pages — but org-scoped, not
 * proposal-scoped (spec §2).
 */
export async function uploadOrgAsset(
  orgId: string,
  kind: 'logo' | 'cover',
  formData: FormData,
): Promise<{ url: string }> {
  await assertOrgAdmin(orgId)
  if (!ASSET_KINDS.includes(kind)) throw new Error('Unknown asset kind')

  const file = assertImageUpload(formData.get('file'))
  const path = `org-assets/${orgId}/${kind}/${Date.now()}-${safeUploadName(file.name)}`
  const blob = adminBucket.file(path)
  await blob.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
  })
  await blob.makePublic()
  return { url: blob.publicUrl() }
}

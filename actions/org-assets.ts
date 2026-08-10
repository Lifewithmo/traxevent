'use server'

import { randomUUID } from 'crypto'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { adminBucket } from '@/lib/firebase-admin'
import { assertImageUpload, safeUploadName, tokenizedDownloadUrl } from '@/lib/uploads'

const ASSET_KINDS = ['logo', 'cover', 'profile_photo', 'link_image']

/**
 * Upload an org asset — brand asset (logo / cover) or public-profile asset
 * (profile photo / link thumbnail) — and return a stable download URL.
 * Same caps and access model as uploadProposalImage (token-in-URL) — these
 * render on public pages (proposals, or the public-profile page) — but
 * org-scoped, not proposal-scoped (spec §2).
 */
export async function uploadOrgAsset(
  orgId: string,
  kind: 'logo' | 'cover' | 'profile_photo' | 'link_image',
  formData: FormData,
): Promise<{ url: string }> {
  await assertOrgAdmin(orgId)
  if (!ASSET_KINDS.includes(kind)) throw new Error('Unknown asset kind')

  const file = assertImageUpload(formData.get('file'))
  const path = `org-assets/${orgId}/${kind}/${Date.now()}-${safeUploadName(file.name)}`
  const token = randomUUID()
  const blob = adminBucket.file(path)
  await blob.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  return { url: tokenizedDownloadUrl(adminBucket.name, path, token) }
}

'use server'

import { randomUUID } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { adminBucket } from '@/lib/firebase-admin'
import { assertImageUpload, safeUploadName, tokenizedDownloadUrl } from '@/lib/uploads'
import {
  listProductsCore, createProductCore, updateProductCore,
  type CreateProductInput, type ProductUpdate,
} from '@/lib/storefront/products'
import type { Product } from '@/lib/types'

export async function listProducts(orgId: string): Promise<Product[]> {
  await assertOrgMember(orgId)
  return listProductsCore(orgId)
}

export async function createProduct(orgId: string, input: CreateProductInput): Promise<Product> {
  await assertOrgAdmin(orgId)
  return createProductCore(orgId, input)
}

export async function updateProduct(orgId: string, productId: string, updates: ProductUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  return updateProductCore(orgId, productId, updates)
}

/**
 * Product photos render on the PUBLIC drop page — same token-in-URL access
 * model and 8MB cap as org assets (lib/uploads.ts documents why).
 */
export async function uploadProductPhoto(orgId: string, formData: FormData): Promise<{ url: string }> {
  await assertOrgAdmin(orgId)
  const file = assertImageUpload(formData.get('file'))
  const path = `product-images/${orgId}/${Date.now()}-${safeUploadName(file.name)}`
  const token = randomUUID()
  const blob = adminBucket.file(path)
  await blob.save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  return { url: tokenizedDownloadUrl(adminBucket.name, path, token) }
}

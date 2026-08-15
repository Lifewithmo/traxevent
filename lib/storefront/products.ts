import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'
import type { Product } from '@/lib/types'

export interface CreateProductInput {
  name: string
  price: number
  description?: string
  photo_url?: string
}

export interface ProductUpdate {
  name?: string
  price?: number
  description?: string | null
  photo_url?: string | null
  active?: boolean
}

export function productsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('products')
}

export async function listProductsCore(orgId: string): Promise<Product[]> {
  const snap = await productsRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => d.data() as Product)
}

/** Guard-free create. Validates name + price; performs no auth. */
export async function createProductCore(orgId: string, input: CreateProductInput): Promise<Product> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!(input.price > 0)) throw new Error('Price must be greater than zero')
  const id = randomBytes(8).toString('hex')
  const product: Product = {
    id,
    name: input.name.trim(),
    price: input.price,
    active: true,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.photo_url ? { photo_url: input.photo_url } : {}),
    created_at: new Date().toISOString(),
  }
  await productsRef(orgId).doc(id).set(product)
  return product
}

/** Guard-free update. undefined = untouched; null = delete the field. */
export async function updateProductCore(orgId: string, productId: string, updates: ProductUpdate): Promise<void> {
  if (updates.name !== undefined && !updates.name.trim()) throw new Error('Name is required')
  if (updates.price !== undefined && !(updates.price > 0)) throw new Error('Price must be greater than zero')
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v === null ? FieldValue.delete() : v
  }
  await productsRef(orgId).doc(productId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertNetworkAdmin } from '@/lib/auth/assert'

const HEX = /^#[0-9a-fA-F]{6}$/

export interface NetworkBranding {
  display_name?: string
  logo_url?: string
  primary_color?: string
  accent_color?: string
}

export async function updateNetworkBranding(networkId: string, branding: NetworkBranding): Promise<void> {
  await assertNetworkAdmin(networkId)
  for (const c of [branding.primary_color, branding.accent_color]) {
    if (c && !HEX.test(c)) throw new Error('Colors must be hex like #2563EB')
  }
  if (branding.logo_url && !/^https?:\/\//.test(branding.logo_url)) {
    throw new Error('Logo URL must start with http:// or https://')
  }
  const update: Record<string, unknown> = {}
  if (branding.display_name !== undefined) update.display_name = branding.display_name.trim()
  if (branding.logo_url !== undefined) update.logo_url = branding.logo_url.trim()
  if (branding.primary_color !== undefined) update.primary_color = branding.primary_color
  if (branding.accent_color !== undefined) update.accent_color = branding.accent_color
  await adminDb.collection('networks').doc(networkId).update(update)
}

export async function setNetworkPortalDomain(networkId: string, domain: string): Promise<void> {
  await assertNetworkAdmin(networkId)
  const normalized = domain.trim().toLowerCase()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
    throw new Error('Enter a valid domain (e.g. camps.yourdomain.org)')
  }
  const existing = await adminDb.collection('networks').where('portal_domain', '==', normalized).limit(1).get()
  if (!existing.empty && existing.docs[0].id !== networkId) {
    throw new Error('That domain is already in use')
  }
  await adminDb.collection('networks').doc(networkId).update({ portal_domain: normalized })
}

export async function removeNetworkPortalDomain(networkId: string): Promise<void> {
  await assertNetworkAdmin(networkId)
  await adminDb.collection('networks').doc(networkId).update({ portal_domain: null })
}

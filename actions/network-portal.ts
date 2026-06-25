'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertNetworkAdmin } from '@/lib/auth/assert'
import type { Network, Org, Camp } from '@/lib/types'
import { buildPortalEvents, type PortalEvent } from '@/lib/portal'

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

export interface NetworkPortal {
  network: Network
  events: PortalEvent[]
}

async function loadPortal(network: Network | null): Promise<NetworkPortal | null> {
  if (!network) return null
  const orgsSnap = await adminDb.collection('orgs').where('network_id', '==', network.id).get()
  const orgs = orgsSnap.docs.map((d) => ({ ...(d.data() as Org), id: d.id }))
  const perOrg = await Promise.all(
    orgs.map(async (org) => {
      const campsSnap = await adminDb
        .collection('orgs').doc(org.id).collection('camps')
        .where('status', '==', 'active').get()
      return { org, camps: campsSnap.docs.map((d) => d.data() as Camp) }
    })
  )
  return { network, events: buildPortalEvents(perOrg) }
}

// PUBLIC (no auth): only exposes a network's public-facing name/branding + active camps.
export async function getNetworkPortalBySlug(networkSlug: string): Promise<NetworkPortal | null> {
  const snap = await adminDb.collection('networks').where('slug', '==', networkSlug).limit(1).get()
  return loadPortal(snap.empty ? null : ({ ...(snap.docs[0].data() as Network), id: snap.docs[0].id }))
}

export async function getNetworkPortalByDomain(host: string): Promise<NetworkPortal | null> {
  const normalized = host.trim().toLowerCase()
  const snap = await adminDb.collection('networks').where('portal_domain', '==', normalized).limit(1).get()
  return loadPortal(snap.empty ? null : ({ ...(snap.docs[0].data() as Network), id: snap.docs[0].id }))
}

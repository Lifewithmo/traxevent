'use server'

import { adminDb } from '@/lib/firebase-admin'
import { setNetworkClaims } from '@/actions/auth'
import { assertNetworkAdmin, assertOrgAdmin } from '@/lib/auth/assert'
import { slugify } from '@/lib/slug'
import type { Network, Org } from '@/lib/types'

export async function createNetwork(uid: string, name: string, displayName: string, email: string): Promise<Network> {
  const slug = slugify(name)
  const ref = adminDb.collection('networks').doc()
  const network: Network = { id: ref.id, name, slug, created_at: new Date().toISOString() }
  await ref.set(network)
  await adminDb.collection('networks').doc(ref.id).collection('members').doc(uid)
    .set({ uid, role: 'admin', display_name: displayName, email })
  await setNetworkClaims(uid, ref.id, slug)
  return network
}

export async function listNetworkOrgs(networkId: string): Promise<Org[]> {
  await assertNetworkAdmin(networkId)
  const snap = await adminDb.collection('orgs').where('network_id', '==', networkId).get()
  return snap.docs.map((d) => d.data() as Org)
}

// Link an org into the network. Caller must be a network admin AND an admin/owner of the org.
export async function linkOrgToNetwork(networkId: string, orgId: string): Promise<void> {
  await assertNetworkAdmin(networkId)
  await assertOrgAdmin(orgId)
  await adminDb.collection('orgs').doc(orgId).update({ network_id: networkId, updated_at: new Date().toISOString() })
}

export async function linkOrgToNetworkBySlug(networkId: string, orgSlug: string): Promise<void> {
  const snap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (snap.empty) throw new Error('No organization found with that slug')
  await linkOrgToNetwork(networkId, snap.docs[0].id)
}

export async function unlinkOrgFromNetwork(networkId: string, orgId: string): Promise<void> {
  await assertNetworkAdmin(networkId)
  await adminDb.collection('orgs').doc(orgId).update({ network_id: null, updated_at: new Date().toISOString() })
}

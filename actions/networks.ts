'use server'

import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { setNetworkClaims } from '@/actions/auth'
import { assertNetworkAdmin, assertNetworkMember, assertOrgAdmin } from '@/lib/auth/assert'
import { scopeOrgsToMember } from '@/lib/network-scope'
import { slugify } from '@/lib/slug'
import { buildInviteToken } from '@/lib/tokens'
import type { Network, NetworkMember, Org, OrgInvitation, OrgRole, Region } from '@/lib/types'
import type { OnboardRow } from '@/lib/bulk-onboard'

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
  const member = await assertNetworkMember(networkId)
  const snap = await adminDb.collection('orgs').where('network_id', '==', networkId).get()
  return scopeOrgsToMember(member, snap.docs.map((d) => d.data() as Org))
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

export interface BulkOnboardResult {
  orgName: string
  adminEmail: string
  slug?: string
  inviteToken?: string
  status: 'created' | 'error'
  error?: string
}

// Unique org slug: append -2, -3, ... until free (createOrg does NOT dedupe slugs).
async function uniqueOrgSlug(name: string): Promise<string> {
  const base = slugify(name)
  let slug = base
  let n = 2
  while (!(await adminDb.collection('orgs').where('slug', '==', slug).limit(1).get()).empty) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

// Create an org + owner invitation per row, auto-linked to the network. The network admin
// is NOT made a member; the invited admin becomes owner on accepting. Returns per-row results.
export async function bulkOnboardOrgs(networkId: string, rows: OnboardRow[]): Promise<BulkOnboardResult[]> {
  await assertNetworkAdmin(networkId)
  const results: BulkOnboardResult[] = []
  for (const row of rows) {
    if (row.error || !row.orgName.trim() || !row.adminEmail.trim()) {
      results.push({ orgName: row.orgName, adminEmail: row.adminEmail, status: 'error', error: row.error ?? 'Invalid row' })
      continue
    }
    try {
      const slug = await uniqueOrgSlug(row.orgName)
      const orgRef = adminDb.collection('orgs').doc()
      const now = new Date().toISOString()
      await orgRef.set({
        id: orgRef.id,
        name: row.orgName.trim(),
        slug,
        billing_status: 'trialing',
        network_id: networkId,
        created_at: now,
      })
      const token = buildInviteToken()
      const invitation: OrgInvitation = {
        token,
        email: row.adminEmail.trim(),
        role: 'owner' as OrgRole,
        created_at: now,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }
      await orgRef.collection('invitations').doc(token).set(invitation)
      results.push({ orgName: row.orgName, adminEmail: row.adminEmail, slug, inviteToken: token, status: 'created' })
    } catch (err: unknown) {
      results.push({ orgName: row.orgName, adminEmail: row.adminEmail, status: 'error', error: err instanceof Error ? err.message : 'Failed' })
    }
  }
  return results
}

// --- Regions / coordinators (Phase 4d) ---

export async function listRegions(networkId: string): Promise<Region[]> {
  await assertNetworkMember(networkId)
  const snap = await adminDb.collection('networks').doc(networkId).collection('regions').get()
  return snap.docs.map((d) => d.data() as Region)
}

export async function createRegion(networkId: string, name: string): Promise<Region> {
  await assertNetworkAdmin(networkId)
  const ref = adminDb.collection('networks').doc(networkId).collection('regions').doc()
  const region: Region = { id: ref.id, name: name.trim(), created_at: new Date().toISOString() }
  await ref.set(region)
  return region
}

// Assign (or clear, with regionId=null) an org's region. The org must already belong to this network.
export async function assignOrgToRegion(networkId: string, orgId: string, regionId: string | null): Promise<void> {
  await assertNetworkAdmin(networkId)
  const orgSnap = await adminDb.collection('orgs').doc(orgId).get()
  if (!orgSnap.exists || (orgSnap.data() as Org).network_id !== networkId) {
    throw new Error('Organization is not in this network')
  }
  await adminDb.collection('orgs').doc(orgId).update({ region_id: regionId, updated_at: new Date().toISOString() })
}

export async function listNetworkMembers(networkId: string): Promise<NetworkMember[]> {
  await assertNetworkAdmin(networkId)
  const snap = await adminDb.collection('networks').doc(networkId).collection('members').get()
  return snap.docs.map((d) => d.data() as NetworkMember)
}

// Grant an EXISTING user the coordinator role for the given regions.
export async function assignCoordinator(networkId: string, email: string, regionIds: string[]): Promise<void> {
  await assertNetworkAdmin(networkId)
  const netSnap = await adminDb.collection('networks').doc(networkId).get()
  if (!netSnap.exists) throw new Error('Network not found')
  const networkSlug = (netSnap.data() as Network).slug
  let uid: string
  try {
    const u = await adminAuth.getUserByEmail(email.trim())
    uid = u.uid
  } catch {
    throw new Error('No user found with that email')
  }
  const regionsSnap = await adminDb.collection('networks').doc(networkId).collection('regions').get()
  const validRegionIds = new Set(regionsSnap.docs.map((d) => (d.data() as Region).id))
  if (regionIds.some((id) => !validRegionIds.has(id))) {
    throw new Error('Invalid region selection')
  }
  const existingSnap = await adminDb.collection('networks').doc(networkId).collection('members').doc(uid).get()
  if (existingSnap.exists && (existingSnap.data() as NetworkMember).role === 'admin') {
    throw new Error('User is already a network admin')
  }
  const member: NetworkMember = {
    uid,
    role: 'coordinator',
    display_name: '',
    email: email.trim(),
    region_ids: regionIds,
  }
  await adminDb.collection('networks').doc(networkId).collection('members').doc(uid).set(member)
  await setNetworkClaims(uid, networkId, networkSlug, 'coordinator')
}

import 'server-only'

import { adminDb } from '@/lib/firebase-admin'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessCampPage } from '@/lib/auth/access'
import type { Camp, Family, OrgMember, CampPage } from '@/lib/types'

// Authorize access to ONE family's data via any of:
//  1. a valid, unexpired access token matching the family (anonymous registrant from an email link)
//  2. the logged-in owning registrant (family.registrant_uid === caller.uid)
//  3. an org member of orgId with the given camp-page grant, or a platform admin
// Throws 'Not found' / 'Forbidden' otherwise. Returns the family on success.
export async function assertFamilyAccess(
  orgId: string,
  campId: string,
  familyId: string,
  opts: { token?: string; page?: CampPage } = {}
): Promise<Family> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .get()
  if (!snap.exists) throw new Error('Not found')
  const family = snap.data() as Family

  // 1) access token
  if (opts.token && family.access_token && opts.token === family.access_token) {
    const exp = family.access_token_expires_at
    if (!exp || new Date(exp).getTime() > Date.now()) return family
  }

  // 2) + 3) caller identity
  const user = await getCurrentUser()
  if (user) {
    if (family.registrant_uid && family.registrant_uid === user.uid) return family
    if (user.role === 'platform_admin') return family
    if (user.orgId === orgId) {
      const m = await adminDb.collection('orgs').doc(orgId).collection('members').doc(user.uid).get()
      if (m.exists) {
        const campSnap = await adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).get()
        const deptId = campSnap.exists ? ((campSnap.data() as Camp).department_id ?? null) : null
        if (canAccessCampPage(m.data() as OrgMember, campId, opts.page ?? 'families', deptId)) return family
      }
    }
  }

  throw new Error('Forbidden')
}

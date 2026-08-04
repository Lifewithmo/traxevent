import 'server-only'
import { notFound } from 'next/navigation'
import { getOrgBySlug } from '@/actions/orgs'
import { resolveEnabledModules, type ModuleId } from '@/lib/industry-packs'

// Guards a route on an org's resolved module set. Used by public self-registration
// and registrant-portal routes that live under modules an org's industry pack may
// have turned off (e.g. attendee-roster for booked-job-pack orgs).
export async function assertOrgModule(orgSlug: string, moduleId: ModuleId): Promise<void> {
  const org = await getOrgBySlug(orgSlug)
  const modules = resolveEnabledModules(org?.industry_pack_id)
  if (!modules.includes(moduleId)) notFound()
}

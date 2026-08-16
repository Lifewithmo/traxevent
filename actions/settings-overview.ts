'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listMembers } from '@/actions/members'
import { listProposalTemplates } from '@/actions/proposal-templates'
import { buildSettingsAreas } from '@/lib/settings-health'
import type { SettingsArea, SettingsInput } from '@/lib/settings-health'

export async function getSettingsOverview(
  orgId: string,
  org: SettingsInput['org'],
): Promise<{ areas: SettingsArea[]; memberCount: number }> {
  await assertOrgMember(orgId)
  const [members, templates] = await Promise.all([listMembers(orgId), listProposalTemplates(orgId)])
  return {
    areas: buildSettingsAreas({ org, memberCount: members.length, templateCount: templates.length }),
    memberCount: members.length,
  }
}

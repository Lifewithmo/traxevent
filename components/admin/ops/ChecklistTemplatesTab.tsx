'use client'

import type { ChecklistTemplate } from '@/lib/types'

interface ChecklistTemplatesTabProps {
  orgId: string
  isAdmin: boolean
  templates: ChecklistTemplate[]
  ownTemplateIds: string[]
}

export function ChecklistTemplatesTab({ orgId, isAdmin, templates, ownTemplateIds }: ChecklistTemplatesTabProps) {
  return <p>Coming in this plan's Task 5</p>
}

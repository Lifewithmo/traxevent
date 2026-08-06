'use client'

import type { OpsResource, WorkPackage, ChecklistTemplate } from '@/lib/types'

interface PackagesTabProps {
  orgId: string
  isAdmin: boolean
  packages: WorkPackage[]
  resources: OpsResource[]
  templates: ChecklistTemplate[]
}

export function PackagesTab({ orgId, isAdmin, packages, resources, templates }: PackagesTabProps) {
  return <p>Coming in this plan's Task 4</p>
}

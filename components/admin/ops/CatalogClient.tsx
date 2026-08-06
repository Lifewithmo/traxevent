'use client'

import { useState } from 'react'
import { ResourcesTab } from '@/components/admin/ops/ResourcesTab'
import { PackagesTab } from '@/components/admin/ops/PackagesTab'
import { ChecklistTemplatesTab } from '@/components/admin/ops/ChecklistTemplatesTab'
import type { OpsResource, WorkPackage, ChecklistTemplate } from '@/lib/types'

type Tab = 'packages' | 'resources' | 'checklists'

interface CatalogClientProps {
  orgId: string
  isAdmin: boolean
  title: string
  resources: OpsResource[]
  packages: WorkPackage[]
  templates: ChecklistTemplate[]
  ownTemplateIds: string[]
}

export function CatalogClient({ orgId, isAdmin, title, resources, packages, templates, ownTemplateIds }: CatalogClientProps) {
  const [tab, setTab] = useState<Tab>('packages')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'packages', label: title },
    { id: 'resources', label: 'Ingredients & Equipment' },
    { id: 'checklists', label: 'Checklists' },
  ]
  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <div className="flex gap-1 border-b mb-6" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'packages' && (
        <PackagesTab orgId={orgId} isAdmin={isAdmin} packages={packages} resources={resources} templates={templates} />
      )}
      {tab === 'resources' && (
        <ResourcesTab orgId={orgId} isAdmin={isAdmin} resources={resources} packages={packages} />
      )}
      {tab === 'checklists' && (
        <ChecklistTemplatesTab orgId={orgId} isAdmin={isAdmin} templates={templates} ownTemplateIds={ownTemplateIds} />
      )}
    </div>
  )
}

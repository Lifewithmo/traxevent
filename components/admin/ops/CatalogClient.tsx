'use client'

import { useState } from 'react'
import { ResourcesTab } from '@/components/admin/ops/ResourcesTab'
import { PackagesTab } from '@/components/admin/ops/PackagesTab'
import { ChecklistTemplatesTab } from '@/components/admin/ops/ChecklistTemplatesTab'
import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'
import { priceRange, uncostedConsumables, type PackageCosting } from '@/lib/ops/catalog-costing'
import { formatMoney } from '@/lib/utils'
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
  costing: PackageCosting[]
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// Kept inline rather than split into its own file: it reads nothing the shell
// doesn't already hold, and nothing else in the app renders catalog KPIs.
function CatalogKpiBand({
  title,
  packages,
  resources,
}: {
  title: string
  packages: WorkPackage[]
  resources: OpsResource[]
}) {
  // priceRange() returns undefined for an empty catalog (it guards Math.min on
  // []). Render an em dash there — never "$0.00", which would read as "free".
  const range = priceRange(packages)
  const priceLabel = !range
    ? '—'
    : range.min === range.max
      ? formatMoney(range.min)
      : `${formatMoney(range.min)}–${formatMoney(range.max)}`
  const uncosted = uncostedConsumables(resources).length

  return (
    <KpiBand>
      <StatTile label={title} value={String(packages.length)} />
      <StatTile label="Price range" value={priceLabel} tone="money" />
      <StatTile label="Ingredients & equipment" value={String(resources.length)} />
      <StatTile
        label="Uncosted ingredients"
        value={String(uncosted)}
        tone={uncosted > 0 ? 'alert' : 'default'}
        note="blocks materials cost"
      />
    </KpiBand>
  )
}

export function CatalogClient({
  orgId,
  isAdmin,
  title,
  resources,
  packages,
  templates,
  ownTemplateIds,
  costing,
}: CatalogClientProps) {
  // Deliberately local state, NOT a URL search param: this page is
  // `force-dynamic`, so a search param would re-render the whole route server
  // side on every tab click and push a history entry per switch.
  const [tab, setTab] = useState<Tab>('packages')

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="text-xs text-muted-foreground">
          {count(packages.length, 'package', 'packages')}
          {' · '}
          {count(resources.length, 'ingredient or equipment item', 'ingredients & equipment')}
        </p>
      </div>

      <div className="px-5 py-4">
        <CatalogKpiBand title={title} packages={packages} resources={resources} />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="px-5">
          <TabsTab value="packages">{title}</TabsTab>
          <TabsTab value="resources">Ingredients &amp; Equipment</TabsTab>
          <TabsTab value="checklists">Checklists</TabsTab>
        </TabsList>

        {/* `keepMounted` on every panel is load-bearing, not cosmetic. Without
            it, switching tabs unmounts the others and throws away in-progress
            drafts AND any optimistically-created row — remounting re-seeds each
            tab's useState from the original server props, so a package you just
            created vanishes until a full reload. */}
        <TabsPanel value="packages" keepMounted className="px-5 py-5">
          <PackagesTab
            orgId={orgId}
            isAdmin={isAdmin}
            packages={packages}
            resources={resources}
            templates={templates}
            costing={costing}
          />
        </TabsPanel>
        <TabsPanel value="resources" keepMounted className="px-5 py-5">
          <ResourcesTab orgId={orgId} isAdmin={isAdmin} resources={resources} packages={packages} />
        </TabsPanel>
        <TabsPanel value="checklists" keepMounted className="px-5 py-5">
          <ChecklistTemplatesTab
            orgId={orgId}
            isAdmin={isAdmin}
            templates={templates}
            ownTemplateIds={ownTemplateIds}
          />
        </TabsPanel>
      </Tabs>
    </div>
  )
}

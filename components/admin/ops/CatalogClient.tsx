'use client'

import { useMemo, useState } from 'react'
import { ResourcesTab } from '@/components/admin/ops/ResourcesTab'
import { PackagesTab } from '@/components/admin/ops/PackagesTab'
import { ChecklistTemplatesTab } from '@/components/admin/ops/ChecklistTemplatesTab'
import { CatalogHealthRail } from '@/components/admin/ops/CatalogHealthRail'
import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'
import {
  computeCatalogCosting,
  priceRange,
  uncostedConsumables,
  type PackageCosting,
} from '@/lib/ops/catalog-costing'
// Deliberately lib/money, NOT lib/utils: the utils copy is `$${n.toFixed(2)}`,
// which renders a $150–$4,200 catalog as "$150.00–$4200.00" at 20px. The band
// groups thousands like every other KPI band in the app. Row-level cells stay on
// the utils copy, where two fixed decimals are the point ($0.55 per oz).
import { formatMoney as money } from '@/lib/money'
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

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// Kept inline rather than split into its own file: it reads nothing the shell
// doesn't already hold, and nothing else in the app renders catalog KPIs.
function CatalogKpiBand({
  title,
  packages,
  resources,
  costing,
}: {
  title: string
  packages: WorkPackage[]
  resources: OpsResource[]
  costing: PackageCosting[]
}) {
  // priceRange() returns undefined for an empty catalog (it guards Math.min on
  // []). Render an em dash there — never "$0.00", which would read as "free".
  const range = priceRange(packages)
  const priceLabel = !range
    ? '—'
    : range.min === range.max
      ? money(range.min)
      : `${money(range.min)}–${money(range.max)}`
  // The catalog's most decision-relevant number: how many packages the operator
  // cannot quote materials for. It used to appear only as an 11px count badge in
  // a rail that hides below lg, which is where the work actually gets triaged.
  const notCosted = costing.filter((c) => !c.costed).length
  const uncosted = uncostedConsumables(resources).length

  return (
    <KpiBand inset>
      <StatTile label={title} value={String(packages.length)} />
      <StatTile label="Price range" value={priceLabel} tone="money" />
      <StatTile
        label="Not costed"
        value={String(notCosted)}
        tone={notCosted > 0 ? 'alert' : 'default'}
        note="no materials figure"
      />
      <StatTile
        label="Uncosted ingredients"
        value={String(uncosted)}
        tone={uncosted > 0 ? 'alert' : 'default'}
        note="blocks the materials figure"
      />
    </KpiBand>
  )
}

export function CatalogClient({
  orgId,
  isAdmin,
  title,
  resources: initialResources,
  packages: initialPackages,
  templates: initialTemplates,
  ownTemplateIds,
}: CatalogClientProps) {
  // The three datasets live HERE, not one copy per tab. `keepMounted` means the
  // tabs never remount, so a tab that seeded its own useState from a server prop
  // could never see a sibling's write: costing an ingredient on the Ingredients
  // tab left the package's materials figure at "—" until a full page reload, and
  // Resources' in-use delete guard could not see a package created in-session,
  // so its hard block was bypassable. Owning the state at the shell is what makes
  // the band, the rail, the subhead and every tab agree after any mutation.
  const [packages, setPackages] = useState(initialPackages)
  const [resources, setResources] = useState(initialResources)
  const [templates, setTemplates] = useState(initialTemplates)
  // Derived, never stored: a costing snapshot passed down as a prop would go
  // stale on exactly the mutations this lift exists to propagate.
  const costing = useMemo(() => computeCatalogCosting(packages, resources), [packages, resources])

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

      <CatalogKpiBand title={title} packages={packages} resources={resources} costing={costing} />

      {/* The rail is a sibling of the WHOLE tab set, not of one panel's content —
          same shape as TodayClient/CalendarWeekClient. Rendered inside PackagesTab
          it only capped the reading column on one of three tabs, leaving the
          Ingredients table and the Checklists stack stretched to the full 7xl. */}
      <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <TabsList>
              <TabsTab value="packages">{title}</TabsTab>
              <TabsTab value="resources">Ingredients &amp; Equipment</TabsTab>
              <TabsTab value="checklists">Checklists</TabsTab>
            </TabsList>

            {/* `keepMounted` on every panel is load-bearing, not cosmetic. Without
                it, switching tabs unmounts the others and throws away in-progress
                drafts — a half-typed package draft would not survive a peek at the
                Ingredients tab. */}
            <TabsPanel value="packages" keepMounted className="pt-5">
              <PackagesTab
                orgId={orgId}
                isAdmin={isAdmin}
                packages={packages}
                setPackages={setPackages}
                resources={resources}
                templates={templates}
                costing={costing}
              />
            </TabsPanel>
            <TabsPanel value="resources" keepMounted className="pt-5">
              <ResourcesTab
                orgId={orgId}
                isAdmin={isAdmin}
                resources={resources}
                setResources={setResources}
                packages={packages}
              />
            </TabsPanel>
            <TabsPanel value="checklists" keepMounted className="pt-5">
              <ChecklistTemplatesTab
                orgId={orgId}
                isAdmin={isAdmin}
                templates={templates}
                setTemplates={setTemplates}
                ownTemplateIds={ownTemplateIds}
              />
            </TabsPanel>
          </Tabs>
        </div>

        {/* Nothing to be healthy about yet: on a brand-new org the rail asserted
            "Every ingredient is costed" beside "No packages yet" — vacuously true
            and actively misleading. Same guard, same reason, as VendorsLedger. */}
        {(packages.length > 0 || resources.length > 0) && (
          <CatalogHealthRail
            packages={packages}
            resources={resources}
            costing={costing}
            className="w-full lg:w-72 lg:shrink-0"
          />
        )}
      </div>
    </div>
  )
}

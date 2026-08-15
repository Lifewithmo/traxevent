'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listAllVendors } from '@/actions/vendors'
import { listComplianceDocs } from '@/actions/compliance'
import { listFormTemplates } from '@/actions/forms'
import { listWorkPackages } from '@/actions/work-packages'
import { findExpiringDocs } from '@/lib/catalog-health'
import type { CatalogOverview } from '@/lib/catalog-health'

export async function getCatalogOverview(orgId: string): Promise<CatalogOverview> {
  await assertOrgMember(orgId)
  const [vendors, docs, forms, packages] = await Promise.all([
    listAllVendors(orgId),
    listComplianceDocs(orgId),
    listFormTemplates(orgId),
    listWorkPackages(orgId),
  ])
  return {
    vendorCount: vendors.length,
    formCount: forms.length,
    complianceCount: docs.length,
    packageCount: packages.length,
    expiring: findExpiringDocs(docs, new Date().toISOString().slice(0, 10)),
  }
}

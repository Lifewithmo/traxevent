'use server'

import { adminDb } from '@/lib/firebase-admin'
import { getResend } from '@/lib/resend'
import { getOrg } from '@/actions/orgs'
import type { DomainDnsRecord, SendingDomainStatus } from '@/lib/types'

function orgRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId)
}

// Resend domain-level status: 'pending' | 'verified' | 'failed' | 'not_started' | 'partially_verified' | 'partially_failed'
// (also tolerate record-level 'failure'/'temporary_failure' defensively)
function mapStatus(resendStatus: string): SendingDomainStatus {
  if (resendStatus === 'verified') return 'verified'
  if (
    resendStatus === 'failed' ||
    resendStatus === 'partially_failed' ||
    resendStatus === 'failure' ||
    resendStatus === 'temporary_failure'
  ) {
    return 'failed'
  }
  return 'pending' // pending, not_started, partially_verified
}

interface ResendDnsRecord {
  record?: string
  name: string
  type: string
  value: string
  priority?: number
  ttl?: string | number
}

function mapRecords(records: ResendDnsRecord[] | undefined): DomainDnsRecord[] {
  return (records ?? []).map((r) => ({
    record: r.record ?? '',
    name: r.name,
    type: r.type,
    value: r.value,
    ...(r.priority != null ? { priority: r.priority } : {}),
    ...(r.ttl != null ? { ttl: String(r.ttl) } : {}),
  }))
}

export async function createSendingDomain(
  orgId: string,
  domain: string
): Promise<{ status: SendingDomainStatus; records: DomainDnsRecord[] }> {
  const resend = getResend()
  const { data, error } = await resend.domains.create({ name: domain })
  if (error || !data) throw new Error(error?.message ?? 'Failed to create domain')

  const status = mapStatus(data.status)
  const records = mapRecords(data.records)

  await orgRef(orgId).update({
    sending_domain: domain,
    sending_domain_id: data.id,
    sending_domain_status: status,
    sending_domain_records: records,
  })

  return { status, records }
}

export async function verifySendingDomain(orgId: string): Promise<{ status: SendingDomainStatus }> {
  const org = await getOrg(orgId)
  if (!org?.sending_domain_id) throw new Error('No sending domain to verify')

  const resend = getResend()
  await resend.domains.verify(org.sending_domain_id)

  const { data, error } = await resend.domains.get(org.sending_domain_id)
  if (error || !data) throw new Error(error?.message ?? 'Failed to check domain status')

  const status = mapStatus(data.status)
  await orgRef(orgId).update({ sending_domain_status: status })
  return { status }
}

export async function removeSendingDomain(orgId: string): Promise<void> {
  const org = await getOrg(orgId)
  if (org?.sending_domain_id) {
    const resend = getResend()
    await resend.domains.remove(org.sending_domain_id)
  }
  await orgRef(orgId).update({
    sending_domain: null,
    sending_domain_id: null,
    sending_domain_status: null,
    sending_domain_records: null,
  })
}

export async function getVerifiedSendingDomain(orgId: string): Promise<string | undefined> {
  const org = await getOrg(orgId)
  if (org?.sending_domain_status === 'verified' && org.sending_domain) {
    return org.sending_domain
  }
  return undefined
}

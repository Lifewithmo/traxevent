import { adminDb } from '@/lib/firebase-admin'
import type { OpsIssue, IssueSeverity } from '@/lib/types'

const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high']

export interface CreateIssueInput {
  type: string
  severity: IssueSeverity
  note: string
  created_by: string
}

export function opsIssuesRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId)
    .collection('events').doc(eventId)
    .collection('ops_issues')
}

export async function listIssuesCore(orgId: string, eventId: string): Promise<OpsIssue[]> {
  const snap = await opsIssuesRef(orgId, eventId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as OpsIssue)
}

export async function createIssueCore(orgId: string, eventId: string, input: CreateIssueInput): Promise<OpsIssue> {
  if (!input.note?.trim()) throw new Error('Note is required')
  if (!SEVERITIES.includes(input.severity)) throw new Error('Invalid severity')
  const ref = opsIssuesRef(orgId, eventId).doc()
  const issue: OpsIssue = {
    id: ref.id,
    type: input.type,
    severity: input.severity,
    note: input.note.trim(),
    status: 'open',
    created_by: input.created_by,
    created_at: new Date().toISOString(),
  }
  await ref.set(issue)
  return issue
}

export async function resolveIssueCore(
  orgId: string,
  eventId: string,
  issueId: string,
  resolution?: string,
): Promise<void> {
  await opsIssuesRef(orgId, eventId).doc(issueId).update({
    status: 'resolved',
    resolved_at: new Date().toISOString(),
    ...(resolution !== undefined ? { resolution } : {}),
  })
}

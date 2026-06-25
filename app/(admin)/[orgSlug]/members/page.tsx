import { getOrgBySlug } from '@/actions/orgs'
import { listMembers } from '@/actions/members'
import { listCamps } from '@/actions/camps'
import { listDepartments } from '@/actions/departments'
import { InviteMemberModal } from '@/components/members/InviteMemberModal'
import { PermissionMatrix } from '@/components/members/PermissionMatrix'
import { DepartmentPermissionMatrix } from '@/components/members/DepartmentPermissionMatrix'
import { Badge } from '@/components/ui/badge'
import { redirect } from 'next/navigation'

export default async function MembersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const org = await getOrgBySlug(orgSlug)
  if (!org) redirect('/login')

  const [members, camps, departments] = await Promise.all([listMembers(org.id), listCamps(org.id), listDepartments(org.id)])

  const admins = members.filter((m) => m.role !== 'staff')
  const staff = members.filter((m) => m.role === 'staff')

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Members</h1>
        <InviteMemberModal orgId={org.id} />
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Admins & Owners</h2>
        {admins.length === 0 ? (
          <p className="text-sm text-gray-500">No admins yet.</p>
        ) : (
          <div className="space-y-2">
            {admins.map((m) => (
              <div
                key={m.uid}
                className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white"
              >
                <div>
                  <span className="font-medium">{m.display_name}</span>
                  <span className="ml-2 text-sm text-gray-400">{m.email}</span>
                </div>
                <Badge>{m.role}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Staff Permissions</h2>
        <p className="text-sm text-gray-500 mb-4">
          Toggle which pages each staff member can access, per camp.
        </p>
        <PermissionMatrix orgId={org.id} staff={staff} camps={camps} />
      </section>

      {departments.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Department Permissions</h2>
          <p className="text-sm text-gray-500 mb-4">Grant a staff member access across every event in a department. Combined with the per-event permissions above.</p>
          <DepartmentPermissionMatrix orgId={org.id} staff={staff} departments={departments} />
        </section>
      )}
    </div>
  )
}

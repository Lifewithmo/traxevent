'use client'

import { useState } from 'react'
import { CAMP_PAGES } from '@/lib/types'
import type { OrgMember, Department } from '@/lib/types'
import { updateStaffDepartmentAccess } from '@/actions/members'

interface Props {
  orgId: string
  staff: OrgMember[]
  departments: Department[]
}

export function DepartmentPermissionMatrix({ orgId, staff, departments }: Props) {
  const [saving, setSaving] = useState<string | null>(null)

  async function toggle(uid: string, deptId: string, page: string, current: string[]) {
    const key = `${uid}-${deptId}-${page}`
    setSaving(key)
    const next = current.includes(page) ? current.filter((p) => p !== page) : [...current, page]
    try {
      await updateStaffDepartmentAccess(orgId, uid, deptId, next)
    } finally {
      setSaving(null)
    }
  }

  if (departments.length === 0) {
    return <p className="text-sm text-gray-500">No departments yet. Create departments to grant access across all their events.</p>
  }

  return (
    <div className="space-y-8">
      {departments.map((dept) => (
        <div key={dept.id}>
          <h3 className="font-semibold mb-3 text-gray-700">{dept.name} <span className="font-normal text-gray-400">(all events in this department)</span></h3>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr>
                  <th scope="col" className="text-left pr-4">Staff member</th>
                  {CAMP_PAGES.map((page) => (<th key={page} scope="col" className="px-1 capitalize">{page}</th>))}
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => {
                  const pages = m.department_access?.[dept.id]?.pages ?? []
                  return (
                    <tr key={m.uid}>
                      <td className="pr-4"><div>{m.display_name}</div><div className="text-xs text-gray-400">{m.email}</div></td>
                      {CAMP_PAGES.map((page) => {
                        const key = `${m.uid}-${dept.id}-${page}`
                        return (
                          <td key={page} className="text-center">
                            <input
                              type="checkbox"
                              checked={pages.includes(page)}
                              disabled={saving === key}
                              onChange={() => toggle(m.uid, dept.id, page, pages)}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

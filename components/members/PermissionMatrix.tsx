'use client'

import { useState } from 'react'
import { updateStaffCampAccess } from '@/actions/members'
import { CAMP_PAGES, type OrgMember, type Camp } from '@/lib/types'

interface PermissionMatrixProps {
  orgId: string
  staff: OrgMember[]
  camps: Camp[]
}

export function PermissionMatrix({ orgId, staff, camps }: PermissionMatrixProps) {
  const [saving, setSaving] = useState<string | null>(null)

  async function toggle(
    uid: string,
    campId: string,
    page: string,
    current: string[]
  ) {
    const key = `${uid}-${campId}-${page}`
    setSaving(key)
    const next = current.includes(page)
      ? current.filter((p) => p !== page)
      : [...current, page]
    await updateStaffCampAccess(orgId, uid, campId, next)
    setSaving(null)
  }

  if (staff.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No staff members yet. Invite a staff member above.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      {camps.map((camp) => (
        <div key={camp.id}>
          <h3 className="font-semibold mb-3 text-gray-700">{camp.name}</h3>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="text-left py-2 pr-6 font-medium text-gray-500 whitespace-nowrap"
                  >
                    Staff member
                  </th>
                  {CAMP_PAGES.map((page) => (
                    <th
                      key={page}
                      scope="col"
                      className="py-2 px-3 font-medium text-gray-500 capitalize text-center whitespace-nowrap"
                    >
                      {page}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const pages = member.camp_access?.[camp.id]?.pages ?? []
                  return (
                    <tr key={member.uid} className="border-t">
                      <td className="py-3 pr-6">
                        <div className="font-medium">{member.display_name}</div>
                        <div className="text-xs text-gray-400">{member.email}</div>
                      </td>
                      {CAMP_PAGES.map((page) => {
                        const key = `${member.uid}-${camp.id}-${page}`
                        const checked = pages.includes(page)
                        return (
                          <td key={page} className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving === key}
                              onChange={() => toggle(member.uid, camp.id, page, pages)}
                              className="h-4 w-4 cursor-pointer disabled:opacity-40"
                              aria-label={`${member.display_name} — ${page}`}
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

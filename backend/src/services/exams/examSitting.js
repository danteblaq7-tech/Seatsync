export const getExamUnitGroups = payload => {
  if (Array.isArray(payload?.unit_groups)) return payload.unit_groups
  const courseId = payload?.course_id ?? payload?.courseId
  if (!courseId) return []
  return [
    {
      course_id: courseId,
      study_year: payload.study_year ?? payload.studyYear,
      cohort_allocations: payload.cohort_allocations ?? [],
      venue_allocations: payload.venue_allocations ?? []
    }
  ]
}

export const getExamSittingGroupId = payload =>
  payload?.sitting_group_id ?? payload?.sittingGroupId ?? null

export const getExamGroupStudentCount = group =>
  (group?.cohort_allocations || []).reduce(
    (total, allocation) =>
      total + Number(allocation.studentCount ?? allocation.student_count ?? 0),
    0
  )

export const validateExamSittingCapacity = async (connection, groups) => {
  const venueTotals = new Map()

  for (const group of groups) {
    const allocations = group.venue_allocations || []
    for (const allocation of allocations) {
      const venueId = Number(allocation.venueId ?? allocation.venue_id)
      const allocatedCapacity = Number(
        allocation.allocatedCapacity ?? allocation.allocated_capacity
      )
      const students = Number(
        allocation.studentCount ?? allocation.student_count ?? 0
      )
      if (
        !Number.isInteger(venueId) ||
        venueId < 1 ||
        !Number.isFinite(allocatedCapacity) ||
        allocatedCapacity < 1 ||
        !Number.isFinite(students) ||
        students < 1
      ) {
        throw new Error('Each exam venue allocation must be a positive value.')
      }
      const venueTotal = venueTotals.get(venueId) || {
        students: 0,
        allocatedCapacity
      }
      venueTotal.students += students
      venueTotal.allocatedCapacity = Math.min(
        venueTotal.allocatedCapacity,
        allocatedCapacity
      )
      venueTotals.set(venueId, venueTotal)
    }
  }

  for (const [venueId, allocation] of venueTotals) {
    const [rows] = await connection.execute(
      'SELECT capacity FROM venues WHERE id = ?',
      [venueId]
    )
    if (
      !rows.length ||
      allocation.students > allocation.allocatedCapacity ||
      allocation.students > Number(rows[0].capacity)
    ) {
      throw new Error(
        `The combined unit groups exceed the capacity allocated for venue ${venueId}.`
      )
    }
  }
}

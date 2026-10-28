const get = (record, snake, camel) => record?.[snake] ?? record?.[camel]

const timeMinutes = value => {
  const [hours, minutes] = String(value || '00:00')
    .slice(0, 5)
    .split(':')
    .map(Number)
  return hours * 60 + minutes
}

const overlaps = (left, right) =>
  timeMinutes(left.start) < timeMinutes(right.end) &&
  timeMinutes(left.end) > timeMinutes(right.start)

const ids = values =>
  (Array.isArray(values) ? values : String(values || '').split(','))
    .map(Number)
    .filter(Boolean)

const weekdayForDate = date => {
  const [year, month, day] = String(date || '')
    .slice(0, 10)
    .split('-')
    .map(Number)
  if (!year || !month || !day) return ''
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ]
}

const toSchedule = draft => {
  const payload = draft?.payload || {}
  const isExam = draft?.kind === 'exam' || draft?.kind === 'exam_update'
  const cohorts = isExam
    ? (payload.cohort_allocations || [])
        .map(item => Number(get(item, 'cohort_id', 'cohortId')))
        .filter(Boolean)
    : ids(
        get(payload, 'cohort_ids', 'cohortIds') ??
          get(payload, 'cohort_id', 'cohortId')
      )
  const venues = isExam
    ? (payload.venue_allocations || [])
        .map(item => Number(get(item, 'venue_id', 'venueId')))
        .filter(Boolean)
    : [Number(get(payload, 'venue_id', 'venueId'))].filter(Boolean)
  const date = String(get(payload, 'exam_date', 'examDate') || '').slice(0, 10)

  return {
    isExam,
    id: String(draft?.id || ''),
    targetId:
      Number(
        isExam
          ? payload.exam_id ?? payload.examId
          : payload.timetable_entry_id ?? payload.timetableEntryId
      ) || null,
    date,
    day: isExam
      ? weekdayForDate(date)
      : String(get(payload, 'day_of_week', 'dayOfWeek') || '')
          .slice(0, 3)
          .toUpperCase(),
    start: String(get(payload, 'start_time', 'startTime') || '').slice(0, 5),
    end: String(get(payload, 'end_time', 'endTime') || '').slice(0, 5),
    courseId: Number(get(payload, 'course_id', 'courseId')) || null,
    lecturerId: isExam
      ? null
      : Number(get(payload, 'lecturer_id', 'lecturerId')) || null,
    cohorts,
    venues
  }
}

const shared = (left, right) => left.find(id => right.includes(id))

const resourceName = (payload, type, id) => {
  const singular = payload?.[`${type}_name`] ?? payload?.[`${type}Name`]
  if (
    singular &&
    Number(payload?.[`${type}_id`] ?? payload?.[`${type}Id`]) === id
  ) {
    return singular
  }
  const labels = payload?.[`${type}_names`] ?? payload?.[`${type}Names`]
  if (Array.isArray(labels)) {
    const match = labels.find(
      item => Number(item.id ?? item[`${type}_id`]) === id
    )
    if (match) return match.name || match.label || match.code
  }
  if (type === 'unit') return singular || `unit ${id}`
  return `${type} ${id}`
}

export const assertNoStagedDraftConflict = (candidate, otherDrafts = []) => {
  const next = toSchedule(candidate)
  for (const otherDraft of otherDrafts) {
    if (!otherDraft || otherDraft.id === candidate.id) continue
    const other = toSchedule(otherDraft)
    if (
      next.isExam === other.isExam &&
      next.targetId &&
      other.targetId &&
      next.targetId === other.targetId
    ) {
      throw new Error(
        `Event/exam ${next.targetId} already has another pending edit (draft ${other.id}). Publish or remove that draft first.`
      )
    }
    if (!next.start || !next.end || !other.start || !other.end) continue

    if (next.isExam && other.isExam) {
      if (next.date !== other.date || !overlaps(next, other)) continue
      if (next.courseId && next.courseId === other.courseId) {
        const unitName = resourceName(candidate.payload, 'unit', next.courseId)
        throw new Error(
          `Staged exam conflict: ${unitName} has overlapping exams on ${next.date}, ${next.start}–${next.end} and ${other.start}–${other.end} (draft ${other.id}).`
        )
      }
      const cohortId = shared(next.cohorts, other.cohorts)
      if (cohortId) {
        const cohortName = resourceName(candidate.payload, 'cohort', cohortId)
        throw new Error(
          `Staged exam conflict: ${cohortName} has overlapping exams on ${next.date}, ${next.start}–${next.end} and ${other.start}–${other.end} (draft ${other.id}).`
        )
      }
      const venueId = shared(next.venues, other.venues)
      if (venueId) {
        const venueName = resourceName(candidate.payload, 'venue', venueId)
        throw new Error(
          `Staged exam conflict: ${venueName} is allocated to overlapping exams on ${next.date}, ${next.start}–${next.end} and ${other.start}–${other.end} (draft ${other.id}).`
        )
      }
      continue
    }

    if (!next.isExam && !other.isExam) {
      if (next.day !== other.day || !overlaps(next, other)) continue
      const venueId = shared(next.venues, other.venues)
      if (venueId) {
        const venueName = resourceName(candidate.payload, 'venue', venueId)
        throw new Error(
          `Staged event conflict: ${venueName} is booked on ${next.day}, ${next.start}–${next.end}, overlapping draft ${other.id} (${other.start}–${other.end}).`
        )
      }
      if (next.lecturerId && next.lecturerId === other.lecturerId) {
        throw new Error(
          `Staged event conflict: lecturer ${next.lecturerId} has overlapping events on ${next.day}, ${next.start}–${next.end} and ${other.start}–${other.end} (draft ${other.id}).`
        )
      }
      const cohortId = shared(next.cohorts, other.cohorts)
      if (cohortId) {
        const cohortName = resourceName(candidate.payload, 'cohort', cohortId)
        throw new Error(
          `Staged event conflict: ${cohortName} has overlapping events on ${next.day}, ${next.start}–${next.end} and ${other.start}–${other.end} (draft ${other.id}).`
        )
      }
      continue
    }

    // Exams and recurring timetable events are separate scheduling entities;
    // only compare drafts within the same kind.
  }
}

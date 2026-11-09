const selected = (value, allValue = 'all') =>
  value !== undefined &&
  value !== null &&
  String(value).trim() !== '' &&
  String(value).toLowerCase() !== allValue

const exactFilter = (conditions, params, value, expression) => {
  if (!selected(value)) return
  conditions.push(`${expression} = ?`)
  params.push(value)
}

export const buildTimetableQueryFilters = (
  filters = {},
  { kind = 'event', override = false } = {}
) => {
  const conditions = []
  const params = []
  const exam = kind === 'exam'

  exactFilter(
    conditions,
    params,
    filters.academicYear,
    exam ? 'e.academic_year_id' : 'te.academic_year_id'
  )
  exactFilter(
    conditions,
    params,
    filters.semester,
    exam ? 'e.semester_id' : 'te.semester_id'
  )
  if (selected(filters.cohort)) {
    conditions.push(
      exam
        ? 'EXISTS (SELECT 1 FROM exam_cohorts tfc WHERE tfc.exam_id = e.id AND tfc.cohort_id = ?)'
        : '(te.cohort_id = ? OR EXISTS (SELECT 1 FROM timetable_entry_cohorts tfc WHERE tfc.timetable_entry_id = te.id AND tfc.cohort_id = ?))'
    )
    params.push(filters.cohort)
    if (!exam) params.push(filters.cohort)
  }

  if (selected(filters.programme)) {
    conditions.push(
      exam
        ? 'EXISTS (SELECT 1 FROM unit_programmes tfp WHERE tfp.unit_id = e.unit_id AND tfp.programme_id = ?)'
        : 'EXISTS (SELECT 1 FROM timetable_entry_programmes tfp WHERE tfp.timetable_entry_id = te.id AND tfp.programme_id = ?)'
    )
    params.push(filters.programme)
  }

  if (selected(filters.lecturer)) {
    if (exam) {
      conditions.push(
        'EXISTS (SELECT 1 FROM lecturer_units tfl WHERE tfl.unit_id = e.unit_id AND tfl.lecturer_id = ?)'
      )
    } else {
      conditions.push('te.lecturer_id = ?')
    }
    params.push(filters.lecturer)
  }

  if (selected(filters.venue)) {
    if (exam) {
      conditions.push(
        'EXISTS (SELECT 1 FROM exam_venue_allocations tfv WHERE tfv.exam_id = e.id AND tfv.venue_id = ?)'
      )
    } else {
      conditions.push(
        `${override ? 'so.new_venue_id' : 'te.venue_id'} = ?`
      )
    }
    params.push(filters.venue)
  }

  if (selected(filters.eventType)) {
    const eventType = String(filters.eventType).toUpperCase()
    if (exam) {
      if (eventType !== 'EXAM') conditions.push('1 = 0')
    } else if (override) {
      if (eventType !== 'MAKEUP') conditions.push('1 = 0')
    } else if (eventType === 'MAKEUP' || eventType === 'EXAM') {
      conditions.push('1 = 0')
    } else {
      conditions.push('UPPER(te.event_type) = ?')
      params.push(eventType)
    }
  }

  if (selected(filters.day)) {
    const dayExpression = exam
      ? "UPPER(DATE_FORMAT(e.exam_date, '%a'))"
      : override
        ? "UPPER(DATE_FORMAT(so.effective_date, '%a'))"
        : 'UPPER(LEFT(te.day_of_week, 3))'
    conditions.push(`${dayExpression} = ?`)
    params.push(String(filters.day).slice(0, 3).toUpperCase())
  }

  const startTime = String(filters.startTime || '').slice(0, 5)
  const endTime = String(filters.endTime || '').slice(0, 5)
  const validStartTime = /^\d{2}:\d{2}$/.test(startTime)
  const validEndTime = /^\d{2}:\d{2}$/.test(endTime)
  if (validStartTime || validEndTime) {
    if (validStartTime && validEndTime && startTime >= endTime) {
      conditions.push('1 = 0')
    } else {
      const startExpression = exam
        ? 'e.start_time'
        : override
          ? 'so.new_start_time'
          : 'te.start_time'
      const endExpression = exam
        ? 'e.end_time'
        : override
          ? 'so.new_end_time'
          : 'te.end_time'
      if (validEndTime) {
        conditions.push(`${startExpression} < ?`)
        params.push(endTime)
      }
      if (validStartTime) {
        conditions.push(`${endExpression} > ?`)
        params.push(startTime)
      }
    }
  }

  const search = String(filters.search || '').trim()
  if (search) {
    const pattern = `%${search}%`
    conditions.push(
      exam
        ? `(u.code LIKE ? OR u.name LIKE ? OR v.name LIKE ? OR v.code LIKE ?
             OR EXISTS (
             SELECT 1 FROM exam_cohorts tfc
             JOIN cohorts tfco ON tfco.id = tfc.cohort_id
             WHERE tfc.exam_id = e.id AND tfco.name LIKE ?
           ) OR EXISTS (
             SELECT 1 FROM lecturer_units tfl
             JOIN lecturers tfle ON tfle.id = tfl.lecturer_id
             JOIN users tflu ON tflu.id = tfle.user_id
             WHERE tfl.unit_id = e.unit_id
               AND CONCAT_WS(' ', tflu.first_name, tflu.last_name, tflu.email) LIKE ?
           ))`
        : `(u.code LIKE ? OR u.name LIKE ? OR v.name LIKE ? OR v.code LIKE ?
             OR EXISTS (
               SELECT 1 FROM timetable_entry_cohorts tfc
               JOIN cohorts tfco ON tfco.id = tfc.cohort_id
               WHERE tfc.timetable_entry_id = te.id AND tfco.name LIKE ?
             ) OR EXISTS (
               SELECT 1 FROM lecturers tfle
               JOIN users tflu ON tflu.id = tfle.user_id
               WHERE tfle.id = te.lecturer_id
                 AND CONCAT_WS(' ', tflu.first_name, tflu.last_name, tflu.email) LIKE ?
             ))`
    )
    params.push(
      ...(exam
        ? [pattern, pattern, pattern, pattern, pattern, pattern]
        : [pattern, pattern, pattern, pattern, pattern, pattern])
    )
  }

  return { conditions, params }
}

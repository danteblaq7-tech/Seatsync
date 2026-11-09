export const getTimetableVisibility = user => {
  const roles = Array.isArray(user?.roles) ? user.roles : []
  if (roles.includes('ADMIN')) return { clause: '', params: [] }

  const conditions = []
  const params = []
  if (roles.includes('LECTURER')) {
    conditions.push(
      `te.lecturer_id IN (
        SELECT l.id FROM lecturers l
        WHERE l.user_id = ? AND l.employment_status = 'ACTIVE'
      )`
    )
    params.push(Number(user.id))
  }
  if (roles.includes('STUDENT')) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM students evs
        WHERE evs.user_id = ? AND evs.status = 'ACTIVE'
          AND evs.cohort_id IS NOT NULL
          AND (
            evs.cohort_id = te.cohort_id OR EXISTS (
              SELECT 1 FROM timetable_entry_cohorts evc
              WHERE evc.timetable_entry_id = te.id
                AND evc.cohort_id = evs.cohort_id
            )
          )
      )`
    )
    params.push(Number(user.id))
  }
  if (roles.includes('CLASS_REP')) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM cohort_representatives evcr
        JOIN students evrs ON evrs.id = evcr.student_id
        WHERE evrs.user_id = ? AND evcr.is_active = TRUE
          AND (evcr.end_date IS NULL OR evcr.end_date >= CURDATE())
          AND (
            evcr.cohort_id = te.cohort_id OR EXISTS (
              SELECT 1 FROM timetable_entry_cohorts evc
              WHERE evc.timetable_entry_id = te.id
                AND evc.cohort_id = evcr.cohort_id
            )
          )
      )`
    )
    params.push(Number(user.id))
  }

  return {
    clause: conditions.length
      ? `WHERE (${conditions.join(' OR ')})`
      : 'WHERE 1 = 0',
    params
  }
}

export const getExamVisibility = (user, { timetable = false } = {}) => {
  const roles = Array.isArray(user?.roles) ? user.roles : []
  if (roles.includes('ADMIN')) return { clause: '', params: [] }
  if (roles.includes('CLASS_REP') && !timetable) {
    return { clause: '', params: [] }
  }

  const conditions = []
  const params = []
  if (timetable && roles.includes('STUDENT')) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM exam_cohorts evc
        JOIN students evs ON evs.cohort_id = evc.cohort_id
        WHERE evc.exam_id = e.id AND evs.user_id = ?
          AND evs.status = 'ACTIVE'
      )`
    )
    params.push(Number(user.id))
  }
  if (timetable && roles.includes('CLASS_REP')) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM exam_cohorts evc
        JOIN cohort_representatives evcr
          ON evcr.cohort_id = evc.cohort_id AND evcr.is_active = TRUE
         AND (evcr.end_date IS NULL OR evcr.end_date >= CURDATE())
        JOIN students evrs ON evrs.id = evcr.student_id
        WHERE evc.exam_id = e.id AND evrs.user_id = ?
      )`
    )
    params.push(Number(user.id))
  }
  if (roles.includes('LECTURER')) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM lecturer_units evlu
        JOIN lecturers evl ON evl.id = evlu.lecturer_id
        WHERE evlu.unit_id = e.unit_id AND evl.user_id = ?
          AND evl.employment_status = 'ACTIVE'
      )
      AND EXISTS (
        SELECT 1 FROM exam_cohorts evc
        JOIN cohort_progressions evcp
          ON evcp.cohort_id = evc.cohort_id
         AND evcp.academic_year_id = e.academic_year_id
         AND evcp.semester_id = e.semester_id
        JOIN lecturer_cohort_types evlct
          ON evlct.cohort_type_id = evcp.cohort_type_id
        JOIN lecturers evlt ON evlt.id = evlct.lecturer_id
        WHERE evc.exam_id = e.id AND evlt.user_id = ?
          AND evlt.employment_status = 'ACTIVE'
      )`
    )
    params.push(Number(user.id), Number(user.id))
  }
  if (!timetable && roles.includes('STUDENT')) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM exam_cohorts evc
        JOIN students evs ON evs.cohort_id = evc.cohort_id
        WHERE evc.exam_id = e.id AND evs.user_id = ?
          AND evs.status = 'ACTIVE'
      )`
    )
    params.push(Number(user.id))
  }
  return {
    clause: conditions.length
      ? `AND (${conditions.join(' OR ')})`
      : 'AND 1 = 0',
    params
  }
}

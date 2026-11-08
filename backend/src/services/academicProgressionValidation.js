export const validateAcademicPeriod = async (
  connection,
  {
    academicYearId,
    semesterId,
    unitId,
    studyYear,
    lecturerId,
    programmeIds = [],
    cohortIds = [],
    examDate
  }
) => {
  const [periods] = await connection.execute(
    `SELECT s.id, s.academic_year_id, s.semester_type_id, st.number,
        s.start_date, s.end_date, ay.start_date AS academic_start_date,
        ay.end_date AS academic_end_date
     FROM semesters s
     JOIN semester_types st ON st.id = s.semester_type_id
     JOIN academic_years ay ON ay.id = s.academic_year_id
     WHERE s.id = ? AND s.academic_year_id = ? AND st.is_active = TRUE`,
    [Number(semesterId), Number(academicYearId)]
  )
  const period = periods[0]
  if (!period) {
    throw new Error('The selected semester does not belong to the academic year.')
  }

  const [units] = await connection.execute(
    `SELECT id, semester_type_id, year_level
     FROM units WHERE id = ? AND is_active = TRUE`,
    [Number(unitId)]
  )
  const unit = units[0]
  if (!unit) throw new Error('The selected unit is not active or does not exist.')
  if (Number(unit.semester_type_id) !== Number(period.semester_type_id)) {
    throw new Error(
      'The selected unit does not belong to this semester type.'
    )
  }
  const selectedStudyYear = Number(studyYear || unit.year_level)
  if (
    selectedStudyYear !== Number(unit.year_level) ||
    !Number.isInteger(selectedStudyYear) ||
    selectedStudyYear < 1
  ) {
    throw new Error('The selected study year does not match the unit.')
  }

  const normalizedProgrammeIds = [...new Set(programmeIds.map(Number))]
  const [unitProgrammes] = await connection.execute(
    'SELECT programme_id FROM unit_programmes WHERE unit_id = ?',
    [Number(unitId)]
  )
  const unitProgrammeIds = unitProgrammes.map(row => Number(row.programme_id))
  if (
    normalizedProgrammeIds.some(
      programmeId => !unitProgrammeIds.includes(programmeId)
    )
  ) {
    throw new Error('The unit is not associated with every selected programme.')
  }

  const uniqueCohortIds = [...new Set(cohortIds.map(Number))]
  if (uniqueCohortIds.length !== cohortIds.length || !uniqueCohortIds.length) {
    throw new Error('Select at least one valid cohort.')
  }
  const [progressions] = await connection.execute(
    `SELECT cp.cohort_id, cp.student_count, c.programme_id,
        cp.cohort_type_id, ct.study_year, ct.semester_number,
        ct.programme_id AS type_programme_id,
        p.duration_years
     FROM cohort_progressions cp
     JOIN cohorts c ON c.id = cp.cohort_id AND c.is_active = TRUE
     JOIN programmes p ON p.id = c.programme_id
     JOIN cohort_types ct ON ct.id = cp.cohort_type_id AND ct.is_active = TRUE
     WHERE cp.academic_year_id = ? AND cp.semester_id = ?
       AND cp.cohort_id IN (${uniqueCohortIds.map(() => '?').join(',')})`,
    [Number(academicYearId), Number(semesterId), ...uniqueCohortIds]
  )
  if (progressions.length !== uniqueCohortIds.length) {
    throw new Error(
      'Every selected cohort needs a progression record for this academic period.'
    )
  }
  if (
    progressions.some(
      progression =>
        Number(progression.study_year) !== selectedStudyYear ||
        Number(progression.study_year) > Number(progression.duration_years) ||
        Number(progression.semester_number) !== Number(period.number) ||
        Number(progression.programme_id) !==
          Number(progression.type_programme_id) ||
        !unitProgrammeIds.includes(Number(progression.programme_id)) ||
        (normalizedProgrammeIds.length &&
          !normalizedProgrammeIds.includes(Number(progression.programme_id)))
    )
  ) {
    throw new Error(
      'Selected cohorts must match the study year, semester, and programme.'
    )
  }
  if (lecturerId) {
    const [assignedTypes] = await connection.execute(
      'SELECT cohort_type_id FROM lecturer_cohort_types WHERE lecturer_id = ?',
      [Number(lecturerId)]
    )
    const assignedIds = new Set(
      assignedTypes.map(item => Number(item.cohort_type_id))
    )
    if (
      !assignedIds.size ||
      progressions.some(
        progression => !assignedIds.has(Number(progression.cohort_type_id))
      )
    ) {
      throw new Error(
        'The lecturer is not assigned to teach every selected cohort type.'
      )
    }
  }

  if (examDate) {
    const date = String(examDate).slice(0, 10)
    if (
      date < String(period.start_date).slice(0, 10) ||
      date > String(period.end_date).slice(0, 10) ||
      date < String(period.academic_start_date).slice(0, 10) ||
      date > String(period.academic_end_date).slice(0, 10)
    ) {
      throw new Error(
        'The exam date must fall within the selected semester and academic year.'
      )
    }
  }

  return {
    period,
    unit,
    progressions,
    expectedStudents: progressions.reduce(
      (total, progression) => total + Number(progression.student_count),
      0
    )
  }
}

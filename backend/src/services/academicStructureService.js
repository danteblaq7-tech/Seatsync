import {
  createRow,
  deleteRow,
  findById,
  listRows,
  rawQuery,
  updateRow
} from '../repositories/sqlRepository.js'

const serialize = row => ({
  ...row,
  facultyId: row.facultyId ?? row.faculty_id,
  departmentId: row.departmentId ?? row.department_id,
  academicYearId: row.academicYearId ?? row.academic_year_id,
  semesterId: row.semesterId ?? row.semester_id,
  semesterTypeId: row.semesterTypeId ?? row.semester_type_id,
  programmeId: row.programmeId ?? row.programme_id,
  venueTypeId: row.venueTypeId ?? row.venue_type_id,
  courseId: row.courseId ?? row.course_id,
  lecturerId: row.lecturerId ?? row.lecturer_id,
  cohortId: row.cohortId ?? row.cohort_id,
  venueId: row.venueId ?? row.venue_id,
  createdAt: row.createdAt ?? row.created_at,
  updatedAt: row.updatedAt ?? row.updated_at,
  isActive: row.isActive ?? row.is_active,
  isCurrent: row.isCurrent ?? row.is_current,
  studentCount: row.studentCount ?? row.student_count,
  capacity: row.capacity ?? row.capacity,
  durationYears: row.durationYears ?? row.duration_years,
  yearNumber: row.yearNumber ?? row.year_number,
  semesterStream: row.semesterStream ?? row.semester_stream,
  programmeId: row.programmeId ?? row.programme_id,
  semesterId: row.semesterId ?? row.semester_id,
  yearLevel: row.yearLevel ?? row.year_level,
  startDate: row.startDate ?? row.start_date,
  endDate: row.endDate ?? row.end_date,
  startYear: row.startYear ?? row.start_year,
  endYear: row.endYear ?? row.end_year
})

export const normalizeAcademicYearPayload = payload => {
  const next = { ...payload }

  if (next.start_year !== undefined && next.start_date === undefined) {
    const year = Number(next.start_year)
    next.start_date = Number.isFinite(year) ? `${year}-01-01` : next.start_date
  }

  if (next.end_year !== undefined && next.end_date === undefined) {
    const year = Number(next.end_year)
    next.end_date = Number.isFinite(year) ? `${year}-12-31` : next.end_date
  }

  if (next.startDate && !next.start_date) next.start_date = next.startDate
  if (next.endDate && !next.end_date) next.end_date = next.endDate

  delete next.start_year
  delete next.end_year
  delete next.startYear
  delete next.endYear
  delete next.is_current

  return next
}

export const normalizeSemesterPayload = payload => {
  const next = { ...payload }

  if (next.semester_number !== undefined && next.number === undefined) {
    const number = Number(next.semester_number)
    next.number = Number.isFinite(number) ? number : 1
  }

  if (next.semesterNumber !== undefined && next.number === undefined) {
    const number = Number(next.semesterNumber)
    next.number = Number.isFinite(number) ? number : 1
  }
  if (next.semesterTypeId !== undefined && next.semester_type_id === undefined) {
    next.semester_type_id = next.semesterTypeId
  }

  delete next.semester_number
  delete next.semesterNumber
  delete next.semesterTypeId

  if (next.startDate && !next.start_date) next.start_date = next.startDate
  if (next.endDate && !next.end_date) next.end_date = next.endDate
  delete next.startDate
  delete next.endDate

  return next
}

const toDateString = value => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  const text = String(value)
  const isoDate = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoDate) return isoDate

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime())
    ? text
    : parsed.toISOString().slice(0, 10)
}

export const listFaculties = async () =>
  (await listRows('faculties')).map(serialize)
export const createFaculty = async payload => {
  await validateAcademicDuplicate('faculty', payload)
  const row = await createRow('faculties', payload)
  return row ? serialize(row) : null
}
export const getFaculty = async id => {
  const row = await findById('faculties', id)
  return row ? serialize(row) : null
}
export const updateFaculty = async (id, updates) => {
  const row = await updateRow('faculties', id, updates)
  return row ? serialize(row) : null
}

export const listDepartments = async () =>
  (await listRows('departments')).map(serialize)
export const createDepartment = async payload => {
  await validateAcademicDuplicate('department', payload)
  const row = await createRow('departments', payload)
  return row ? serialize(row) : null
}
export const getDepartment = async id => {
  const row = await findById('departments', id)
  return row ? serialize(row) : null
}
export const updateDepartment = async (id, updates) => {
  const row = await updateRow('departments', id, updates)
  return row ? serialize(row) : null
}

export const listProgrammes = async () =>
  (await listRows('programmes')).map(serialize)
const syncProgrammeCohortTypes = async programme => {
  const duration = Number(programme.duration_years ?? programme.durationYears)
  if (!Number.isInteger(duration) || duration < 1) {
    throw new Error('Programme duration must be a positive whole number.')
  }
  const [semesterTypes] = await rawQuery(
    'SELECT number FROM semester_types WHERE is_active = TRUE ORDER BY number'
  )
  for (let studyYear = 1; studyYear <= duration; studyYear += 1) {
    for (const semesterType of semesterTypes) {
      await rawQuery(
        `INSERT INTO cohort_types
          (programme_id, name, study_year, semester_number, is_active)
         VALUES (?, ?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = TRUE`,
        [
          Number(programme.id),
          `${programme.code} ${studyYear}.${semesterType.number}`,
          studyYear,
          Number(semesterType.number)
        ]
      )
    }
  }
}
const validateProgrammeDuration = value => {
  if (value === undefined || value === null || value === '') return
  const duration = Number(value)
  if (!Number.isInteger(duration) || duration < 1) {
    throw new Error('Programme duration must be a positive whole number.')
  }
}
export const createProgramme = async payload => {
  validateProgrammeDuration(payload.duration_years ?? payload.durationYears)
  await validateAcademicDuplicate('programme', payload)
  const row = await createRow('programmes', payload)
  if (row) await syncProgrammeCohortTypes(row)
  return row ? serialize(row) : null
}
export const getProgramme = async id => {
  const row = await findById('programmes', id)
  return row ? serialize(row) : null
}
export const updateProgramme = async (id, updates) => {
  validateProgrammeDuration(updates.duration_years ?? updates.durationYears)
  const row = await updateRow('programmes', id, updates)
  if (row) await syncProgrammeCohortTypes(row)
  return row ? serialize(row) : null
}

export const listAcademicYears = async () =>
  (await listRows('academic_years')).map(serialize)
export const createAcademicYear = async payload => {
  const normalizedPayload = normalizeAcademicYearPayload(payload)
  await validateAcademicDuplicate('academicYear', normalizedPayload)
  const row = await createRow('academic_years', normalizedPayload)
  return row ? serialize(row) : null
}
export const getAcademicYear = async id => {
  const row = await findById('academic_years', id)
  return row ? serialize(row) : null
}
export const updateAcademicYear = async (id, updates) => {
  const row = await updateRow('academic_years', id, updates)
  return row ? serialize(row) : null
}

export const listSemesters = async () =>
  (await listRows('semesters')).map(serialize)
export const createSemester = async payload => {
  const normalizedPayload = normalizeSemesterPayload(payload)
  if (!normalizedPayload.academic_year_id) {
    throw new Error('An academic year is required before creating a semester.')
  }
  let semesterTypeId = Number(normalizedPayload.semester_type_id)
  if (!semesterTypeId && normalizedPayload.number) {
    const [legacyType] = await rawQuery(
      'SELECT id FROM semester_types WHERE number = ? AND is_active = TRUE LIMIT 1',
      [Number(normalizedPayload.number)]
    )
    semesterTypeId = Number(legacyType?.id)
  }
  const [semesterTypes] = await rawQuery(
    'SELECT id, name, number FROM semester_types WHERE id = ? AND is_active = TRUE',
    [semesterTypeId]
  )
  const semesterType = semesterTypes?.[0]
  if (!semesterType) {
    throw new Error('Select an active reusable semester type.')
  }
  normalizedPayload.semester_type_id = semesterType.id
  normalizedPayload.number = semesterType.number
  normalizedPayload.name = semesterType.name
  await validateAcademicDuplicate('semester', normalizedPayload)

  const academicYear = await findById(
    'academic_years',
    normalizedPayload.academic_year_id
  )
  const academicStartDate = academicYear?.startDate ?? academicYear?.start_date
  const academicEndDate = academicYear?.endDate ?? academicYear?.end_date

  if (!academicStartDate || !academicEndDate) {
    throw new Error('The selected academic year does not have valid dates.')
  }

  if (!normalizedPayload.start_date || !normalizedPayload.end_date) {
    const semesterNumber = Number(normalizedPayload.number) || 1
    const academicStart = toDateString(academicStartDate)
    const academicEnd = toDateString(academicEndDate)
    const firstSemesterEnd = `${academicStart.slice(0, 4)}-12-31`
    const secondSemesterStart = `${academicEnd.slice(0, 4)}-01-01`

    normalizedPayload.start_date =
      semesterNumber === 1 ? academicStart : secondSemesterStart
    normalizedPayload.end_date =
      semesterNumber === 1 ? firstSemesterEnd : academicEnd
  }

  normalizedPayload.start_date = toDateString(normalizedPayload.start_date)
  normalizedPayload.end_date = toDateString(normalizedPayload.end_date)

  const academicStart = toDateString(academicStartDate)
  const academicEnd = toDateString(academicEndDate)
  if (
    normalizedPayload.start_date < academicStart ||
    normalizedPayload.end_date > academicEnd ||
    normalizedPayload.start_date > normalizedPayload.end_date
  ) {
    throw new Error(
      'Semester dates must fall within the selected academic year.'
    )
  }

  const row = await createRow('semesters', normalizedPayload)
  return row ? serialize(row) : null
}
export const getSemester = async id => {
  const row = await findById('semesters', id)
  return row ? serialize(row) : null
}
export const updateSemester = async (id, updates) => {
  const current = await findById('semesters', id)
  if (!current) return null
  const normalized = normalizeSemesterPayload(updates)
  const academicYearId = Number(
    normalized.academic_year_id ?? current.academic_year_id
  )
  const hasExplicitSemesterType = normalized.semester_type_id !== undefined
  let semesterTypeId = Number(
    hasExplicitSemesterType
      ? normalized.semester_type_id
      : current.semester_type_id
  )
  if (!hasExplicitSemesterType && normalized.number) {
    const [legacyType] = await rawQuery(
      'SELECT id FROM semester_types WHERE number = ? AND is_active = TRUE LIMIT 1',
      [Number(normalized.number)]
    )
    semesterTypeId = Number(legacyType?.id)
  }
  const [types] = await rawQuery(
    'SELECT id, name, number FROM semester_types WHERE id = ? AND is_active = TRUE',
    [semesterTypeId]
  )
  const semesterType = types[0]
  if (!semesterType) throw new Error('Select an active semester type.')
  const academicYear = await findById('academic_years', academicYearId)
  const academicStart = academicYear?.startDate ?? academicYear?.start_date
  const academicEnd = academicYear?.endDate ?? academicYear?.end_date
  if (!academicStart || !academicEnd) {
    throw new Error('The selected academic year does not have valid dates.')
  }
  const startDate = toDateString(
    normalized.start_date ?? current.start_date ?? current.startDate
  )
  const endDate = toDateString(
    normalized.end_date ?? current.end_date ?? current.endDate
  )
  if (
    !startDate ||
    !endDate ||
    startDate < toDateString(academicStart) ||
    endDate > toDateString(academicEnd) ||
    startDate > endDate
  ) {
    throw new Error(
      'Semester dates must be valid and fall within the selected academic year.'
    )
  }
  const next = {
    ...normalized,
    academic_year_id: academicYearId,
    semester_type_id: semesterType.id,
    number: semesterType.number,
    name: semesterType.name,
    start_date: startDate,
    end_date: endDate
  }
  await validateAcademicDuplicate('semester', next, id)
  const row = await updateRow('semesters', id, next)
  return row ? serialize(row) : null
}

const duplicateRules = {
  faculty: {
    table: 'faculties',
    fields: ['name', 'code']
  },
  department: {
    table: 'departments',
    fields: ['name', 'code']
  },
  programme: {
    table: 'programmes',
    fields: ['name', 'code']
  },
  academicYear: {
    table: 'academic_years',
    fields: ['name']
  },
  semester: {
    table: 'semesters',
    fields: ['name', 'number'],
    scope: ['academic_year_id']
  },
  cohort: {
    table: 'cohorts',
    fields: ['name'],
    scope: ['programme_id', 'academic_year_id']
  },
  unit: {
    table: 'units',
    fields: ['name', 'code']
  }
}

export const validateAcademicDuplicate = async (
  entity,
  payload,
  excludeId = null
) => {
  const rule = duplicateRules[entity]
  if (!rule) throw new Error('Unknown academic record type.')
  const values = { ...payload }
  if (entity === 'academicYear')
    Object.assign(values, normalizeAcademicYearPayload(payload))
  if (entity === 'semester')
    Object.assign(values, normalizeSemesterPayload(payload))
  const fieldPredicates = []
  const fieldParams = []
  for (const field of rule.fields) {
    const value = values[field]
    if (value === undefined || value === null || String(value).trim() === '')
      continue
    fieldPredicates.push(
      `LOWER(TRIM(CAST(\`${field}\` AS CHAR))) = LOWER(TRIM(?))`
    )
    fieldParams.push(String(value).trim())
  }
  if (!fieldPredicates.length) return
  const predicates = [`(${fieldPredicates.join(' OR ')})`]
  const params = [...fieldParams]
  for (const field of rule.scope || []) {
    const value = values[field]
    if (value === undefined || value === null || value === '') continue
    predicates.push(`\`${field}\` = ?`)
    params.push(Number(value))
  }
  if (excludeId) {
    predicates.push('id <> ?')
    params.push(Number(excludeId))
  }
  const selectedColumns = ['id', 'name']
  if (rule.fields.includes('code')) selectedColumns.push('code')
  const matches = await rawQuery(
    `SELECT ${selectedColumns
      .map(column => `\`${column}\``)
      .join(', ')} FROM \`${rule.table}\` WHERE ${predicates.join(
      ' AND '
    )} LIMIT 1`,
    params
  )
  if (matches[0]) {
    const duplicate = matches[0]
    const codeMatch =
      duplicate.code &&
      String(values.code || '')
        .trim()
        .toLowerCase() === String(duplicate.code).trim().toLowerCase()
    throw new Error(
      `${entity === 'academicYear' ? 'Academic year' : entity} ${
        codeMatch ? `code "${duplicate.code}"` : `name "${duplicate.name}"`
      } already exists.`
    )
  }
}

export const updateAcademicRecord = async (entity, id, payload) => {
  await validateAcademicDuplicate(entity, payload, id)
  const updates = {
    faculty: updateFaculty,
    department: updateDepartment,
    programme: updateProgramme,
    academicYear: updateAcademicYear,
    semester: updateSemester,
    cohort: updateCohort
  }[entity]
  if (!updates) throw new Error('Unknown academic record type.')
  if (entity === 'academicYear') {
    return updates(id, normalizeAcademicYearPayload(payload))
  }
  if (entity === 'semester') {
    return updates(id, normalizeSemesterPayload(payload))
  }
  return updates(id, payload)
}

const academicDeleteReferences = {
  faculty: [
    ['departments', 'faculty_id'],
    ['lecturer_faculties', 'faculty_id']
  ],
  department: [
    ['programmes', 'department_id'],
    ['units', 'department_id'],
    ['unit_departments', 'department_id'],
    ['lecturers', 'department_id'],
    ['lecturer_departments', 'department_id']
  ],
  programme: [
    ['cohorts', 'programme_id'],
    ['students', 'programme_id'],
    ['unit_programmes', 'programme_id'],
    ['lecturer_programmes', 'programme_id']
  ],
  academicYear: [
    ['semesters', 'academic_year_id'],
    ['cohorts', 'academic_year_id'],
    ['timetable_entries', 'academic_year_id'],
    ['exams', 'academic_year_id'],
    ['academic_events', 'academic_year_id']
  ],
  semester: [
    ['units', 'semester_id'],
    ['timetable_entries', 'semester_id'],
    ['exams', 'semester_id'],
    ['academic_events', 'semester_id'],
    ['cohort_courses', 'semester_id']
  ],
  cohort: [
    ['students', 'cohort_id'],
    ['timetable_entry_cohorts', 'cohort_id'],
    ['timetable_entries', 'cohort_id'],
    ['exam_cohorts', 'cohort_id'],
    ['cohort_courses', 'cohort_id'],
    ['cohort_representatives', 'cohort_id'],
    ['academic_events', 'cohort_id']
  ],
  unit: [
    ['timetable_entries', 'unit_id'],
    ['exams', 'unit_id'],
    ['academic_events', 'unit_id'],
    ['cohort_courses', 'unit_id'],
    ['unit_departments', 'unit_id'],
    ['unit_programmes', 'unit_id'],
    ['lecturer_units', 'unit_id']
  ]
}

export const getAcademicDeleteBlockers = async (entity, id) => {
  const references = academicDeleteReferences[entity]
  if (!references) throw new Error('Unknown academic record type.')
  const blockers = {}
  for (const [table, column] of references) {
    const [row] = await rawQuery(
      `SELECT COUNT(*) AS total FROM \`${table}\` WHERE \`${column}\` = ?`,
      [Number(id)]
    )
    if (Number(row?.total || 0) > 0) blockers[table] = Number(row.total)
  }
  return blockers
}

export const deleteAcademicRecord = async (entity, id) => {
  const table = duplicateRules[entity]?.table
  if (!table) throw new Error('Unknown academic record type.')
  const blockers = await getAcademicDeleteBlockers(entity, id)
  if (Object.keys(blockers).length) {
    const references = Object.entries(blockers)
      .map(([name, count]) => `${count} ${name.replaceAll('_', ' ')}`)
      .join(', ')
    throw new Error(
      `Cannot delete this ${entity}: it is used by ${references}.`
    )
  }
  return deleteRow(table, id)
}

const pageOptions = ({ page = 1, limit = 20 } = {}) => {
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20))
  return {
    page: pageNumber,
    limit: pageSize,
    offset: (pageNumber - 1) * pageSize
  }
}

export const listCohorts = async (options, user) => {
  const roles = Array.isArray(user?.roles)
    ? user.roles
    : user?.roles
    ? [user.roles]
    : []
  const representativeScope =
    roles.includes('CLASS_REP') && !roles.includes('ADMIN')
      ? 'AND EXISTS (SELECT 1 FROM cohort_representatives cr JOIN students s ON s.id = cr.student_id WHERE cr.cohort_id = c.id AND s.user_id = ? AND cr.is_active = TRUE AND (cr.end_date IS NULL OR cr.end_date >= CURDATE()))'
      : ''
  const representativeParams = representativeScope ? [user.id] : []
  if (!options || (options.page === undefined && options.limit === undefined)) {
    return (
      await rawQuery(`
      SELECT c.*, p.department_id,
        (SELECT COUNT(*) FROM students submitted
         WHERE submitted.cohort_id = c.id) +
        (SELECT COUNT(*) FROM cohort_membership_requests pending
         WHERE pending.cohort_id = c.id AND pending.status = 'PENDING')
          AS submitted_profile_count,
        (SELECT COUNT(*) FROM cohort_membership_requests pending
         WHERE pending.cohort_id = c.id AND pending.status = 'PENDING')
          AS pending_profile_count,
        (SELECT ct.name FROM cohort_progressions cp
         JOIN cohort_types ct ON ct.id = cp.cohort_type_id
         JOIN semesters s ON s.id = cp.semester_id
         WHERE cp.cohort_id = c.id
         ORDER BY s.start_date DESC, cp.id DESC LIMIT 1) AS current_cohort_type_name,
        (SELECT s.name FROM cohort_progressions cp
         JOIN semesters s ON s.id = cp.semester_id
         WHERE cp.cohort_id = c.id
         ORDER BY s.start_date DESC, cp.id DESC LIMIT 1) AS current_semester_name,
        (SELECT ay.name FROM cohort_progressions cp
         JOIN academic_years ay ON ay.id = cp.academic_year_id
         JOIN semesters s ON s.id = cp.semester_id
         WHERE cp.cohort_id = c.id
         ORDER BY s.start_date DESC, cp.id DESC LIMIT 1) AS current_academic_year_name
      FROM cohorts c
      LEFT JOIN programmes p ON p.id = c.programme_id
      WHERE c.is_active = TRUE ${representativeScope}
      ORDER BY c.id
    `, representativeParams)
    ).map(serialize)
  }

  const { page, limit, offset } = pageOptions(options)
  const clauses = ['c.is_active = TRUE']
  if (representativeScope) clauses.push(representativeScope.replace(/^AND /, ''))
  const params = [...representativeParams]
  if (options.search) {
    clauses.push('(c.name LIKE ? OR p.name LIKE ? OR p.code LIKE ?)')
    params.push(
      `%${options.search}%`,
      `%${options.search}%`,
      `%${options.search}%`
    )
  }
  if (options.programme) {
    clauses.push('c.programme_id = ?')
    params.push(Number(options.programme))
  }
  if (options.academicYear) {
    clauses.push(
      'EXISTS (SELECT 1 FROM cohort_progressions cp_filter WHERE cp_filter.cohort_id = c.id AND cp_filter.academic_year_id = ?)'
    )
    params.push(Number(options.academicYear))
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const sortColumns = {
    name: 'c.name',
    students: 'c.student_count',
    year: '(SELECT MAX(cp_sort.academic_year_id) FROM cohort_progressions cp_sort WHERE cp_sort.cohort_id = c.id)'
  }
  const orderBy = sortColumns[options.sort] || 'c.name'
  const direction =
    String(options.direction).toLowerCase() === 'desc' ? 'DESC' : 'ASC'
  const rows = await rawQuery(
    `SELECT c.*, p.department_id,
      (SELECT COUNT(*) FROM students submitted
       WHERE submitted.cohort_id = c.id) +
      (SELECT COUNT(*) FROM cohort_membership_requests pending
       WHERE pending.cohort_id = c.id AND pending.status = 'PENDING')
        AS submitted_profile_count,
      (SELECT COUNT(*) FROM cohort_membership_requests pending
       WHERE pending.cohort_id = c.id AND pending.status = 'PENDING')
        AS pending_profile_count,
      (SELECT ct.name FROM cohort_progressions cp
       JOIN cohort_types ct ON ct.id = cp.cohort_type_id
       JOIN semesters s ON s.id = cp.semester_id
       WHERE cp.cohort_id = c.id
       ORDER BY s.start_date DESC, cp.id DESC LIMIT 1) AS current_cohort_type_name,
      (SELECT s.name FROM cohort_progressions cp
       JOIN semesters s ON s.id = cp.semester_id
       WHERE cp.cohort_id = c.id
       ORDER BY s.start_date DESC, cp.id DESC LIMIT 1) AS current_semester_name,
      (SELECT ay.name FROM cohort_progressions cp
       JOIN academic_years ay ON ay.id = cp.academic_year_id
       JOIN semesters s ON s.id = cp.semester_id
       WHERE cp.cohort_id = c.id
       ORDER BY s.start_date DESC, cp.id DESC LIMIT 1) AS current_academic_year_name
     FROM cohorts c LEFT JOIN programmes p ON p.id = c.programme_id ${where} ORDER BY ${orderBy} ${direction}, c.id LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )
  const [{ total = 0 } = {}] = await rawQuery(
    `SELECT COUNT(*) AS total FROM cohorts c LEFT JOIN programmes p ON p.id = c.programme_id ${where}`,
    params
  )
  return {
    data: rows.map(serialize),
    pagination: {
      page,
      limit,
      totalItems: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / limit))
    }
  }
}
export const createCohort = async payload => {
  await validateAcademicDuplicate('cohort', payload)
  const row = await createRow('cohorts', payload)
  return row ? serialize(row) : null
}
export const getCohort = async id => {
  const row = await findById('cohorts', id)
  return row ? serialize(row) : null
}
export const updateCohort = async (id, updates) => {
  const row = await updateRow('cohorts', id, updates)
  return row ? serialize(row) : null
}
export const deleteCohort = async id => deleteRow('cohorts', id)
export const archiveCohort = async id => {
  const row = await updateRow('cohorts', id, { is_active: false })
  return row ? serialize(row) : null
}
export const getCohortDeletionBlockers = async id => {
  const [references] = await rawQuery(
    `SELECT
       (SELECT COUNT(*) FROM timetable_entry_cohorts WHERE cohort_id = ?) AS timetable_entries,
       (SELECT COUNT(*) FROM timetable_entries WHERE cohort_id = ?) AS primary_timetable_entries,
       (SELECT COUNT(*) FROM students WHERE cohort_id = ?) AS students,
       (SELECT COUNT(*) FROM cohort_courses WHERE cohort_id = ?) AS cohort_courses,
       (SELECT COUNT(*) FROM exam_cohorts WHERE cohort_id = ?) AS exams,
       (SELECT COUNT(*) FROM cohort_representatives WHERE cohort_id = ?) AS representatives,
       (SELECT COUNT(*) FROM academic_events WHERE cohort_id = ?) AS academic_events`,
    [id, id, id, id, id, id, id]
  )
  return Object.fromEntries(
    Object.entries(references || {}).filter(([, count]) => Number(count) > 0)
  )
}

export const listStudents = async () =>
  (
    await rawQuery(`
    SELECT s.*, u.first_name, u.last_name, u.email, u.phone_number
    FROM students s
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.id
  `)
  ).map(row => ({
    ...serialize(row),
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Student',
    email: row.email,
    phoneNumber: row.phone_number
  }))
export const createStudent = async payload => {
  const row = await createRow('students', payload)
  return row ? serialize(row) : null
}
export const getStudent = async id => {
  const row = await findById('students', id)
  return row ? serialize(row) : null
}
export const updateStudent = async (id, updates) => {
  const row = await updateRow('students', id, updates)
  return row ? serialize(row) : null
}
export const deleteStudent = async id => deleteRow('students', id)

export const listLecturers = async user => {
  const isSelf = (user?.roles || []).includes('LECTURER')
  return (
    await rawQuery(
      `
    SELECT l.*, u.first_name, u.last_name, u.email, u.phone_number,
      GROUP_CONCAT(DISTINCT lp.programme_id) AS programme_ids,
      GROUP_CONCAT(DISTINCT ld.department_id) AS department_ids,
      GROUP_CONCAT(DISTINCT lu.unit_id) AS unit_ids,
      GROUP_CONCAT(DISTINCT CONCAT(unit.code, ' - ', unit.name) SEPARATOR ' | ') AS unit_names
    FROM lecturers l
    LEFT JOIN users u ON u.id = l.user_id
    LEFT JOIN lecturer_programmes lp ON lp.lecturer_id = l.id
    LEFT JOIN lecturer_departments ld ON ld.lecturer_id = l.id
    LEFT JOIN lecturer_units lu ON lu.lecturer_id = l.id
    LEFT JOIN units unit ON unit.id = lu.unit_id
    ${isSelf ? 'WHERE l.user_id = ?' : ''}
    GROUP BY l.id
    ORDER BY l.id
  `,
      isSelf ? [user.id] : []
    )
  ).map(row => ({
    ...serialize(row),
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
    phoneNumber: row.phone_number,
    programmeIds: row.programme_ids
      ? String(row.programme_ids).split(',').map(Number)
      : [],
    departmentIds: row.department_ids
      ? String(row.department_ids).split(',').map(Number)
      : [],
    unitIds: row.unit_ids ? String(row.unit_ids).split(',').map(Number) : [],
    units: row.unit_names ? String(row.unit_names).split(' | ') : []
  }))
}
export const getLecturer = async id => {
  const row = await findById('lecturers', id)
  return row ? serialize(row) : null
}
export const updateLecturer = async (id, updates) => {
  const row = await updateRow('lecturers', id, updates)
  return row ? serialize(row) : null
}
export const deleteLecturer = async id => deleteRow('lecturers', id)

export const listCourses = async (user, options) => {
  const roles = Array.isArray(user?.roles) ? user.roles : []
  let filter = ''
  const params = []
  if (roles.includes('STUDENT') || roles.includes('CLASS_REP')) {
    filter =
      'WHERE EXISTS (SELECT 1 FROM students s JOIN unit_programmes student_up ON student_up.programme_id = s.programme_id WHERE s.user_id = ? AND student_up.unit_id = u.id)'
    params.push(user.id)
  } else if (roles.includes('LECTURER')) {
    filter =
      'WHERE EXISTS (SELECT 1 FROM lecturer_units lu_user JOIN lecturers l_user ON l_user.id = lu_user.lecturer_id WHERE l_user.user_id = ? AND lu_user.unit_id = u.id)'
    params.push(user.id)
  }

  const paginated =
    options && (options.page !== undefined || options.limit !== undefined)
  const clauses = []
  const queryParams = [...params]
  if (options?.search) {
    clauses.push('(u.code LIKE ? OR u.name LIKE ? OR u.description LIKE ?)')
    const search = `%${options.search}%`
    queryParams.push(search, search, search)
  }
  if (options?.department) {
    clauses.push(
      'EXISTS (SELECT 1 FROM unit_departments ud_filter WHERE ud_filter.unit_id = u.id AND ud_filter.department_id = ?)'
    )
    queryParams.push(Number(options.department))
  }
  if (options?.programme) {
    clauses.push(
      'EXISTS (SELECT 1 FROM unit_programmes up_filter WHERE up_filter.unit_id = u.id AND up_filter.programme_id = ?)'
    )
    queryParams.push(Number(options.programme))
  }
  if (options?.year) {
    clauses.push('u.year_level = ?')
    queryParams.push(Number(options.year))
  }
  const filterParts = [filter.replace(/^WHERE\s*/i, ''), ...clauses].filter(
    Boolean
  )
  const where = filterParts.length ? `WHERE ${filterParts.join(' AND ')}` : ''
  const sortColumns = { name: 'u.name', code: 'u.code', year: 'u.year_level' }
  const orderBy = sortColumns[options?.sort] || 'u.name'
  const direction =
    String(options?.direction).toLowerCase() === 'desc' ? 'DESC' : 'ASC'
  const pagination = paginated ? pageOptions(options) : null
  const sql = `
    SELECT u.*, GROUP_CONCAT(DISTINCT up.programme_id) AS programme_ids,
      GROUP_CONCAT(DISTINCT ud.department_id) AS department_ids
    FROM units u
    LEFT JOIN unit_programmes up ON up.unit_id = u.id
    LEFT JOIN unit_departments ud ON ud.unit_id = u.id
    ${where}
    GROUP BY u.id
    ORDER BY ${orderBy} ${direction}, u.id
    ${paginated ? 'LIMIT ? OFFSET ?' : ''}
  `
  const rows = await rawQuery(
    sql,
    paginated
      ? [...queryParams, pagination.limit, pagination.offset]
      : queryParams
  )
  const mapRows = result =>
    result.map(row => ({
      ...serialize(row),
      programmeIds: row.programme_ids
        ? String(row.programme_ids).split(',').map(Number)
        : [],
      departmentIds: row.department_ids
        ? String(row.department_ids).split(',').map(Number)
        : []
    }))
  if (!paginated) return mapRows(rows)
  const [{ total = 0 } = {}] = await rawQuery(
    `SELECT COUNT(DISTINCT u.id) AS total FROM units u LEFT JOIN unit_programmes up ON up.unit_id = u.id LEFT JOIN unit_departments ud ON ud.unit_id = u.id ${where}`,
    queryParams
  )
  return {
    data: mapRows(rows),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalItems: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / pagination.limit))
    }
  }
}
export const createCourse = async payload => {
  const normalizedPayload = { ...payload }
  if (
    normalizedPayload.course_level !== undefined &&
    normalizedPayload.year_level === undefined
  ) {
    normalizedPayload.year_level = normalizedPayload.course_level
  }
  delete normalizedPayload.course_level
  delete normalizedPayload.credit_hours
  if (
    normalizedPayload.semesterTypeId !== undefined &&
    normalizedPayload.semester_type_id === undefined
  ) {
    normalizedPayload.semester_type_id = normalizedPayload.semesterTypeId
  }
  delete normalizedPayload.semesterTypeId
  const programmeIds = Array.isArray(normalizedPayload.programme_ids)
    ? normalizedPayload.programme_ids.map(Number).filter(Boolean)
    : normalizedPayload.programme_id
    ? [Number(normalizedPayload.programme_id)]
    : []
  const departmentIds = Array.isArray(normalizedPayload.department_ids)
    ? normalizedPayload.department_ids.map(Number).filter(Boolean)
    : normalizedPayload.department_id
    ? [Number(normalizedPayload.department_id)]
    : []
  await validateAcademicDuplicate('unit', normalizedPayload)
  delete normalizedPayload.programme_ids
  delete normalizedPayload.programme_id
  delete normalizedPayload.department_ids
  delete normalizedPayload.department_id
  normalizedPayload.department_id = departmentIds[0] || null
  let semesterTypeId = Number(normalizedPayload.semester_type_id)
  if (!semesterTypeId && normalizedPayload.semester_id) {
    const [legacySemester] = await rawQuery(
      'SELECT semester_type_id FROM semesters WHERE id = ?',
      [Number(normalizedPayload.semester_id)]
    )
    semesterTypeId = Number(legacySemester?.semester_type_id)
  }
  if (!semesterTypeId) {
    return {
      validationError: 'Select a reusable semester type for the unit.'
    }
  }
  const [semesterTypes] = await rawQuery(
    'SELECT id FROM semester_types WHERE id = ? AND is_active = TRUE',
    [semesterTypeId]
  )
  if (!semesterTypes.length) {
    return { validationError: 'The selected semester type is not active.' }
  }
  normalizedPayload.semester_type_id = semesterTypeId
  if (payload.semester_type_id || payload.semesterTypeId) {
    normalizedPayload.semester_id = null
  }

  const selectionError = await validateUnitAcademicSelections(
    departmentIds,
    programmeIds
  )
  if (selectionError) return { validationError: selectionError }
  const studyYearError = await validateUnitStudyYear(
    normalizedPayload.year_level,
    programmeIds
  )
  if (studyYearError) return { validationError: studyYearError }

  const row = await createRow('units', normalizedPayload)
  if (!row) return null

  for (const programmeId of programmeIds) {
    await rawQuery(
      'INSERT INTO unit_programmes (unit_id, programme_id) VALUES (?, ?)',
      [row.id, programmeId]
    )
  }
  for (const departmentId of departmentIds) {
    await rawQuery(
      'INSERT INTO unit_departments (unit_id, department_id) VALUES (?, ?)',
      [row.id, departmentId]
    )
  }

  return {
    ...serialize(row),
    programmeIds
  }
}
export const getCourse = async id => {
  const courses = await listCourses({ roles: ['ADMIN'] })
  return courses.find(course => Number(course.id) === Number(id)) || null
}
export const updateCourse = async (id, updates) => {
  const normalizedPayload = { ...updates }
  if (
    normalizedPayload.course_level !== undefined &&
    normalizedPayload.year_level === undefined
  ) {
    normalizedPayload.year_level = normalizedPayload.course_level
  }
  delete normalizedPayload.course_level
  delete normalizedPayload.credit_hours
  if (
    normalizedPayload.semesterTypeId !== undefined &&
    normalizedPayload.semester_type_id === undefined
  ) {
    normalizedPayload.semester_type_id = normalizedPayload.semesterTypeId
  }
  delete normalizedPayload.semesterTypeId
  if (normalizedPayload.semester_type_id !== undefined) {
    const typeId = Number(normalizedPayload.semester_type_id)
    const [semesterTypes] = await rawQuery(
      'SELECT id FROM semester_types WHERE id = ? AND is_active = TRUE',
      [typeId]
    )
    if (!semesterTypes.length) {
      return { validationError: 'The selected semester type is not active.' }
    }
    normalizedPayload.semester_type_id = typeId
    normalizedPayload.semester_id = null
  }
  const hasProgrammeUpdate =
    Array.isArray(normalizedPayload.programme_ids) ||
    normalizedPayload.programme_id !== undefined
  const hasDepartmentUpdate =
    Array.isArray(normalizedPayload.department_ids) ||
    normalizedPayload.department_id !== undefined
  const programmeIds = Array.isArray(normalizedPayload.programme_ids)
    ? normalizedPayload.programme_ids.map(Number).filter(Boolean)
    : normalizedPayload.programme_id
    ? [Number(normalizedPayload.programme_id)]
    : []
  const departmentIds = Array.isArray(normalizedPayload.department_ids)
    ? normalizedPayload.department_ids.map(Number).filter(Boolean)
    : normalizedPayload.department_id
    ? [Number(normalizedPayload.department_id)]
    : []
  delete normalizedPayload.programme_ids
  delete normalizedPayload.programme_id
  delete normalizedPayload.department_ids
  delete normalizedPayload.department_id
  await validateAcademicDuplicate('unit', normalizedPayload, id)
  if (hasDepartmentUpdate)
    normalizedPayload.department_id = departmentIds[0] || null

  const existingCourse = await getCourse(id)
  if (!existingCourse) return null
  if (hasDepartmentUpdate || hasProgrammeUpdate) {
    const selectionError = await validateUnitAcademicSelections(
      hasDepartmentUpdate
        ? departmentIds
        : (existingCourse?.departmentIds || []).map(Number),
      hasProgrammeUpdate
        ? programmeIds
        : (existingCourse?.programmeIds || []).map(Number)
    )
    if (selectionError) return { validationError: selectionError }
  }
  const studyYearError = await validateUnitStudyYear(
    normalizedPayload.year_level ?? existingCourse?.year_level,
    hasProgrammeUpdate
      ? programmeIds
      : (existingCourse?.programmeIds || []).map(Number)
  )
  if (studyYearError) return { validationError: studyYearError }

  const row = await updateRow('units', id, normalizedPayload)
  if (!row) return null

  if (hasProgrammeUpdate) {
    await rawQuery('DELETE FROM unit_programmes WHERE unit_id = ?', [id])
    for (const programmeId of programmeIds) {
      await rawQuery(
        'INSERT INTO unit_programmes (unit_id, programme_id) VALUES (?, ?)',
        [id, programmeId]
      )
    }
  }
  if (hasDepartmentUpdate) {
    await rawQuery('DELETE FROM unit_departments WHERE unit_id = ?', [id])
    for (const departmentId of departmentIds) {
      await rawQuery(
        'INSERT INTO unit_departments (unit_id, department_id) VALUES (?, ?)',
        [id, departmentId]
      )
    }
  }

  return getCourse(id)
}

const validateUnitAcademicSelections = async (departmentIds, programmeIds) => {
  if (!departmentIds.length || !programmeIds.length) {
    return 'Select at least one department and one programme for the unit.'
  }
  const departmentPlaceholders = departmentIds.map(() => '?').join(',')
  const existingDepartments = await rawQuery(
    `SELECT id FROM departments WHERE id IN (${departmentPlaceholders})`,
    departmentIds
  )
  if (existingDepartments.length !== new Set(departmentIds).size) {
    return 'One or more selected departments no longer exist.'
  }
  const placeholders = programmeIds.map(() => '?').join(',')
  const rows = await rawQuery(
    `SELECT id, department_id FROM programmes WHERE id IN (${placeholders})`,
    programmeIds
  )
  if (rows.length !== new Set(programmeIds).size) {
    return 'One or more selected programmes no longer exist.'
  }
  const departmentSet = new Set(departmentIds.map(Number))
  if (rows.some(row => !departmentSet.has(Number(row.department_id)))) {
    return 'Every selected programme must belong to a selected department. Review the department and programme selections.'
  }
  return null
}
const validateUnitStudyYear = async (studyYear, programmeIds) => {
  const year = Number(studyYear)
  if (!Number.isInteger(year) || year < 1) {
    return 'Unit study year must be a positive whole number.'
  }
  const ids = [...new Set(programmeIds.map(Number))]
  if (!ids.length) return 'Select at least one programme for the unit.'
  const rows = await rawQuery(
    `SELECT id, duration_years FROM programmes
     WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  )
  if (
    rows.length !== ids.length ||
    rows.some(programme => year > Number(programme.duration_years))
  ) {
    return 'The unit study year must fit within every selected programme duration.'
  }
  return null
}
export const deleteCourse = async id => deleteRow('units', id)

export const listVenueTypes = async () =>
  (await listRows('venue_types')).map(serialize)
export const createVenueType = async payload => {
  const row = await createRow('venue_types', payload)
  return row ? serialize(row) : null
}
export const getVenueType = async id => {
  const row = await findById('venue_types', id)
  return row ? serialize(row) : null
}
export const updateVenueType = async (id, updates) => {
  const row = await updateRow('venue_types', id, updates)
  return row ? serialize(row) : null
}

export const listVenues = async () => (await listRows('venues')).map(serialize)
export const createVenue = async payload => {
  const normalizedPayload = { ...payload }
  delete normalizedPayload.is_active

  if (!normalizedPayload.code) {
    normalizedPayload.code = `VEN-${Date.now()}`
  }

  const row = await createRow('venues', normalizedPayload)
  return row ? serialize(row) : null
}
export const getVenue = async id => {
  const row = await findById('venues', id)
  return row ? serialize(row) : null
}
export const updateVenue = async (id, updates) => {
  const row = await updateRow('venues', id, updates)
  return row ? serialize(row) : null
}
export const deleteVenue = async id => deleteRow('venues', id)

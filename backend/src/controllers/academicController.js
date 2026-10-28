import { emitSocketEvent } from '../socket/socketEvents.js'
import {
  listFaculties,
  listDepartments,
  listProgrammes,
  listAcademicYears,
  listSemesters,
  listCohorts,
  listStudents,
  listLecturers,
  listCourses,
  listVenueTypes,
  listVenues,
  createFaculty,
  createDepartment,
  createProgramme,
  createAcademicYear,
  createSemester,
  createCohort,
  createStudent,
  createCourse,
  createVenueType,
  createVenue,
  deleteCohort,
  archiveCohort,
  getCohort,
  getCohortDeletionBlockers,
  updateCohort,
  deleteStudent,
  getStudent,
  deleteLecturer,
  getLecturer,
  deleteCourse,
  getCourse,
  updateCourse,
  deleteVenue,
  getVenue,
  updateAcademicRecord,
  deleteAcademicRecord,
  getAcademicDeleteBlockers
} from '../services/academicStructureService.js'
import { createAuditLog } from '../services/security/securityService.js'
import {
  getLecturerAcademicProfile,
  updateLecturerAcademicProfile
} from '../services/auth/authService.js'

const auditRequest = (req, entry) =>
  createAuditLog({
    ...entry,
    userId: req.user?.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  })

export const getFaculties = async (req, res) => {
  res.json({ data: await listFaculties() })
}

export const addFaculty = async (req, res) => {
  try {
    res.status(201).json({ data: await createFaculty(req.body) })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
}

export const getDepartments = async (req, res) => {
  res.json({ data: await listDepartments() })
}

export const addDepartment = async (req, res) => {
  try {
    res.status(201).json({ data: await createDepartment(req.body) })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
}

export const getProgrammes = async (req, res) => {
  res.json({ data: await listProgrammes() })
}

export const addProgramme = async (req, res) => {
  try {
    res.status(201).json({ data: await createProgramme(req.body) })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
}

export const getAcademicYears = async (req, res) => {
  res.json({ data: await listAcademicYears() })
}

export const addAcademicYear = async (req, res) => {
  try {
    res.status(201).json({ data: await createAcademicYear(req.body) })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
}

export const getSemesters = async (req, res) => {
  res.json({ data: await listSemesters() })
}

export const addSemester = async (req, res) => {
  try {
    res.status(201).json({ data: await createSemester(req.body) })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
}

export const getCohorts = async (req, res) => {
  const result = await listCohorts(req.query)
  if (Array.isArray(result)) return res.json({ data: result })
  return res.json(result)
}

export const addCohort = async (req, res) => {
  try {
    res.status(201).json({ data: await createCohort(req.body) })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
}

export const editAcademicRecord = entity => async (req, res) => {
  const getters = {
    faculty: listFaculties,
    department: listDepartments,
    programme: listProgrammes,
    academicYear: listAcademicYears,
    semester: listSemesters,
    cohort: async () => {
      const rows = await listCohorts()
      return Array.isArray(rows) ? rows : rows.data
    }
  }
  try {
    const oldValues = (await getters[entity]()).find(
      item => Number(item.id) === Number(req.params.id)
    )
    if (!oldValues)
      return res.status(404).json({ message: `${entity} not found.` })
    const data = await updateAcademicRecord(entity, req.params.id, req.body)
    await auditRequest(req, {
      action: 'UPDATE',
      entityType: entity === 'academicYear' ? 'academic_year' : entity,
      entityId: req.params.id,
      oldValues,
      newValues: data
    })
    emitSocketEvent('academic:updated', {
      entity: entity === 'academicYear' ? 'academic_year' : entity,
      id: req.params.id,
      record: data
    })
    return res.json({ data })
  } catch (error) {
    return res.status(409).json({ message: error.message })
  }
}

export const removeAcademicRecord = entity => async (req, res) => {
  const getters = {
    faculty: listFaculties,
    department: listDepartments,
    programme: listProgrammes,
    academicYear: listAcademicYears,
    semester: listSemesters,
    cohort: async () => {
      const rows = await listCohorts()
      return Array.isArray(rows) ? rows : rows.data
    }
  }
  try {
    const oldValues = (await getters[entity]()).find(
      item => Number(item.id) === Number(req.params.id)
    )
    if (!oldValues)
      return res.status(404).json({ message: `${entity} not found.` })
    const blockers = await getAcademicDeleteBlockers(entity, req.params.id)
    if (Object.keys(blockers).length) {
      const references = Object.entries(blockers)
        .map(([table, count]) => `${count} ${table.replaceAll('_', ' ')}`)
        .join(', ')
      return res.status(409).json({
        message: `Cannot delete ${entity}: referenced by ${references}. Remove or reassign those records first.`
      })
    }
    const deleted = await deleteAcademicRecord(entity, req.params.id)
    if (deleted) {
      await auditRequest(req, {
        action: 'DELETE',
        entityType: entity === 'academicYear' ? 'academic_year' : entity,
        entityId: req.params.id,
        oldValues
      })
      emitSocketEvent('academic:deleted', {
        entity: entity === 'academicYear' ? 'academic_year' : entity,
        id: req.params.id,
        record: oldValues
      })
    }
    return res.json({ success: Boolean(deleted) })
  } catch (error) {
    return res.status(409).json({ message: error.message })
  }
}

export const editCohort = async (req, res) => {
  const oldValues = await getCohort(req.params.id)
  if (!oldValues) return res.status(404).json({ message: 'Cohort not found.' })
  const data = await updateCohort(req.params.id, req.body)
  await auditRequest(req, {
    action: 'UPDATE',
    entityType: 'cohort',
    entityId: req.params.id,
    oldValues,
    newValues: data
  })
  emitSocketEvent('academic:updated', {
    entity: 'cohort',
    id: req.params.id,
    record: data
  })
  return res.json({ data })
}

export const removeCohort = async (req, res) => {
  const oldValues = await getCohort(req.params.id)
  if (!oldValues) return res.status(404).json({ message: 'Cohort not found.' })
  const blockers = await getCohortDeletionBlockers(req.params.id)
  if (Object.keys(blockers).length) {
    const archived = await archiveCohort(req.params.id)
    await auditRequest(req, {
      action: 'ARCHIVE_COHORT',
      entityType: 'cohort',
      entityId: req.params.id,
      oldValues,
      newValues: archived,
      reason:
        'Archived instead of hard deletion because academic records reference the cohort.'
    })
    const references = Object.entries(blockers)
      .map(([name, count]) => `${count} ${name.replaceAll('_', ' ')}`)
      .join(', ')
    return res.json({
      success: true,
      archived: true,
      message: `Cohort archived because it is referenced by ${references}. Historical timetable and student records were preserved.`
    })
  }

  let deleted
  try {
    deleted = await deleteCohort(req.params.id)
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      const archived = await archiveCohort(req.params.id)
      await auditRequest(req, {
        action: 'ARCHIVE_COHORT',
        entityType: 'cohort',
        entityId: req.params.id,
        oldValues,
        newValues: archived,
        reason:
          'Archived after a concurrent academic reference prevented hard deletion.'
      })
      return res.json({
        success: true,
        archived: true,
        message:
          'A timetable or academic record referenced this cohort, so it was archived and its history was preserved.'
      })
    }
    throw error
  }
  if (deleted) {
    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'cohort',
      entityId: req.params.id,
      oldValues
    })
    emitSocketEvent('academic:deleted', {
      entity: 'cohort',
      id: req.params.id,
      record: oldValues
    })
  }
  res.json({ success: deleted })
}

export const getStudents = async (req, res) => {
  res.json({ data: await listStudents() })
}

export const addStudent = async (req, res) => {
  res.status(201).json({ data: await createStudent(req.body) })
}

export const removeStudent = async (req, res) => {
  const oldValues = await getStudent(req.params.id)
  const deleted = await deleteStudent(req.params.id)
  if (deleted) {
    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'student',
      entityId: req.params.id,
      oldValues
    })
  }
  res.json({ success: deleted })
}

export const getLecturers = async (req, res) => {
  res.json({ data: await listLecturers(req.user) })
}

export const removeLecturer = async (req, res) => {
  const oldValues = await getLecturer(req.params.id)
  const deleted = await deleteLecturer(req.params.id)
  if (deleted) {
    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'lecturer',
      entityId: req.params.id,
      oldValues
    })
  }
  res.json({ success: deleted })
}

export const getLecturerAcademicDetails = async (req, res) => {
  const lecturer = await getLecturer(req.params.id)
  if (!lecturer) return res.status(404).json({ message: 'Lecturer not found.' })
  const data = await getLecturerAcademicProfile(
    lecturer.user_id ?? lecturer.userId
  )
  if (!data)
    return res.status(404).json({ message: 'Lecturer profile was not found.' })
  return res.json({ data })
}

export const editLecturerAcademicDetails = async (req, res) => {
  const lecturer = await getLecturer(req.params.id)
  if (!lecturer) return res.status(404).json({ message: 'Lecturer not found.' })
  const userId = lecturer.user_id ?? lecturer.userId
  const oldValues = await getLecturerAcademicProfile(userId)
  try {
    const data = await updateLecturerAcademicProfile(userId, req.body)
    await auditRequest(req, {
      action: 'UPDATE_LECTURER_PROFILE',
      entityType: 'lecturer',
      entityId: lecturer.id,
      oldValues,
      newValues: data
    })
    return res.json({ data })
  } catch (error) {
    return res.status(400).json({
      message: error.message || 'Unable to update lecturer academic details.'
    })
  }
}

export const getCourses = async (req, res) => {
  const result = await listCourses(req.user, req.query)
  if (Array.isArray(result)) return res.json({ data: result })
  return res.json(result)
}

export const addCourse = async (req, res) => {
  try {
    const data = await createCourse(req.body)
    if (data?.validationError) {
      return res.status(400).json({ message: data.validationError })
    }
    return res.status(201).json({ data })
  } catch (error) {
    return res.status(409).json({ message: error.message })
  }
}

export const editCourse = async (req, res) => {
  const oldValues = await getCourse(req.params.id)
  if (!oldValues) return res.status(404).json({ message: 'Unit not found.' })
  try {
    const data = await updateCourse(req.params.id, req.body)
    if (data?.validationError) {
      return res.status(400).json({ message: data.validationError })
    }
    await auditRequest(req, {
      action: 'UPDATE',
      entityType: 'unit',
      entityId: req.params.id,
      oldValues,
      newValues: data
    })
    emitSocketEvent('academic:updated', {
      entity: 'unit',
      id: req.params.id,
      record: data
    })
    return res.json({ data })
  } catch (error) {
    return res.status(409).json({ message: error.message })
  }
}

export const removeCourse = async (req, res) => {
  const oldValues = await getCourse(req.params.id)
  if (!oldValues) return res.status(404).json({ message: 'Unit not found.' })
  const blockers = await getAcademicDeleteBlockers('unit', req.params.id)
  if (Object.keys(blockers).length) {
    const references = Object.entries(blockers)
      .map(([table, count]) => `${count} ${table.replaceAll('_', ' ')}`)
      .join(', ')
    return res.status(409).json({
      message: `Cannot delete unit: referenced by ${references}. Remove or reassign those records first.`
    })
  }
  const deleted = await deleteAcademicRecord('unit', req.params.id)
  if (deleted) {
    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'unit',
      entityId: req.params.id,
      oldValues
    })
    emitSocketEvent('academic:deleted', {
      entity: 'unit',
      id: req.params.id,
      record: oldValues
    })
  }
  res.json({ success: deleted })
}

export const getVenueTypes = async (req, res) => {
  res.json({ data: await listVenueTypes() })
}

export const addVenueType = async (req, res) => {
  res.status(201).json({ data: await createVenueType(req.body) })
}

export const getVenues = async (req, res) => {
  res.json({ data: await listVenues() })
}

export const addVenue = async (req, res) => {
  res.status(201).json({ data: await createVenue(req.body) })
}

export const removeVenue = async (req, res) => {
  const oldValues = await getVenue(req.params.id)
  const deleted = await deleteVenue(req.params.id)
  if (deleted) {
    await auditRequest(req, {
      action: 'DELETE',
      entityType: 'venue',
      entityId: req.params.id,
      oldValues
    })
  }
  res.json({ success: deleted })
}

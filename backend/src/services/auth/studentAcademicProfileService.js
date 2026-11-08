import db from '../../config/db.js'
import { query } from '../../repositories/sqlRepository.js'

const getAcademicSelection = async (
  connection,
  {
    facultyId,
    departmentId,
    programmeId,
    academicYearId,
    cohortTypeId
  }
) => {
  const [rows] = await connection.execute(
    `SELECT p.id AS programme_id, p.department_id, p.duration_years,
        d.faculty_id, ct.id AS cohort_type_id, ct.study_year,
        ct.semester_number, st.id AS semester_type_id, s.id AS semester_id
     FROM programmes p
     JOIN departments d ON d.id = p.department_id
     JOIN cohort_types ct ON ct.programme_id = p.id AND ct.is_active = TRUE
     JOIN semester_types st ON st.number = ct.semester_number AND st.is_active = TRUE
     JOIN semesters s ON s.semester_type_id = st.id
       AND s.academic_year_id = ?
     JOIN academic_years ay ON ay.id = s.academic_year_id
     WHERE p.id = ? AND d.id = ? AND d.faculty_id = ?
       AND ct.id = ? AND ay.id = ? AND p.is_active = TRUE
     ORDER BY s.start_date DESC LIMIT 1`,
    [
      Number(academicYearId),
      Number(programmeId),
      Number(departmentId),
      Number(facultyId),
      Number(cohortTypeId),
      Number(academicYearId)
    ]
  )
  const selection = rows[0]
  if (!selection || Number(selection.study_year) > Number(selection.duration_years)) {
    throw new Error(
      'The selected faculty, department, programme, academic year, or cohort type is invalid.'
    )
  }
  return selection
}

export const getStudentAcademicProfileStatus = async (userId, role) => {
  if (role === 'CLASS_REP') {
    const [requests, representatives] = await Promise.all([
      query(
        `SELECT status FROM cohort_profile_requests
         WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
        [userId]
      ),
      query(
        `SELECT cr.id FROM cohort_representatives cr
         JOIN students s ON s.id = cr.student_id
         WHERE s.user_id = ? AND cr.is_active = TRUE
           AND (cr.end_date IS NULL OR cr.end_date >= CURDATE()) LIMIT 1`,
        [userId]
      )
    ])
    if (requests[0]) {
      const hasApprovedCohort = Boolean(representatives[0])
      return {
        complete:
          requests[0].status !== 'REJECTED' || hasApprovedCohort,
        role,
        pendingApproval: requests[0].status === 'PENDING',
        needsResubmission:
          requests[0].status === 'REJECTED' && !hasApprovedCohort,
        profileRequestStatus: requests[0].status
      }
    }
  }

  const [students, requests] = await Promise.all([
    query(
      `SELECT id, cohort_id FROM students WHERE user_id = ? LIMIT 1`,
      [userId]
    ),
    query(
      `SELECT status FROM cohort_membership_requests
       WHERE user_id = ? LIMIT 1`,
      [userId]
    )
  ])
  if (students[0]?.cohort_id) {
    return {
      complete: true,
      role,
      pendingApproval: requests[0]?.status === 'PENDING',
      needsResubmission: requests[0]?.status === 'REJECTED',
      profileRequestStatus: requests[0]?.status
    }
  }
  if (requests[0]) {
    return {
      complete: requests[0].status !== 'REJECTED',
      role,
      pendingApproval: requests[0].status === 'PENDING',
      needsResubmission: requests[0].status === 'REJECTED',
      profileRequestStatus: requests[0].status
    }
  }
  return { complete: false, role, pendingApproval: false }
}

export const getStudentAcademicProfile = async (userId, role) => {
  const [students, cohortRequests, membershipRequests] = await Promise.all([
    query(
      `SELECT st.id, st.student_number, st.status, st.current_year,
          st.admission_year AS intake_year, st.cohort_id,
          p.id AS programme_id, p.name AS programme_name, p.code AS programme_code,
          p.duration_years, d.id AS department_id, d.name AS department_name,
          f.id AS faculty_id, f.name AS faculty_name, c.name AS cohort_name,
          cp.academic_year_id, ay.name AS academic_year_name,
          cp.semester_id, sem.name AS semester_name,
          cp.cohort_type_id, ct.name AS cohort_type_name,
          cp.student_count AS cohort_student_count,
          (SELECT COUNT(*) FROM students submitted
           WHERE submitted.cohort_id = c.id
             AND NOT EXISTS (
               SELECT 1 FROM cohort_representatives rep
               WHERE rep.cohort_id = c.id
                 AND rep.student_id = submitted.id
                 AND rep.is_active = TRUE
                 AND (rep.end_date IS NULL OR rep.end_date >= CURDATE())
             )) +
          (SELECT COUNT(*) FROM cohort_membership_requests pending
           WHERE pending.cohort_id = c.id AND pending.status = 'PENDING')
            AS submitted_profile_count
       FROM students st
       LEFT JOIN programmes p ON p.id = st.programme_id
       LEFT JOIN departments d ON d.id = p.department_id
       LEFT JOIN faculties f ON f.id = d.faculty_id
       LEFT JOIN cohorts c ON c.id = st.cohort_id
       LEFT JOIN cohort_progressions cp ON cp.id = (
         SELECT cp_latest.id FROM cohort_progressions cp_latest
         JOIN semesters sem_latest ON sem_latest.id = cp_latest.semester_id
         WHERE cp_latest.cohort_id = c.id
         ORDER BY sem_latest.start_date DESC, cp_latest.id DESC LIMIT 1
       )
       LEFT JOIN academic_years ay ON ay.id = cp.academic_year_id
       LEFT JOIN semesters sem ON sem.id = cp.semester_id
       LEFT JOIN cohort_types ct ON ct.id = cp.cohort_type_id
       WHERE st.user_id = ? LIMIT 1`,
      [userId]
    ),
    role === 'CLASS_REP'
      ? query(
          `SELECT cpr.*, p.name AS programme_name, p.code AS programme_code,
              p.duration_years, d.id AS department_id,
              d.name AS department_name, f.id AS faculty_id,
              f.name AS faculty_name, ay.name AS academic_year_name,
              sem.name AS semester_name, ct.name AS cohort_type_name,
              ct.study_year
           FROM cohort_profile_requests cpr
           JOIN programmes p ON p.id = cpr.programme_id
           JOIN departments d ON d.id = p.department_id
           JOIN faculties f ON f.id = d.faculty_id
           JOIN academic_years ay ON ay.id = cpr.academic_year_id
           JOIN semesters sem ON sem.id = cpr.semester_id
           JOIN cohort_types ct ON ct.id = cpr.cohort_type_id
           WHERE cpr.user_id = ? LIMIT 1`,
          [userId]
        )
      : Promise.resolve([]),
    query(
      `SELECT cmr.status, cmr.cohort_id, cmr.academic_year_id,
          cmr.semester_id, cmr.cohort_type_id, c.name AS cohort_name,
          c.intake_year, c.student_count AS cohort_student_count,
          c.programme_id, p.name AS programme_name, p.duration_years,
          d.id AS department_id, d.name AS department_name,
          f.id AS faculty_id, f.name AS faculty_name,
          ay.name AS academic_year_name, sem.name AS semester_name,
          ct.name AS cohort_type_name
       FROM cohort_membership_requests cmr
       JOIN cohorts c ON c.id = cmr.cohort_id
       JOIN programmes p ON p.id = c.programme_id
       JOIN departments d ON d.id = p.department_id
       JOIN faculties f ON f.id = d.faculty_id
       JOIN academic_years ay ON ay.id = cmr.academic_year_id
       JOIN semesters sem ON sem.id = cmr.semester_id
       JOIN cohort_types ct ON ct.id = cmr.cohort_type_id
       WHERE cmr.user_id = ? LIMIT 1`,
      [userId]
    )
  ])
  return {
    role,
    student: students[0] || null,
    cohortProfileRequest: cohortRequests[0] || null,
    membershipRequest: membershipRequests[0] || null
  }
}

export const completeStudentAcademicProfile = async (
  userId,
  role,
  payload,
  { allowAssignedStudent = false, allowPendingRequestEdit = false } = {}
) => {
  const facultyId = Number(payload.facultyId)
  const departmentId = Number(payload.departmentId)
  const programmeId = Number(payload.programmeId)
  const academicYearId = Number(payload.academicYearId)
  const cohortTypeId = Number(payload.cohortTypeId)
  const intakeYear = Number(payload.intakeYear)
  if (
    !facultyId ||
    !departmentId ||
    !programmeId ||
    !academicYearId ||
    !cohortTypeId ||
    !Number.isInteger(intakeYear) ||
    intakeYear < 1900
  ) {
    throw new Error(
      'Select a faculty, department, programme, academic year, intake year, and cohort type.'
    )
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const selection = await getAcademicSelection(connection, {
      facultyId,
      departmentId,
      programmeId,
      academicYearId,
      cohortTypeId
    })

    if (role === 'CLASS_REP') {
      const studentCount = Number(payload.studentCount)
      if (!Number.isInteger(studentCount) || studentCount < 0) {
        throw new Error('Enter a non-negative whole-number student count.')
      }
      const [representativeCohorts] = await connection.execute(
        `SELECT c.id, c.programme_id, c.intake_year
         FROM cohort_representatives cr
         JOIN students st ON st.id = cr.student_id
         JOIN cohorts c ON c.id = cr.cohort_id
         WHERE st.user_id = ? AND cr.is_active = TRUE
           AND (cr.end_date IS NULL OR cr.end_date >= CURDATE())
         LIMIT 1 FOR UPDATE`,
        [userId]
      )
      const existingRepresentativeCohort = representativeCohorts[0]
      if (
        existingRepresentativeCohort &&
        (Number(existingRepresentativeCohort.programme_id) !== programmeId ||
          Number(existingRepresentativeCohort.intake_year) !== intakeYear)
      ) {
        throw new Error(
          'A class representative cannot change the identity of an approved cohort. Contact an administrator if this is incorrect.'
        )
      }
      const duplicateConditions = existingRepresentativeCohort
        ? 'AND id <> ?'
        : ''
      const duplicateParams = existingRepresentativeCohort
        ? [programmeId, intakeYear, existingRepresentativeCohort.id]
        : [programmeId, intakeYear]
      const [existingCohort] = await connection.execute(
        `SELECT id FROM cohorts
         WHERE programme_id = ? AND intake_year = ? ${duplicateConditions}
         LIMIT 1`,
        duplicateParams
      )
      if (existingCohort.length) {
        throw new Error(
          'A cohort already exists for this programme and intake year. Ask its class representative to add you to that cohort.'
        )
      }
      const [existingRequest] = await connection.execute(
        `SELECT id, status FROM cohort_profile_requests
         WHERE user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [userId]
      )
      if (
        existingRequest[0]?.status === 'PENDING' &&
        !allowPendingRequestEdit
      ) {
        throw new Error('Your cohort profile is already awaiting admin approval.')
      }
      await connection.execute(
        `INSERT INTO cohort_profile_requests
          (user_id, programme_id, academic_year_id, semester_id,
           cohort_type_id, intake_year, student_count, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
          ON DUPLICATE KEY UPDATE programme_id = VALUES(programme_id),
            academic_year_id = VALUES(academic_year_id),
            semester_id = VALUES(semester_id),
            cohort_type_id = VALUES(cohort_type_id),
            intake_year = VALUES(intake_year),
            student_count = VALUES(student_count), status = 'PENDING',
            reviewed_by = NULL, reviewed_at = NULL`,
        [
          userId,
          programmeId,
          academicYearId,
          selection.semester_id,
          cohortTypeId,
          intakeYear,
          studentCount
        ]
      )
      await connection.commit()
      return {
        complete: true,
        role,
        pendingApproval: true,
        profileRequestStatus: 'PENDING'
      }
    }

    const [cohorts] = await connection.execute(
      `SELECT c.id FROM cohorts c
       JOIN cohort_progressions cp ON cp.cohort_id = c.id
       WHERE c.programme_id = ? AND c.intake_year = ?
         AND cp.academic_year_id = ? AND cp.semester_id = ?
         AND cp.cohort_type_id = ? AND c.is_active = TRUE
       LIMIT 1`,
      [
        programmeId,
        intakeYear,
        academicYearId,
        selection.semester_id,
        cohortTypeId
      ]
    )
    const cohort = cohorts[0]
    if (!cohort) {
      throw new Error(
        'No active cohort matches this programme, intake year, academic year, and cohort type.'
      )
    }

    const [students] = await connection.execute(
      'SELECT id, cohort_id FROM students WHERE user_id = ? LIMIT 1 FOR UPDATE',
      [userId]
    )
    if (students[0]?.cohort_id && !allowAssignedStudent) {
      throw new Error('Your student account is already assigned to a cohort.')
    }
    let studentId = students[0]?.id
    if (studentId) {
      if (!students[0].cohort_id) {
        await connection.execute(
          `UPDATE students SET programme_id = ?, current_year = ?,
            admission_year = ?, status = 'PENDING' WHERE id = ?`,
          [programmeId, selection.study_year, intakeYear, studentId]
        )
      }
    } else {
      const [student] = await connection.execute(
        `INSERT INTO students
          (user_id, student_number, programme_id, cohort_id, current_year,
           admission_year, status)
         VALUES (?, ?, ?, NULL, ?, ?, 'PENDING')`,
        [
          userId,
          `STU-${userId}`,
          programmeId,
          selection.study_year,
          intakeYear
        ]
      )
      studentId = student.insertId
    }
    await connection.execute(
      `INSERT INTO cohort_membership_requests
        (user_id, cohort_id, academic_year_id, semester_id, cohort_type_id,
         status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')
       ON DUPLICATE KEY UPDATE cohort_id = VALUES(cohort_id),
         academic_year_id = VALUES(academic_year_id),
         semester_id = VALUES(semester_id),
         cohort_type_id = VALUES(cohort_type_id), status = 'PENDING',
         reviewed_by = NULL, reviewed_at = NULL`,
      [
        userId,
        cohort.id,
        academicYearId,
        selection.semester_id,
        cohortTypeId
      ]
    )
    await connection.commit()
    return {
      complete: true,
      role,
      studentId,
      pendingApproval: true,
      profileRequestStatus: 'PENDING'
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export const updateStudentAcademicProfile = (userId, role, payload) =>
  completeStudentAcademicProfile(userId, role, payload, {
    allowAssignedStudent: true,
    allowPendingRequestEdit: true
  })

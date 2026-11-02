import db from '../config/db.js'
import { query } from '../repositories/sqlRepository.js'
import { createNotification } from './notifications/notificationService.js'

const normalizeRoles = user =>
  Array.isArray(user?.roles) ? user.roles : user?.roles ? [user.roles] : []

const assertCohortRepresentative = async (connection, cohortId, userId) => {
  const [rows] = await connection.execute(
    `SELECT cr.id FROM cohort_representatives cr
     JOIN students s ON s.id = cr.student_id
     WHERE cr.cohort_id = ? AND s.user_id = ? AND cr.is_active = TRUE
       AND (cr.end_date IS NULL OR cr.end_date >= CURDATE()) LIMIT 1`,
    [cohortId, userId]
  )
  if (!rows.length) {
    throw new Error('You can only manage membership for your assigned cohort.')
  }
}

export const listPendingCohortProfileRequests = async () =>
  query(
    `SELECT cpr.*, u.first_name, u.last_name, u.email, p.name AS programme_name,
        p.code AS programme_code, d.name AS department_name,
        f.name AS faculty_name, ay.name AS academic_year_name,
        s.name AS semester_name, ct.name AS cohort_type_name,
        ct.study_year, ct.semester_number
     FROM cohort_profile_requests cpr
     JOIN users u ON u.id = cpr.user_id
     JOIN programmes p ON p.id = cpr.programme_id
     JOIN departments d ON d.id = p.department_id
     JOIN faculties f ON f.id = d.faculty_id
     JOIN academic_years ay ON ay.id = cpr.academic_year_id
     JOIN semesters s ON s.id = cpr.semester_id
     JOIN cohort_types ct ON ct.id = cpr.cohort_type_id
     WHERE cpr.status = 'PENDING' ORDER BY cpr.created_at`
  )

export const reviewCohortProfileRequest = async (
  requestId,
  decision,
  reviewerId
) => {
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw new Error('Choose approve or reject.')
  }
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [requests] = await connection.execute(
      `SELECT cpr.*, p.duration_years, ct.study_year, ct.semester_number,
          s.number AS semester_number_actual, u.first_name, u.last_name
       FROM cohort_profile_requests cpr
       JOIN programmes p ON p.id = cpr.programme_id
       JOIN cohort_types ct ON ct.id = cpr.cohort_type_id
       JOIN semesters s ON s.id = cpr.semester_id
       JOIN semester_types st ON st.id = s.semester_type_id
       JOIN users u ON u.id = cpr.user_id
       WHERE cpr.id = ? FOR UPDATE`,
      [Number(requestId)]
    )
    const request = requests[0]
    if (!request || request.status !== 'PENDING') {
      throw new Error('Pending cohort profile request not found.')
    }

    let cohortId = null
    if (decision === 'APPROVED') {
      if (
        Number(request.study_year) > Number(request.duration_years) ||
        Number(request.semester_number) !== Number(request.semester_number_actual)
      ) {
        throw new Error('The requested cohort type does not match its semester.')
      }
      const [representatives] = await connection.execute(
        `SELECT c.id AS cohort_id, c.programme_id, c.intake_year,
            st.id AS student_id
         FROM cohort_representatives cr
         JOIN students st ON st.id = cr.student_id
         JOIN cohorts c ON c.id = cr.cohort_id
         WHERE st.user_id = ? AND cr.is_active = TRUE
           AND (cr.end_date IS NULL OR cr.end_date >= CURDATE())
         LIMIT 1 FOR UPDATE`,
        [request.user_id]
      )
      const existingRepresentative = representatives[0]
      if (
        existingRepresentative &&
        (Number(existingRepresentative.programme_id) !==
          Number(request.programme_id) ||
          Number(existingRepresentative.intake_year) !==
            Number(request.intake_year))
      ) {
        throw new Error(
          'An approved cohort profile cannot change its programme or intake year.'
        )
      }
      const duplicateConditions = existingRepresentative
        ? 'AND id <> ?'
        : ''
      const duplicateParams = existingRepresentative
        ? [
            request.programme_id,
            request.intake_year,
            existingRepresentative.cohort_id
          ]
        : [request.programme_id, request.intake_year]
      const [duplicates] = await connection.execute(
        `SELECT id FROM cohorts
         WHERE programme_id = ? AND intake_year = ? ${duplicateConditions}
         LIMIT 1 FOR UPDATE`,
        duplicateParams
      )
      if (duplicates.length) {
        throw new Error(
          'A cohort already exists for this programme and intake year.'
        )
      }

      let studentId
      if (existingRepresentative) {
        cohortId = existingRepresentative.cohort_id
        studentId = existingRepresentative.student_id
        await connection.execute(
          'UPDATE cohorts SET student_count = ? WHERE id = ?',
          [request.student_count, cohortId]
        )
        await connection.execute(
          `INSERT INTO cohort_progressions
            (cohort_id, academic_year_id, semester_id, cohort_type_id, student_count)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             academic_year_id = VALUES(academic_year_id),
             cohort_type_id = VALUES(cohort_type_id),
             student_count = VALUES(student_count)`,
          [
            cohortId,
            request.academic_year_id,
            request.semester_id,
            request.cohort_type_id,
            request.student_count
          ]
        )
        await connection.execute(
          'UPDATE students SET current_year = ? WHERE id = ?',
          [request.study_year, studentId]
        )
      } else {
        const cohortName = `${request.intake_year} Intake`
        const [cohort] = await connection.execute(
          `INSERT INTO cohorts
            (programme_id, intake_year, name, student_count, is_active)
           VALUES (?, ?, ?, ?, TRUE)`,
          [
            request.programme_id,
            request.intake_year,
            cohortName,
            request.student_count
          ]
        )
        cohortId = cohort.insertId
        await connection.execute(
          `INSERT INTO cohort_progressions
            (cohort_id, academic_year_id, semester_id, cohort_type_id, student_count)
           VALUES (?, ?, ?, ?, ?)`,
          [
            cohortId,
            request.academic_year_id,
            request.semester_id,
            request.cohort_type_id,
            request.student_count
          ]
        )

        const [students] = await connection.execute(
          'SELECT id FROM students WHERE user_id = ? LIMIT 1 FOR UPDATE',
          [request.user_id]
        )
        studentId = students[0]?.id
        if (studentId) {
          await connection.execute(
            `UPDATE students SET programme_id = ?, cohort_id = ?,
              current_year = ?, admission_year = ?, status = 'ACTIVE'
             WHERE id = ?`,
            [
              request.programme_id,
              cohortId,
              request.study_year,
              request.intake_year,
              studentId
            ]
          )
        } else {
          const [student] = await connection.execute(
            `INSERT INTO students
              (user_id, student_number, programme_id, cohort_id, current_year,
               admission_year, status)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
            [
              request.user_id,
              `STU-${request.user_id}`,
              request.programme_id,
              cohortId,
              request.study_year,
              request.intake_year
            ]
          )
          studentId = student.insertId
        }
        await connection.execute(
          `INSERT INTO cohort_representatives
            (cohort_id, student_id, start_date, is_active)
           VALUES (?, ?, CURDATE(), TRUE)`,
          [cohortId, studentId]
        )
      }
    }

    await connection.execute(
      `UPDATE cohort_profile_requests
       SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [decision, reviewerId, Number(requestId)]
    )
    await connection.commit()
    await createNotification({
      userId: request.user_id,
      type: `academic:cohort_profile:${decision.toLowerCase()}`,
      title:
        decision === 'APPROVED'
          ? 'Cohort profile approved'
          : 'Cohort profile needs an update',
      message:
        decision === 'APPROVED'
          ? 'Your cohort profile has been approved. You can now use your academic workspace.'
          : 'Your cohort profile request was not approved. Review your academic details and submit it again.',
      entityType: 'cohort_profile_request',
      entityId: requestId
    })
    return {
      id: Number(requestId),
      status: decision,
      cohortId,
      userId: Number(request.user_id)
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export const listCohortMembershipRequests = async (cohortId, user) => {
  const roles = normalizeRoles(user)
  if (!roles.includes('ADMIN')) {
    const connection = await db.getConnection()
    try {
      await assertCohortRepresentative(
        connection,
        Number(cohortId),
        user?.id
      )
    } finally {
      connection.release()
    }
  }
  return query(
    `SELECT cmr.id, cmr.cohort_id, cmr.academic_year_id, cmr.semester_id,
        cmr.cohort_type_id, cmr.status, cmr.created_at, u.first_name,
        u.last_name, u.email, s.student_number, ct.name AS cohort_type_name,
        ay.name AS academic_year_name, sem.name AS semester_name
     FROM cohort_membership_requests cmr
     JOIN users u ON u.id = cmr.user_id
     LEFT JOIN students s ON s.user_id = cmr.user_id
     JOIN cohort_types ct ON ct.id = cmr.cohort_type_id
     JOIN academic_years ay ON ay.id = cmr.academic_year_id
     JOIN semesters sem ON sem.id = cmr.semester_id
     WHERE cmr.cohort_id = ? AND cmr.status = 'PENDING'
     ORDER BY cmr.created_at`,
    [Number(cohortId)]
  )
}

export const listCohortMembers = async (cohortId, user) => {
  const roles = normalizeRoles(user)
  if (!roles.includes('ADMIN')) {
    const connection = await db.getConnection()
    try {
      await assertCohortRepresentative(
        connection,
        Number(cohortId),
        user?.id
      )
    } finally {
      connection.release()
    }
  }
  return query(
    `SELECT s.id, s.student_number, s.current_year, s.admission_year,
        s.status, u.first_name, u.last_name, u.email, u.phone_number,
        p.name AS programme_name,
        EXISTS (
          SELECT 1 FROM cohort_representatives cr
          WHERE cr.student_id = s.id AND cr.cohort_id = s.cohort_id
            AND cr.is_active = TRUE
            AND (cr.end_date IS NULL OR cr.end_date >= CURDATE())
        ) AS is_class_representative
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN programmes p ON p.id = s.programme_id
     WHERE s.cohort_id = ?
     ORDER BY u.last_name, u.first_name, s.student_number`,
    [Number(cohortId)]
  )
}

export const reviewCohortMembershipRequest = async (
  requestId,
  decision,
  user
) => {
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw new Error('Choose approve or reject.')
  }
  const roles = normalizeRoles(user)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT cmr.*, c.programme_id, c.intake_year, ct.study_year,
          ct.programme_id AS cohort_type_programme_id, p.duration_years
       FROM cohort_membership_requests cmr
       JOIN cohorts c ON c.id = cmr.cohort_id
       JOIN cohort_types ct ON ct.id = cmr.cohort_type_id
       JOIN programmes p ON p.id = c.programme_id
       WHERE cmr.id = ? FOR UPDATE`,
      [Number(requestId)]
    )
    const request = rows[0]
    if (!request || request.status !== 'PENDING') {
      throw new Error('Pending student profile request not found.')
    }
    if (!roles.includes('ADMIN')) {
      await assertCohortRepresentative(
        connection,
        request.cohort_id,
        user?.id
      )
    }
    if (
      Number(request.programme_id) !==
        Number(request.cohort_type_programme_id) ||
      Number(request.study_year) > Number(request.duration_years)
    ) {
      throw new Error('Student profile no longer matches the cohort.')
    }
    if (decision === 'APPROVED') {
      const [students] = await connection.execute(
        'SELECT id, cohort_id FROM students WHERE user_id = ? LIMIT 1 FOR UPDATE',
        [request.user_id]
      )
      if (!students[0]) throw new Error('Student record was not found.')
      const previousCohortId = students[0].cohort_id
      await connection.execute(
        `UPDATE students SET programme_id = ?, cohort_id = ?,
          current_year = ?, admission_year = ?, status = 'ACTIVE'
         WHERE id = ?`,
        [
          request.programme_id,
          request.cohort_id,
          request.study_year,
          request.intake_year,
          students[0].id
        ]
      )
      if (
        previousCohortId &&
        Number(previousCohortId) !== Number(request.cohort_id)
      ) {
        const [previousCountRows] = await connection.execute(
          `SELECT COUNT(*) AS total FROM students
           WHERE cohort_id = ? AND status = 'ACTIVE'`,
          [previousCohortId]
        )
        const previousCount = Number(previousCountRows[0].total)
        await connection.execute(
          'UPDATE cohorts SET student_count = ? WHERE id = ?',
          [previousCount, previousCohortId]
        )
        await connection.execute(
          'UPDATE cohort_progressions SET student_count = ? WHERE cohort_id = ?',
          [previousCount, previousCohortId]
        )
      }
      const [countRows] = await connection.execute(
        `SELECT COUNT(*) AS total FROM students
         WHERE cohort_id = ? AND status = 'ACTIVE'`,
        [request.cohort_id]
      )
      await connection.execute(
        'UPDATE cohort_progressions SET student_count = ? WHERE cohort_id = ?',
        [Number(countRows[0].total), request.cohort_id]
      )
      await connection.execute(
        'UPDATE cohorts SET student_count = ? WHERE id = ?',
        [Number(countRows[0].total), request.cohort_id]
      )
    }
    await connection.execute(
      `UPDATE cohort_membership_requests
       SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [decision, user.id, Number(requestId)]
    )
    await connection.commit()
    await createNotification({
      userId: request.user_id,
      type: `academic:cohort_membership:${decision.toLowerCase()}`,
      title:
        decision === 'APPROVED'
          ? 'Cohort membership approved'
          : 'Cohort membership needs an update',
      message:
        decision === 'APPROVED'
          ? 'Your academic details and cohort membership have been approved.'
          : 'Your cohort membership request was not approved. Review your academic details and submit it again.',
      entityType: 'cohort_membership_request',
      entityId: requestId
    })
    return {
      id: Number(requestId),
      cohortId: Number(request.cohort_id),
      userId: Number(request.user_id),
      status: decision
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export const getCohortRequestCounts = async user => {
  const roles = normalizeRoles(user)
  const [profileRequests, membershipRequests] = await Promise.all([
    roles.includes('ADMIN')
      ? query(
          `SELECT COUNT(*) AS total FROM cohort_profile_requests
           WHERE status = 'PENDING'`
        )
      : Promise.resolve([{ total: 0 }]),
    roles.includes('ADMIN')
      ? query(
          `SELECT COUNT(*) AS total FROM cohort_membership_requests
           WHERE status = 'PENDING'`
        )
      : query(
          `SELECT COUNT(*) AS total
           FROM cohort_membership_requests cmr
           WHERE cmr.status = 'PENDING'
             AND EXISTS (
               SELECT 1 FROM cohort_representatives cr
               JOIN students s ON s.id = cr.student_id
               WHERE cr.cohort_id = cmr.cohort_id
                 AND s.user_id = ? AND cr.is_active = TRUE
                 AND (cr.end_date IS NULL OR cr.end_date >= CURDATE())
             )`,
          [user.id]
        )
  ])
  const profileCount = Number(profileRequests[0]?.total || 0)
  const membershipCount = Number(membershipRequests[0]?.total || 0)

  return {
    profileRequests: profileCount,
    membershipRequests: membershipCount,
    total: profileCount + membershipCount
  }
}

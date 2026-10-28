import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { createRow, query, rawQuery } from '../../repositories/sqlRepository.js'

const JWT_SECRET = process.env.JWT_SECRET || 'seatsync-dev-secret'

const normalizeRoleRows = (rows = []) =>
  rows.map(row => row.name || row.role_name).filter(Boolean)

export const createAccessToken = user =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      roles: user.roles || [],
      type: 'access'
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  )

export const createRefreshToken = user =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      roles: user.roles || [],
      type: 'refresh'
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

export const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 15 * 60 * 1000
  })

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  })
}

export const clearAuthCookies = res => {
  res.clearCookie('accessToken', { path: '/' })
  res.clearCookie('refreshToken', { path: '/' })
}

export const issueTokens = user => ({
  accessToken: createAccessToken(user),
  refreshToken: createRefreshToken(user)
})

export const ensureDefaultRoles = async () => {
  const roles = [
    { name: 'ADMIN', description: 'University administrator' },
    { name: 'LECTURER', description: 'Academic staff' },
    { name: 'STUDENT', description: 'Student account' },
    { name: 'CLASS_REP', description: 'Student class representative' }
  ]

  const existing = await query('SELECT * FROM roles')
  const existingNames = new Set(existing.map(row => row.name))

  for (const role of roles) {
    if (!existingNames.has(role.name)) {
      await createRow('roles', role)
    }
  }

  return roles
}

export const ensureDefaultAdmin = async () => {
  await ensureDefaultRoles()

  const adminEmail = 'admin@seatsync.local'
  const existing = await query('SELECT * FROM users WHERE email = ?', [
    adminEmail
  ])

  if (existing.length) {
    const roleRows = await query(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?',
      [existing[0].id]
    )
    const currentRoles = normalizeRoleRows(roleRows)

    if (!currentRoles.includes('ADMIN')) {
      const adminRole = await query('SELECT id FROM roles WHERE name = ?', [
        'ADMIN'
      ])
      if (adminRole[0]) {
        await createRow('user_roles', {
          user_id: existing[0].id,
          role_id: adminRole[0].id
        })
      }
    }

    return existing[0]
  }

  const passwordHash = await hashPassword('admin123')
  const user = await createRow('users', {
    first_name: 'System',
    last_name: 'Admin',
    email: adminEmail,
    password_hash: passwordHash,
    phone_number: null,
    is_active: true,
    last_login_at: null
  })

  const adminRole = await query('SELECT id FROM roles WHERE name = ?', [
    'ADMIN'
  ])
  if (adminRole[0]) {
    await createRow('user_roles', {
      user_id: user.id,
      role_id: adminRole[0].id
    })
  }

  return user
}

export const hashPassword = async password => bcrypt.hash(password, 10)

export const verifyPassword = async (password, hash) =>
  bcrypt.compare(password, hash)

export const createAuthToken = user => createAccessToken(user)

export const verifyRefreshToken = token => {
  const decoded = jwt.verify(token, JWT_SECRET)
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid refresh token.')
  }
  return decoded
}

export const getUserRoles = async userId => {
  const rows = await query(
    'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?',
    [userId]
  )

  return normalizeRoleRows(rows)
}

export const registerUser = async ({
  firstName,
  lastName,
  email,
  password,
  phoneNumber = null,
  role = 'STUDENT'
}) => {
  if (!firstName || !lastName || !email || !password) {
    throw new Error('First name, last name, email, and password are required.')
  }

  if (!['STUDENT', 'CLASS_REP', 'LECTURER'].includes(role)) {
    throw new Error(
      'Only student, class representative, or lecturer registration is allowed.'
    )
  }

  await ensureDefaultRoles()

  const existing = await query('SELECT * FROM users WHERE email = ?', [email])
  if (existing.length) {
    throw new Error('User with that email already exists.')
  }

  const passwordHash = await hashPassword(password)
  const user = await createRow('users', {
    first_name: firstName,
    last_name: lastName,
    email,
    phone_number: phoneNumber,
    password_hash: passwordHash,
    is_active: true
  })

  const roleRow = await query('SELECT id FROM roles WHERE name = ?', [role])
  if (roleRow[0]) {
    await createRow('user_roles', { user_id: user.id, role_id: roleRow[0].id })
  }

  const roles = await getUserRoles(user.id)

  const tokens = issueTokens({ id: user.id, email: user.email, roles })

  return {
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phoneNumber: user.phone_number,
      roles,
      isActive: user.is_active
    },
    ...tokens
  }
}

export const getProfileStatus = async userId => {
  const roles = await getUserRoles(userId)
  const role = roles[0]
  let complete = false
  if (role === 'LECTURER') {
    const rows = await query(
      `SELECT l.id
       FROM lecturers l
       WHERE l.user_id = ?
         AND EXISTS (SELECT 1 FROM lecturer_faculties WHERE lecturer_id = l.id)
         AND EXISTS (SELECT 1 FROM lecturer_departments WHERE lecturer_id = l.id)
         AND EXISTS (SELECT 1 FROM lecturer_programmes WHERE lecturer_id = l.id)
         AND EXISTS (SELECT 1 FROM lecturer_units WHERE lecturer_id = l.id)`,
      [userId]
    )
    complete = Boolean(rows[0])
  } else if (role === 'STUDENT' || role === 'CLASS_REP') {
    const rows = await query(
      `SELECT id FROM students
       WHERE user_id = ? AND programme_id IS NOT NULL
         AND current_year IS NOT NULL`,
      [userId]
    )
    complete = Boolean(rows[0])
  } else {
    complete = true
  }
  return { complete, role }
}

export const completeAcademicProfile = async (userId, payload) => {
  const { role } = await getProfileStatus(userId)
  if (role === 'LECTURER') {
    const faculties = (payload.facultyIds || []).map(Number).filter(Boolean)
    const departments = (payload.departmentIds || [])
      .map(Number)
      .filter(Boolean)
    const programmes = (payload.programmeIds || []).map(Number).filter(Boolean)
    const units = (payload.unitIds || []).map(Number).filter(Boolean)
    if (
      !faculties.length ||
      !departments.length ||
      !programmes.length ||
      !units.length
    ) {
      throw new Error(
        'Select at least one faculty, department, programme, and unit.'
      )
    }
    const facultyRows = await query(
      `SELECT id FROM faculties WHERE id IN (${faculties
        .map(() => '?')
        .join(',')})`,
      faculties
    )
    const departmentRows = await query(
      `SELECT id, faculty_id FROM departments WHERE id IN (${departments
        .map(() => '?')
        .join(',')})`,
      departments
    )
    const programmeRows = await query(
      `SELECT id, department_id FROM programmes WHERE id IN (${programmes
        .map(() => '?')
        .join(',')})`,
      programmes
    )
    const unitRows = await query(
      `SELECT DISTINCT u.id FROM units u
       JOIN unit_programmes up ON up.unit_id = u.id
       JOIN programmes p ON p.id = up.programme_id
       WHERE u.id IN (${units.map(() => '?').join(',')})
         AND p.id IN (${programmes.map(() => '?').join(',')})
         AND p.department_id IN (${departments.map(() => '?').join(',')})`,
      [...units, ...programmes, ...departments]
    )
    if (
      facultyRows.length !== faculties.length ||
      departmentRows.length !== departments.length ||
      departmentRows.some(row => !faculties.includes(Number(row.faculty_id)))
    ) {
      throw new Error(
        'Each selected department must belong to a selected faculty.'
      )
    }
    if (
      programmeRows.length !== programmes.length ||
      programmeRows.some(
        row => !departments.includes(Number(row.department_id))
      )
    ) {
      throw new Error(
        'Each selected programme must belong to a selected department.'
      )
    }
    if (unitRows.length !== units.length) {
      throw new Error(
        'Each selected unit must belong to a selected programme and department.'
      )
    }
    const existingLecturer = (
      await query('SELECT id FROM lecturers WHERE user_id = ?', [userId])
    )[0]
    const lecturer =
      existingLecturer ||
      (await createRow('lecturers', {
        user_id: userId,
        staff_number: `STF-${userId}`,
        department_id: departments[0],
        employment_status: 'ACTIVE'
      }))
    if (existingLecturer) {
      await rawQuery('DELETE FROM lecturer_faculties WHERE lecturer_id = ?', [
        lecturer.id
      ])
      await rawQuery('DELETE FROM lecturer_departments WHERE lecturer_id = ?', [
        lecturer.id
      ])
      await rawQuery('DELETE FROM lecturer_programmes WHERE lecturer_id = ?', [
        lecturer.id
      ])
      await rawQuery('DELETE FROM lecturer_units WHERE lecturer_id = ?', [
        lecturer.id
      ])
    }
    for (const id of faculties)
      await rawQuery('INSERT INTO lecturer_faculties VALUES (?, ?)', [
        lecturer.id,
        id
      ])
    for (const id of departments)
      await rawQuery('INSERT INTO lecturer_departments VALUES (?, ?)', [
        lecturer.id,
        id
      ])
    for (const id of programmes)
      await rawQuery('INSERT INTO lecturer_programmes VALUES (?, ?)', [
        lecturer.id,
        id
      ])
    for (const id of units)
      await rawQuery('INSERT INTO lecturer_units VALUES (?, ?)', [
        lecturer.id,
        id
      ])
  } else if (role === 'STUDENT' || role === 'CLASS_REP') {
    const programmeId = Number(payload.programmeId)
    const academicYearId = Number(payload.academicYearId)
    const currentYear = Number(payload.currentYear)
    if (!programmeId || !academicYearId || !currentYear)
      throw new Error('Select an academic year, current year, and programme.')
    const [cohort] = await query(
      'SELECT id FROM cohorts WHERE programme_id = ? AND academic_year_id = ? ORDER BY id LIMIT 1',
      [programmeId, academicYearId]
    )
    const student = await createRow('students', {
      user_id: userId,
      student_number: `STU-${userId}`,
      programme_id: programmeId,
      cohort_id: cohort?.id || null,
      admission_year: new Date().getFullYear(),
      current_year: currentYear,
      status: 'ACTIVE'
    })
    if (role === 'CLASS_REP' && cohort)
      await createRow('cohort_representatives', {
        cohort_id: cohort.id,
        student_id: student.id,
        start_date: new Date().toISOString().slice(0, 10),
        is_active: true
      })
  }
  return { complete: true, role }
}

export const getLecturerAcademicProfile = async userId => {
  const lecturer = (
    await query('SELECT * FROM lecturers WHERE user_id = ? LIMIT 1', [userId])
  )[0]
  if (!lecturer) return null
  const [facultyRows, departmentRows, programmeRows, unitRows] =
    await Promise.all([
      query('SELECT faculty_id FROM lecturer_faculties WHERE lecturer_id = ?', [
        lecturer.id
      ]),
      query(
        'SELECT department_id FROM lecturer_departments WHERE lecturer_id = ?',
        [lecturer.id]
      ),
      query(
        'SELECT programme_id FROM lecturer_programmes WHERE lecturer_id = ?',
        [lecturer.id]
      ),
      query('SELECT unit_id FROM lecturer_units WHERE lecturer_id = ?', [
        lecturer.id
      ])
    ])
  return {
    id: lecturer.id,
    staffNumber: lecturer.staff_number,
    title: lecturer.title || '',
    employmentStatus: lecturer.employment_status,
    facultyIds: facultyRows.map(row => Number(row.faculty_id)),
    departmentIds: departmentRows.map(row => Number(row.department_id)),
    programmeIds: programmeRows.map(row => Number(row.programme_id)),
    unitIds: unitRows.map(row => Number(row.unit_id))
  }
}

export const updateLecturerAcademicProfile = async (userId, payload) => {
  const lecturer = (
    await query('SELECT * FROM lecturers WHERE user_id = ? LIMIT 1', [userId])
  )[0]
  if (!lecturer) throw new Error('Lecturer profile was not found.')

  const faculties = [
    ...new Set((payload.facultyIds || []).map(Number).filter(Boolean))
  ]
  const departments = [
    ...new Set((payload.departmentIds || []).map(Number).filter(Boolean))
  ]
  const programmes = [
    ...new Set((payload.programmeIds || []).map(Number).filter(Boolean))
  ]
  const units = [
    ...new Set((payload.unitIds || []).map(Number).filter(Boolean))
  ]
  if (
    !faculties.length ||
    !departments.length ||
    !programmes.length ||
    !units.length
  ) {
    throw new Error(
      'Select at least one faculty, department, programme, and unit.'
    )
  }

  const facultyRows = await query(
    `SELECT id FROM faculties WHERE id IN (${faculties
      .map(() => '?')
      .join(',')})`,
    faculties
  )
  if (facultyRows.length !== faculties.length)
    throw new Error('One or more selected faculties are invalid.')
  const departmentRows = await query(
    `SELECT id, faculty_id FROM departments WHERE id IN (${departments
      .map(() => '?')
      .join(',')})`,
    departments
  )
  if (
    departmentRows.length !== departments.length ||
    departmentRows.some(row => !faculties.includes(Number(row.faculty_id)))
  ) {
    throw new Error(
      'Each selected department must belong to one of the selected faculties.'
    )
  }
  const programmeRows = await query(
    `SELECT id, department_id FROM programmes WHERE id IN (${programmes
      .map(() => '?')
      .join(',')})`,
    programmes
  )
  if (
    programmeRows.length !== programmes.length ||
    programmeRows.some(row => !departments.includes(Number(row.department_id)))
  ) {
    throw new Error(
      'Each selected programme must belong to one of the selected departments.'
    )
  }
  const unitRows = await query(
    `SELECT DISTINCT u.id
     FROM units u
     JOIN unit_programmes up ON up.unit_id = u.id
     JOIN programmes p ON p.id = up.programme_id
     WHERE u.id IN (${units.map(() => '?').join(',')})
       AND p.id IN (${programmes.map(() => '?').join(',')})
       AND p.department_id IN (${departments.map(() => '?').join(',')})`,
    [...units, ...programmes, ...departments]
  )
  if (unitRows.length !== units.length) {
    throw new Error(
      'Each selected unit must belong to one of the selected programmes and departments.'
    )
  }

  await rawQuery('DELETE FROM lecturer_units WHERE lecturer_id = ?', [
    lecturer.id
  ])
  await rawQuery('DELETE FROM lecturer_programmes WHERE lecturer_id = ?', [
    lecturer.id
  ])
  await rawQuery('DELETE FROM lecturer_departments WHERE lecturer_id = ?', [
    lecturer.id
  ])
  await rawQuery('DELETE FROM lecturer_faculties WHERE lecturer_id = ?', [
    lecturer.id
  ])
  for (const facultyId of faculties)
    await rawQuery(
      'INSERT INTO lecturer_faculties (lecturer_id, faculty_id) VALUES (?, ?)',
      [lecturer.id, facultyId]
    )
  for (const departmentId of departments)
    await rawQuery(
      'INSERT INTO lecturer_departments (lecturer_id, department_id) VALUES (?, ?)',
      [lecturer.id, departmentId]
    )
  for (const programmeId of programmes)
    await rawQuery(
      'INSERT INTO lecturer_programmes (lecturer_id, programme_id) VALUES (?, ?)',
      [lecturer.id, programmeId]
    )
  for (const unitId of units)
    await rawQuery(
      'INSERT INTO lecturer_units (lecturer_id, unit_id) VALUES (?, ?)',
      [lecturer.id, unitId]
    )
  await rawQuery(
    'UPDATE lecturers SET department_id = ?, title = ? WHERE id = ?',
    [departments[0], payload.title ?? lecturer.title, lecturer.id]
  )
  return getLecturerAcademicProfile(userId)
}

export const loginUser = async ({ email, password }) => {
  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  await ensureDefaultAdmin()

  const rows = await query('SELECT * FROM users WHERE email = ?', [email])
  const user = rows[0]

  if (!user) {
    throw new Error('Invalid credentials.')
  }

  if (!user.is_active) {
    throw new Error('This account has been blocked. Contact an administrator.')
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    throw new Error('Invalid credentials.')
  }

  const roles = await getUserRoles(user.id)

  const tokens = issueTokens({ id: user.id, email: user.email, roles })

  return {
    user: {
      id: user.id,
      email: user.email,
      roles,
      firstName: user.first_name,
      lastName: user.last_name
    },
    ...tokens
  }
}

export const refreshSession = async refreshToken => {
  if (!refreshToken) {
    throw new Error('Refresh token is required.')
  }

  const decoded = verifyRefreshToken(refreshToken)
  const rows = await query('SELECT * FROM users WHERE id = ?', [decoded.id])
  const user = rows[0]

  if (!user) {
    throw new Error('User not found for refresh token.')
  }

  if (!user.is_active) {
    throw new Error('This account has been blocked. Contact an administrator.')
  }

  const roles = await getUserRoles(user.id)
  const tokens = issueTokens({ id: user.id, email: user.email, roles })

  return {
    user: {
      id: user.id,
      email: user.email,
      roles,
      firstName: user.first_name,
      lastName: user.last_name
    },
    ...tokens
  }
}

export const rotateSession = async refreshToken => {
  const result = await refreshSession(refreshToken)
  return {
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken
  }
}

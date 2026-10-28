import {
  createRow,
  findById,
  listRows,
  query,
  rawQuery
} from '../repositories/sqlRepository.js'
import db from '../config/db.js'
import { validateTimetableEntry } from './scheduling/conflictService.js'

export const listTimetableEntries = async user => {
  const roles = Array.isArray(user?.roles) ? user.roles : []
  const lecturerId = roles.includes('LECTURER')
    ? (
        await query('SELECT id FROM lecturers WHERE user_id = ? LIMIT 1', [
          user.id
        ])
      )[0]?.id
    : null
  const entries = (
    await rawQuery(
      `
    SELECT te.*, te.unit_id AS course_id,
      MAX(u.code) AS unit_code,
      MAX(u.name) AS unit_name,
      MAX(CONCAT_WS(' ', NULLIF(lu.first_name, ''), NULLIF(lu.last_name, ''))) AS lecturer_name,
      MAX(lu.email) AS lecturer_email,
      MAX(v.name) AS venue_name,
      MAX(v.code) AS venue_code,
      MAX(v.capacity) AS venue_capacity,
      GROUP_CONCAT(DISTINCT tec.cohort_id) AS cohort_ids,
      GROUP_CONCAT(DISTINCT tep.programme_id) AS programme_ids
    FROM timetable_entries te
    LEFT JOIN units u ON u.id = te.unit_id
    LEFT JOIN lecturers l ON l.id = te.lecturer_id
    LEFT JOIN users lu ON lu.id = l.user_id
    LEFT JOIN venues v ON v.id = te.venue_id
    LEFT JOIN timetable_entry_cohorts tec ON tec.timetable_entry_id = te.id
    LEFT JOIN timetable_entry_programmes tep ON tep.timetable_entry_id = te.id
    ${lecturerId ? 'WHERE te.lecturer_id = ?' : ''}
    GROUP BY te.id
    ORDER BY te.id
  `,
      lecturerId ? [lecturerId] : []
    )
  ).map(row => ({
    ...row,
    unitCode: row.unit_code,
    unitName: row.unit_name,
    lecturerName: row.lecturer_name || row.lecturer_email,
    venueName: row.venue_name,
    venueCode: row.venue_code,
    venueCapacity: row.venue_capacity,
    cohortIds: row.cohort_ids
      ? String(row.cohort_ids).split(',').map(Number)
      : row.cohort_id
      ? [Number(row.cohort_id)]
      : [],
    programmeIds: row.programme_ids
      ? String(row.programme_ids).split(',').map(Number)
      : []
  }))
  const overrides = await rawQuery(
    `SELECT so.*, DATE_FORMAT(so.effective_date, '%Y-%m-%d') AS effective_date,
      te.academic_year_id, te.semester_id, te.unit_id AS course_id,
       te.lecturer_id, te.event_type, te.status AS recurring_status,
       te.cohort_id, u.code AS unit_code, u.name AS unit_name,
       v.name AS venue_name, v.code AS venue_code,
       GROUP_CONCAT(DISTINCT tec.cohort_id) AS cohort_ids,
       GROUP_CONCAT(DISTINCT tep.programme_id) AS programme_ids
     FROM schedule_overrides so
     JOIN timetable_entries te ON te.id = so.timetable_entry_id
    JOIN units u ON u.id = te.unit_id
     JOIN venues v ON v.id = so.new_venue_id
     LEFT JOIN timetable_entry_cohorts tec ON tec.timetable_entry_id = te.id
     LEFT JOIN timetable_entry_programmes tep ON tep.timetable_entry_id = te.id
    WHERE so.status = 'APPROVED' AND so.effective_date >= CURDATE() ${
      lecturerId ? 'AND te.lecturer_id = ?' : ''
    }
     GROUP BY so.id
     ORDER BY so.effective_date, so.new_start_time`,
    lecturerId ? [lecturerId] : []
  )
  return [
    ...entries,
    ...overrides.map(item => ({
      ...item,
      id: `makeup-${item.id}`,
      overrideId: Number(item.id),
      isMakeup: true,
      effective_date: item.effective_date,
      day_of_week: weekdayFromDate(item.effective_date),
      venue_id: item.new_venue_id,
      venue_name: item.venue_name,
      venue_code: item.venue_code,
      start_time: item.new_start_time,
      end_time: item.new_end_time,
      event_type: 'MAKEUP',
      unitCode: item.unit_code,
      unitName: item.unit_name,
      cohortIds: item.cohort_ids
        ? String(item.cohort_ids).split(',').map(Number)
        : [],
      programmeIds: item.programme_ids
        ? String(item.programme_ids).split(',').map(Number)
        : []
    }))
  ]
}
export const getTimetableEntry = async id => findById('timetable_entries', id)

const weekdayFromDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!match) return null
  return [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ][
    new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    ).getUTCDay()
  ]
}

export const createTimetableEntry = async payload => {
  const actorRoles = Array.isArray(payload.actor_roles)
    ? payload.actor_roles
    : []
  if (actorRoles.includes('LECTURER')) {
    const assignedLecturer = await findById('lecturers', payload.lecturer_id)
    if (
      !assignedLecturer ||
      Number(assignedLecturer.userId ?? assignedLecturer.user_id) !==
        Number(payload.actor_user_id)
    ) {
      return {
        valid: false,
        conflicts: [
          {
            type: 'FORBIDDEN',
            message: 'Lecturers can only schedule their own classes.'
          }
        ]
      }
    }
  }
  const dayOfWeek = payload.day_of_week ?? payload.dayOfWeek
  const cohortIds = (
    Array.isArray(payload.cohort_ids) && payload.cohort_ids.length
      ? payload.cohort_ids
      : [payload.cohort_id]
  )
    .map(Number)
    .filter(Boolean)
  const existingEvents = payload.existing_events ||
    payload.existingEvents || [
      ...(
        await rawQuery(`
      SELECT te.*,
        GROUP_CONCAT(DISTINCT tec.cohort_id) AS cohort_ids,
        GROUP_CONCAT(DISTINCT tep.programme_id) AS programme_ids
      FROM timetable_entries te
      LEFT JOIN timetable_entry_cohorts tec ON tec.timetable_entry_id = te.id
      LEFT JOIN timetable_entry_programmes tep ON tep.timetable_entry_id = te.id
      WHERE te.status = 'SCHEDULED'
      GROUP BY te.id
    `)
      ).map(event => ({
        ...event,
        cohort_ids: event.cohort_ids || String(event.cohort_id || ''),
        event_type: event.event_type || 'LECTURE'
      })),
      ...(
        await rawQuery(`
      SELECT e.id, DATE_FORMAT(e.exam_date, '%Y-%m-%d') AS exam_date,
        e.start_time, e.end_time, 'EXAM' AS event_type,
        GROUP_CONCAT(DISTINCT ec.cohort_id) AS cohort_ids,
        GROUP_CONCAT(DISTINCT eva.venue_id) AS venue_ids
      FROM exams e
      LEFT JOIN exam_cohorts ec ON ec.exam_id = e.id
      LEFT JOIN exam_venue_allocations eva ON eva.exam_id = e.id
      WHERE e.status = 'SCHEDULED'
      GROUP BY e.id
    `)
      ).map(exam => ({
        ...exam,
        day_of_week: weekdayFromDate(exam.exam_date),
        start_time: String(exam.start_time).slice(0, 5),
        end_time: String(exam.end_time).slice(0, 5),
        venue_ids: exam.venue_ids || '',
        cohort_ids: exam.cohort_ids || ''
      }))
    ]
  const venueBlocks =
    payload.venue_blocks ||
    payload.venueBlocks ||
    (await listRows('venue_blocks'))
  const venue = (await listRows('venues')).find(
    item => Number(item.id) === Number(payload.venue_id)
  )
  const lecturer = await findById('lecturers', payload.lecturer_id)
  const lecturerUser = lecturer?.user_id
    ? (
        await query(
          'SELECT first_name, last_name, email FROM users WHERE id = ?',
          [lecturer.user_id]
        )
      )[0]
    : null
  const lecturerName = lecturerUser
    ? `${lecturerUser.first_name || ''} ${
        lecturerUser.last_name || ''
      }`.trim() || lecturerUser.email
    : null
  const cohort = await findById('cohorts', payload.cohort_id)
  const expectedStudents = Number(
    payload.expected_students ?? payload.expectedStudents ?? 0
  )
  const venueCapacity = Number(
    payload.venue_capacity ??
      payload.venueCapacity ??
      (venue ? venue.capacity : 0)
  )

  const validation = validateTimetableEntry({
    venueId: payload.venue_id,
    venueName: venue?.name,
    lecturerId: payload.lecturer_id,
    lecturerName,
    cohortId: payload.cohort_id,
    cohortName: cohort?.name,
    dayOfWeek,
    cohortIds,
    expectedStudents: payload.allow_capacity_override
      ? undefined
      : expectedStudents,
    venueCapacity,
    startTime: payload.start_time,
    endTime: payload.end_time,
    existingEvents,
    venueBlocks
  })

  if (!validation.valid) {
    return { valid: false, conflicts: validation.conflicts }
  }

  const programmeIds = (payload.programme_ids || []).map(Number).filter(Boolean)
  const record = await createRow('timetable_entries', {
    academic_year_id: payload.academic_year_id,
    semester_id: payload.semester_id,
    unit_id: payload.course_id,
    cohort_id: cohortIds[0],
    lecturer_id: payload.lecturer_id,
    venue_id: payload.venue_id,
    day_of_week: payload.day_of_week,
    start_time: payload.start_time,
    end_time: payload.end_time,
    event_type: payload.event_type || 'LECTURE',
    status: payload.status || 'SCHEDULED',
    created_by: payload.created_by || 1,
    updated_by: payload.updated_by || 1
  })

  for (const programmeId of programmeIds) {
    await rawQuery(
      'INSERT INTO timetable_entry_programmes (timetable_entry_id, programme_id) VALUES (?, ?)',
      [record.id, programmeId]
    )
  }
  for (const cohortId of cohortIds) {
    await rawQuery(
      'INSERT INTO timetable_entry_cohorts (timetable_entry_id, cohort_id) VALUES (?, ?)',
      [record.id, cohortId]
    )
  }

  return { valid: true, data: record }
}

export const updateTimetableEntry = async (id, updates) => {
  const {
    programme_ids: programmeIds = [],
    cohort_ids: cohortIds = [],
    ...fields
  } = updates
  const dbFields = { ...fields }
  if (dbFields.course_id !== undefined) {
    dbFields.unit_id = dbFields.course_id
    delete dbFields.course_id
  }
  const allowedFields = [
    'academic_year_id',
    'semester_id',
    'unit_id',
    'cohort_id',
    'lecturer_id',
    'venue_id',
    'day_of_week',
    'start_time',
    'end_time',
    'event_type',
    'status',
    'updated_by'
  ]
  const safeFields = Object.fromEntries(
    Object.entries(dbFields).filter(([key]) => allowedFields.includes(key))
  )
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [existing] = await connection.execute(
      'SELECT id FROM timetable_entries WHERE id = ? FOR UPDATE',
      [id]
    )
    if (!existing.length) {
      await connection.rollback()
      return null
    }
    const keys = Object.keys(safeFields)
    if (keys.length) {
      const assignments = keys.map(key => `\`${key}\` = ?`).join(', ')
      await connection.execute(
        `UPDATE timetable_entries SET ${assignments} WHERE id = ?`,
        [...Object.values(safeFields), id]
      )
    }
    if (Array.isArray(programmeIds)) {
      await connection.execute(
        'DELETE FROM timetable_entry_programmes WHERE timetable_entry_id = ?',
        [id]
      )
      for (const programmeId of programmeIds.map(Number).filter(Boolean)) {
        await connection.execute(
          'INSERT INTO timetable_entry_programmes (timetable_entry_id, programme_id) VALUES (?, ?)',
          [id, programmeId]
        )
      }
    }
    if (Array.isArray(cohortIds)) {
      await connection.execute(
        'DELETE FROM timetable_entry_cohorts WHERE timetable_entry_id = ?',
        [id]
      )
      for (const cohortId of cohortIds.map(Number).filter(Boolean)) {
        await connection.execute(
          'INSERT INTO timetable_entry_cohorts (timetable_entry_id, cohort_id) VALUES (?, ?)',
          [id, cohortId]
        )
      }
    }
    const [rows] = await connection.execute(
      'SELECT * FROM timetable_entries WHERE id = ?',
      [id]
    )
    await connection.commit()
    return rows[0]
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export const listAvailability = async ({
  date,
  day,
  startTime,
  endTime,
  excludeTimetableEntryId,
  requiredCapacity,
  venueType
}) => {
  const venues = await listRows('venues')
  let bookedEvents = []
  let activeBlocks = []
  const normalizedStart = String(startTime || '').slice(0, 5)
  const normalizedEnd = String(endTime || '').slice(0, 5)
  const requestedDay = day || (date ? weekdayFromDate(date) : null)
  const queryDate = date || null

  if ((queryDate || requestedDay) && normalizedStart && normalizedEnd) {
    const dayOfWeek = queryDate ? weekdayFromDate(queryDate) : requestedDay
    const shortDay = String(dayOfWeek || '')
      .slice(0, 3)
      .toUpperCase()
    const regularEntries = await rawQuery(
      `SELECT id, venue_id, lecturer_id, cohort_id, day_of_week, start_time, end_time, event_type
       FROM timetable_entries WHERE status = 'SCHEDULED'`
    )
    const entriesOnDay = regularEntries.filter(
      entry =>
        String(entry.day_of_week || '')
          .slice(0, 3)
          .toUpperCase() === shortDay
    )

    const appliedOverrides = queryDate
      ? await listRows('schedule_overrides', {
          effective_date: queryDate,
          status: 'APPROVED'
        })
      : []
    const overriddenEntryIds = new Set(
      appliedOverrides.map(item =>
        Number(item.timetableEntryId ?? item.timetable_entry_id)
      )
    )

    const exams = queryDate
      ? await rawQuery(
          `SELECT e.id, e.start_time, e.end_time, GROUP_CONCAT(DISTINCT eva.venue_id) AS venue_ids
           FROM exams e JOIN exam_venue_allocations eva ON eva.exam_id = e.id
           WHERE e.exam_date = ? AND e.status = 'SCHEDULED'
           GROUP BY e.id`,
          [queryDate]
        )
      : await rawQuery(
          `SELECT e.id, e.exam_date, e.start_time, e.end_time,
              GROUP_CONCAT(DISTINCT eva.venue_id) AS venue_ids
           FROM exams e JOIN exam_venue_allocations eva ON eva.exam_id = e.id
           WHERE e.status = 'SCHEDULED' AND DAYNAME(e.exam_date) = ?
           GROUP BY e.id`,
          [requestedDay]
        )

    bookedEvents = [
      ...entriesOnDay.filter(
        item =>
          !overriddenEntryIds.has(Number(item.id)) &&
          Number(item.id) !== Number(excludeTimetableEntryId)
      ),
      ...exams.map(item => ({
        ...item,
        venue_ids: item.venue_ids,
        event_type: 'EXAM',
        start_time: String(item.start_time || '').slice(0, 5),
        end_time: String(item.end_time || '').slice(0, 5)
      })),
      ...appliedOverrides.map(item => ({
        id: `makeup-${item.id}`,
        venue_id: item.newVenueId ?? item.new_venue_id,
        lecturer_id: null,
        cohort_id: null,
        day_of_week: dayOfWeek,
        start_time: String(
          item.newStartTime ?? (item.new_start_time || '')
        ).slice(0, 5),
        end_time: String(item.newEndTime ?? (item.new_end_time || '')).slice(
          0,
          5
        ),
        event_type: 'MAKEUP'
      }))
    ]

    if (queryDate) {
      activeBlocks = await query(
        `SELECT id, venue_id FROM venue_blocks
         WHERE status = 'ACTIVE' AND DATE(start_datetime) <= ? AND DATE(end_datetime) >= ?
           AND TIME(start_datetime) < ? AND TIME(end_datetime) > ?`,
        [queryDate, queryDate, normalizedEnd, normalizedStart]
      )
    }
  }

  return venues.filter(venue => {
    if (Number(venue.capacity) < Number(requiredCapacity || 0)) return false
    if (venue.status !== 'ACTIVE') return false
    if (venueType && Number(venue.venue_type_id) !== Number(venueType))
      return false
    if ((queryDate || requestedDay) && normalizedStart && normalizedEnd) {
      if (
        activeBlocks.some(block => Number(block.venue_id) === Number(venue.id))
      )
        return false
      if (
        bookedEvents.some(event => {
          const venuesForEvent = String(event.venue_ids || event.venue_id || '')
            .split(',')
            .filter(Boolean)
            .map(Number)
          if (!venuesForEvent.includes(Number(venue.id))) return false
          const eventStart = String(event.start_time || '').slice(0, 5)
          const eventEnd = String(event.end_time || '').slice(0, 5)
          return normalizedStart < eventEnd && normalizedEnd > eventStart
        })
      )
        return false
    }
    return true
  })
}

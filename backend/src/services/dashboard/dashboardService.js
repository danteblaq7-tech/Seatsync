import { query } from '../../repositories/sqlRepository.js'
import {
  getExamVisibility,
  getTimetableVisibility
} from '../timetableVisibility.js'

const getCurrentDayName = () => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return dayNames[new Date().getDay()]
}

const summarizeEntries = rows =>
  rows.map(row => ({
    ...row,
    courseId: row.course_id ?? row.courseId,
    courseName:
      row.course_name ?? row.courseName ?? row.courseName ?? row.courseId,
    venueId: row.venue_id ?? row.venueId,
    venueName: row.venue_name ?? row.venueName ?? row.venueId,
    lecturerId: row.lecturer_id ?? row.lecturerId,
    cohortId: row.cohort_id ?? row.cohortId,
    dayOfWeek: row.day_of_week ?? row.dayOfWeek,
    startTime: row.start_time ?? row.startTime,
    endTime: row.end_time ?? row.endTime
  }))

const normalizeDay = value =>
  String(value || '')
    .slice(0, 3)
    .toUpperCase()

const timeInMinutes = value => {
  const [hour, minute] = String(value || '00:00').split(':').map(Number)
  return hour * 60 + minute
}

const isCurrentTime = (start, end, currentTime) =>
  timeInMinutes(currentTime) >= timeInMinutes(start) &&
  timeInMinutes(currentTime) < timeInMinutes(end)

const getLiveVenueSummary = async () => {
  const current = (
    await query(
      `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today,
        DAYNAME(CURDATE()) AS day_name,
        TIME_FORMAT(CURTIME(), '%H:%i') AS current_clock`
    )
  )[0]
  const [venues, events, overrides, examVenues, blockedVenues] =
    await Promise.all([
      query('SELECT id, code, name, capacity, status FROM venues ORDER BY name'),
      query(
        `SELECT id, venue_id, day_of_week, start_time, end_time
         FROM timetable_entries WHERE status = 'SCHEDULED'`
      ),
      query(
        `SELECT so.id, so.timetable_entry_id, so.new_venue_id,
            TIME_FORMAT(so.new_start_time, '%H:%i') AS new_start_time,
            TIME_FORMAT(so.new_end_time, '%H:%i') AS new_end_time,
            DATE_FORMAT(so.effective_date, '%Y-%m-%d') AS effective_date,
            u.code AS unit_code, u.name AS unit_name,
            v.name AS venue_name, v.code AS venue_code
         FROM schedule_overrides so
         JOIN timetable_entries te ON te.id = so.timetable_entry_id
         JOIN units u ON u.id = te.unit_id
         JOIN venues v ON v.id = so.new_venue_id
         WHERE so.effective_date >= ? AND so.status = 'APPROVED'`,
        [current.today]
      ),
      query(
        `SELECT DISTINCT eva.venue_id
         FROM exam_venue_allocations eva
         JOIN exams e ON e.id = eva.exam_id
         WHERE e.exam_date = ? AND e.status = 'SCHEDULED'
           AND e.start_time <= ? AND e.end_time > ?`,
        [current.today, current.current_clock, current.current_clock]
      ),
      query(
        `SELECT DISTINCT venue_id FROM venue_blocks
         WHERE status = 'ACTIVE' AND start_datetime <= NOW() AND end_datetime > NOW()`
      )
    ])
  const todaysOverrides = overrides.filter(
    override => override.effective_date === current.today
  )
  const appliedEntryIds = new Set(
    todaysOverrides.map(override => Number(override.timetable_entry_id))
  )
  const occupiedIds = new Set(
    events
      .filter(
        event =>
          normalizeDay(event.day_of_week) === normalizeDay(current.day_name) &&
          !appliedEntryIds.has(Number(event.id)) &&
          isCurrentTime(event.start_time, event.end_time, current.current_clock)
      )
      .map(event => Number(event.venue_id))
  )
  todaysOverrides
    .filter(override =>
      isCurrentTime(
        override.new_start_time,
        override.new_end_time,
        current.current_clock
      )
    )
    .forEach(override => occupiedIds.add(Number(override.new_venue_id)))
  examVenues.forEach(venue => occupiedIds.add(Number(venue.venue_id)))
  blockedVenues.forEach(venue => occupiedIds.add(Number(venue.venue_id)))

  const availableVenues = venues.filter(
    venue => venue.status === 'ACTIVE' && !occupiedIds.has(Number(venue.id))
  )
  const occupiedVenues = venues.filter(venue =>
    occupiedIds.has(Number(venue.id))
  )
  const activeMakeupClasses = overrides
    .filter(
      override =>
        override.effective_date > current.today ||
        (override.effective_date === current.today &&
          timeInMinutes(override.new_end_time) >
            timeInMinutes(current.current_clock))
    )
    .map(override => ({
      ...override,
      value: `${override.effective_date} · ${override.unit_code} ${override.unit_name} · ${override.venue_name} · ${override.new_start_time}-${override.new_end_time}`
    }))

  return { availableVenues, occupiedVenues, activeMakeupClasses }
}

const getLecturerDashboard = async user => {
  const lecturer = (
    await query('SELECT id FROM lecturers WHERE user_id = ? LIMIT 1', [user.id])
  )[0]
  if (!lecturer) {
    return {
      role: 'LECTURER',
      stats: [
        { label: 'Classes today', value: '0' },
        { label: 'Upcoming teaching events', value: '0' },
        { label: 'Teaching units', value: '0' },
        { label: 'Available venues today', value: '0' }
      ],
      lists: {
        todaysClasses: [],
        upcomingClasses: [],
        venueAvailability: [],
        occupiedVenues: [],
        activeMakeupClasses: []
      }
    }
  }

  const events = await query(
    `SELECT te.*, te.unit_id AS course_id,
       u.code AS unit_code, u.name AS unit_name, v.name AS venue_name,
       v.code AS venue_code, v.capacity AS venue_capacity,
       GROUP_CONCAT(DISTINCT tec.cohort_id) AS cohort_ids
     FROM timetable_entries te
    JOIN units u ON u.id = te.unit_id
     JOIN venues v ON v.id = te.venue_id
     LEFT JOIN timetable_entry_cohorts tec ON tec.timetable_entry_id = te.id
     WHERE te.lecturer_id = ? AND te.status = 'SCHEDULED'
     GROUP BY te.id ORDER BY te.day_of_week, te.start_time`,
    [lecturer.id]
  )
  const dayOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const today = normalizeDay(getCurrentDayName())
  const todayDate = (
    await query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today")
  )[0]?.today
  const todaysOverrides = await query(
    `SELECT so.*, te.unit_id AS course_id, te.lecturer_id, te.cohort_id,
       u.code AS unit_code, u.name AS unit_name, v.name AS venue_name, v.code AS venue_code
     FROM schedule_overrides so
     JOIN timetable_entries te ON te.id = so.timetable_entry_id
    JOIN units u ON u.id = te.unit_id
     JOIN venues v ON v.id = so.new_venue_id
     WHERE te.lecturer_id = ? AND so.effective_date = ? AND so.status = 'APPROVED'`,
    [lecturer.id, todayDate]
  )
  const overriddenIds = new Set(
    todaysOverrides.map(item => Number(item.timetable_entry_id))
  )
  const regularTodayClasses = events.filter(
    event =>
      normalizeDay(event.day_of_week) === today &&
      !overriddenIds.has(Number(event.id))
  )
  const todayClasses = [
    ...regularTodayClasses,
    ...todaysOverrides.map(item => ({
      ...item,
      venue_id: item.new_venue_id,
      start_time: item.new_start_time,
      end_time: item.new_end_time,
      event_type: 'MAKEUP',
      day_of_week: getCurrentDayName()
    }))
  ]
  const upcomingClasses = events.filter(event => {
    const eventDay = normalizeDay(event.day_of_week)
    if (eventDay === today) {
      const [hour, minute] = String(event.start_time).split(':').map(Number)
      const current = new Date().getHours() * 60 + new Date().getMinutes()
      return hour * 60 + minute > current
    }
    return dayOrder.indexOf(eventDay) > dayOrder.indexOf(today)
  })
  const unitRows = await query(
    'SELECT COUNT(DISTINCT unit_id) AS total FROM lecturer_units WHERE lecturer_id = ?',
    [lecturer.id]
  )
  const { availableVenues, occupiedVenues } = await getLiveVenueSummary()
  const activeMakeupClasses = await query(
    `SELECT so.*, te.unit_id AS course_id, te.lecturer_id, te.cohort_id,
       u.code AS unit_code, u.name AS unit_name,
       v.name AS venue_name, v.code AS venue_code
     FROM schedule_overrides so
     JOIN timetable_entries te ON te.id = so.timetable_entry_id
     JOIN units u ON u.id = te.unit_id
     JOIN venues v ON v.id = so.new_venue_id
     WHERE te.lecturer_id = ? AND so.effective_date >= CURDATE()
       AND so.status = 'APPROVED'
     ORDER BY so.effective_date, so.new_start_time`,
    [lecturer.id]
  )
  activeMakeupClasses.forEach(event => {
     event.value = `${String(event.effective_date).slice(0, 10)} · ${event.unit_code} ${event.unit_name} · ${event.venue_name} · ${event.new_start_time}-${event.new_end_time}`
  })
  const entries = rows =>
    rows.map(event => ({
      ...event,
      course_name: event.unit_name,
      venue_name: event.venue_name,
      value: `${event.day_of_week} · ${String(event.start_time).slice(
        0,
        5
      )}-${String(event.end_time).slice(0, 5)}`
    }))

  return {
    role: 'LECTURER',
    stats: [
      { label: 'Classes today', value: String(todayClasses.length) },
      {
        label: 'Upcoming teaching events',
        value: String(upcomingClasses.length)
      },
      {
        label: 'Teaching units',
        value: String(Number(unitRows[0]?.total || 0))
      },
      { label: 'Available venues now', value: String(availableVenues.length) },
      { label: 'Occupied venues now', value: String(occupiedVenues.length) },
      {
        label: 'Active make-up classes',
        value: String(activeMakeupClasses.length)
      }
    ],
    lists: {
      todaysClasses: entries(todayClasses),
      upcomingClasses: entries(upcomingClasses),
      venueAvailability: availableVenues.map(venue => ({
        ...venue,
        value: `${venue.code || ''} ${venue.name} · ${venue.capacity} seats`
      })),
      occupiedVenues: occupiedVenues.map(venue => ({
        ...venue,
        value: `${venue.code || ''} ${venue.name} · ${venue.capacity} seats`
      })),
      activeMakeupClasses
    }
  }
}

export const getDashboardSummary = async user => {
  const roles = Array.isArray(user?.roles)
    ? user.roles
    : user?.roles
    ? [user.roles]
    : ['STUDENT']

  if (roles.includes('LECTURER') && !roles.includes('ADMIN'))
    return getLecturerDashboard(user)

  const currentYear = (
    await query(
      'SELECT * FROM academic_years WHERE is_current = TRUE ORDER BY id DESC LIMIT 1'
    )
  )[0]

  const currentSemester = (
    await query(
      'SELECT * FROM semesters WHERE is_current = TRUE ORDER BY id DESC LIMIT 1'
    )
  )[0]

  const scopedUser = { ...user, roles }
  const timetableVisibility = getTimetableVisibility(scopedUser)
  const timetableScope = timetableVisibility.clause
    ? `AND ${timetableVisibility.clause.slice('WHERE '.length)}`
    : ''
  const examVisibility = getExamVisibility(scopedUser)
  const liveVenueSummary = await getLiveVenueSummary()
  const venueStats = (
    await query('SELECT COUNT(*) AS total_venues FROM venues')
  )[0]

  const safeArray = value => (Array.isArray(value) ? value : [])

  const timetableStats = (
    await query(
      `SELECT COUNT(*) AS active_entries FROM timetable_entries te
       WHERE te.status = 'SCHEDULED' ${timetableScope}`,
      timetableVisibility.params
    )
  )[0]

  const examStats = (
    await query(
      `SELECT COUNT(*) AS upcoming_exams FROM exams e
       WHERE e.exam_date >= CURDATE() ${examVisibility.clause}`,
      examVisibility.params
    )
  )[0]

  const conflictStats = (
    await query(`
      SELECT COUNT(*) AS scheduling_conflicts
      FROM timetable_entries t1
      JOIN timetable_entries t2
        ON t1.id < t2.id
       AND t1.venue_id = t2.venue_id
       AND t1.day_of_week = t2.day_of_week
       AND t1.start_time < t2.end_time
       AND t2.start_time < t1.end_time
    `)
  )[0]

  const recentEntries = summarizeEntries(
    await query(
      `SELECT te.*, te.unit_id AS course_id,
       c.name AS course_name, v.name AS venue_name
       FROM timetable_entries te
      LEFT JOIN units c ON c.id = te.unit_id
       LEFT JOIN venues v ON v.id = te.venue_id
       WHERE 1 = 1 ${timetableScope}
       ORDER BY te.updated_at DESC
       LIMIT 6`,
      timetableVisibility.params
    )
  )

  const recentAudit = await query(
    `SELECT a.*, u.first_name, u.last_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC
     LIMIT 6`
  )

  const todayName = getCurrentDayName()

  const todayClasses = summarizeEntries(
    await query(
      `SELECT te.*, te.unit_id AS course_id,
       c.name AS course_name, v.name AS venue_name
       FROM timetable_entries te
      LEFT JOIN units c ON c.id = te.unit_id
       LEFT JOIN venues v ON v.id = te.venue_id
       WHERE te.day_of_week = ? ${timetableScope}
       ORDER BY te.start_time ASC
       LIMIT 10`,
      [todayName, ...timetableVisibility.params]
    )
  )

  const upcomingClasses = summarizeEntries(
    await query(
      `SELECT te.*, te.unit_id AS course_id,
       c.name AS course_name, v.name AS venue_name
       FROM timetable_entries te
      LEFT JOIN units c ON c.id = te.unit_id
       LEFT JOIN venues v ON v.id = te.venue_id
       WHERE te.day_of_week >= ? ${timetableScope}
       ORDER BY te.day_of_week, te.start_time ASC
       LIMIT 8`,
      [todayName, ...timetableVisibility.params]
    )
  )

  const examList = await query(
    `SELECT e.*, e.unit_id AS course_id,
       c.name AS course_name, c.code AS course_code
     FROM exams e
     LEFT JOIN units c ON c.id = e.unit_id
     WHERE e.exam_date >= CURDATE() ${examVisibility.clause}
     ORDER BY e.exam_date ASC, e.start_time ASC
     LIMIT 6`,
    examVisibility.params
  )

  const notifications = await query(
    `SELECT * FROM notifications
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 6`,
    [Number(user.id)]
  )
  const activeMakeupClasses = roles.includes('ADMIN')
    ? liveVenueSummary.activeMakeupClasses
    : await query(
        `SELECT so.*, te.unit_id AS course_id, te.lecturer_id, te.cohort_id,
           u.code AS unit_code, u.name AS unit_name,
           v.name AS venue_name, v.code AS venue_code
         FROM schedule_overrides so
         JOIN timetable_entries te ON te.id = so.timetable_entry_id
         JOIN units u ON u.id = te.unit_id
         JOIN venues v ON v.id = so.new_venue_id
         WHERE so.effective_date >= CURDATE() AND so.status = 'APPROVED'
           ${timetableScope}
         ORDER BY so.effective_date, so.new_start_time`,
        timetableVisibility.params
      )
  activeMakeupClasses.forEach(event => {
    event.value = `${String(event.effective_date).slice(0, 10)} · ${event.unit_code} ${event.unit_name} · ${event.venue_name} · ${event.new_start_time}-${event.new_end_time}`
  })

  const baseSummary = {
    totalVenues: Number(venueStats?.total_venues || 0),
    availableVenues: liveVenueSummary.availableVenues.length,
    occupiedVenues: liveVenueSummary.occupiedVenues.length,
    activeTimetableEntries: Number(timetableStats?.active_entries || 0),
    currentAcademicYear: currentYear?.name || 'N/A',
    currentSemester: currentSemester?.name || 'N/A',
    activeMakeupClasses,
    upcomingExams: Number(examStats?.upcoming_exams || 0),
    schedulingConflicts: Number(conflictStats?.scheduling_conflicts || 0),
    recentTimetableChanges: safeArray(recentEntries),
    recentAuditActivity: safeArray(recentAudit),
    todayClasses: safeArray(todayClasses),
    upcomingClasses: safeArray(upcomingClasses),
    assignedVenues: liveVenueSummary.availableVenues.length,
    venueAvailability: liveVenueSummary.availableVenues,
    occupiedVenueList: liveVenueSummary.occupiedVenues,
    upcomingExamList: safeArray(examList),
    notifications: safeArray(notifications)
  }

  if (roles.includes('ADMIN')) {
    return {
      role: 'ADMIN',
      stats: [
        { label: 'Total venues', value: String(baseSummary.totalVenues) },
        {
          label: 'Available venues',
          value: String(baseSummary.availableVenues)
        },
        { label: 'Occupied venues', value: String(baseSummary.occupiedVenues) },
        {
          label: 'Active timetable entries',
          value: String(baseSummary.activeTimetableEntries)
        },
        {
          label: 'Current academic year',
          value: String(baseSummary.currentAcademicYear)
        },
        {
          label: 'Current semester',
          value: String(baseSummary.currentSemester)
        },
        {
          label: 'Active make-up classes',
          value: String(baseSummary.activeMakeupClasses.length)
        },
        { label: 'Upcoming exams', value: String(baseSummary.upcomingExams) },
        {
          label: 'Scheduling conflicts',
          value: String(baseSummary.schedulingConflicts)
        },
        {
          label: 'Recent timetable changes',
          value: String(baseSummary.recentTimetableChanges.length)
        }
      ],
      lists: {
        recentTimetableChanges: baseSummary.recentTimetableChanges,
        recentAuditActivity: baseSummary.recentAuditActivity,
        upcomingExams: examList,
        venueAvailability: liveVenueSummary.availableVenues.map(venue => ({
          ...venue,
          value: `${venue.code || ''} ${venue.name} · ${venue.capacity} seats`
        })),
        occupiedVenues: liveVenueSummary.occupiedVenues.map(venue => ({
          ...venue,
          value: `${venue.code || ''} ${venue.name} · ${venue.capacity} seats`
        })),
        activeMakeupClasses: baseSummary.activeMakeupClasses
      }
    }
  }

  if (roles.includes('LECTURER')) {
    return {
      role: 'LECTURER',
      stats: [
        { label: "Today's classes", value: String(todayClasses.length) },
        { label: 'Upcoming classes', value: String(upcomingClasses.length) },
        { label: 'Assigned venues', value: String(baseSummary.assignedVenues) },
        {
          label: 'Venue availability',
          value: String(baseSummary.availableVenues)
        },
        {
          label: 'Active make-up classes',
          value: String(baseSummary.activeMakeupClasses.length)
        },
        {
          label: 'Recent timetable changes',
          value: String(baseSummary.recentTimetableChanges.length)
        }
      ],
      lists: {
        todaysClasses: todayClasses,
        upcomingClasses,
        recentTimetableChanges: baseSummary.recentTimetableChanges,
        venueAvailability: liveVenueSummary.availableVenues,
        occupiedVenues: liveVenueSummary.occupiedVenues,
        activeMakeupClasses: baseSummary.activeMakeupClasses
      }
    }
  }

  if (roles.includes('CLASS_REP')) {
    return {
      role: 'CLASS_REP',
      stats: [
        {
          label: 'Cohort timetable',
          value: String(baseSummary.activeTimetableEntries)
        },
        { label: "Today's classes", value: String(todayClasses.length) },
        { label: 'Upcoming classes', value: String(upcomingClasses.length) },
        {
          label: 'Active make-up classes',
          value: String(baseSummary.activeMakeupClasses.length)
        },
        { label: 'Upcoming exams', value: String(baseSummary.upcomingExams) },
        { label: 'Notifications', value: String(notifications.length) }
      ],
      lists: {
        cohortTimetable: baseSummary.recentTimetableChanges,
        todaysClasses: todayClasses,
        upcomingClasses,
        activeMakeupClasses: baseSummary.activeMakeupClasses,
        upcomingExams: examList,
        notifications
      }
    }
  }

  return {
    role: 'STUDENT',
    stats: [
      { label: "Today's classes", value: String(todayClasses.length) },
      { label: 'Next class', value: todayClasses[0]?.startTime || 'N/A' },
      { label: 'Current venue', value: todayClasses[0]?.venueName || 'N/A' },
      { label: 'Upcoming classes', value: String(upcomingClasses.length) },
      { label: 'Upcoming exams', value: String(baseSummary.upcomingExams) },
      {
        label: 'Recent timetable changes',
        value: String(baseSummary.recentTimetableChanges.length)
      },
      { label: 'Notifications', value: String(notifications.length) }
    ],
    lists: {
      todaysClasses: todayClasses,
      upcomingClasses,
      recentTimetableChanges: baseSummary.recentTimetableChanges,
      upcomingExams: examList,
      venueAvailability: liveVenueSummary.availableVenues.map(venue => ({
        ...venue,
        value: `${venue.code || ''} ${venue.name} · ${venue.capacity} seats`
      })),
      occupiedVenues: liveVenueSummary.occupiedVenues.map(venue => ({
        ...venue,
        value: `${venue.code || ''} ${venue.name} · ${venue.capacity} seats`
      })),
      activeMakeupClasses: baseSummary.activeMakeupClasses,
      notifications
    }
  }
}

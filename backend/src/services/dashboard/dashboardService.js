import { query } from '../../repositories/sqlRepository.js'

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
        occupiedVenues: []
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
  const venues = await query(
    'SELECT id, code, name, capacity, status FROM venues ORDER BY name'
  )
  const [campusEvents, campusOverrides, blockedVenues, examVenues] =
    await Promise.all([
      query(`SELECT id, venue_id, day_of_week, start_time, end_time
           FROM timetable_entries WHERE status = 'SCHEDULED'`),
      query(
        `SELECT so.timetable_entry_id, so.new_venue_id, so.new_start_time, so.new_end_time
           FROM schedule_overrides so
          WHERE so.effective_date = ? AND so.status = 'APPROVED'`,
        [todayDate]
      ),
      query(`SELECT DISTINCT venue_id FROM venue_blocks
          WHERE status = 'ACTIVE' AND start_datetime <= NOW() AND end_datetime > NOW()`),
      query(`SELECT DISTINCT eva.venue_id
          FROM exam_venue_allocations eva JOIN exams e ON e.id = eva.exam_id
          WHERE e.exam_date = CURDATE() AND e.status = 'SCHEDULED'
            AND e.start_time <= CURTIME() AND e.end_time > CURTIME()`)
    ])
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const makeupEntryIds = new Set(
    campusOverrides.map(item => Number(item.timetable_entry_id))
  )
  const venueEventsToday = [
    ...campusEvents.filter(
      event =>
        normalizeDay(event.day_of_week) === today &&
        !makeupEntryIds.has(Number(event.id))
    ),
    ...campusOverrides.map(item => ({
      venue_id: item.new_venue_id,
      start_time: item.new_start_time,
      end_time: item.new_end_time
    }))
  ]
  const occupiedIds = new Set(
    venueEventsToday
      .filter(event => {
        const [startHour, startMinute] = String(event.start_time)
          .split(':')
          .map(Number)
        const [endHour, endMinute] = String(event.end_time)
          .split(':')
          .map(Number)
        return (
          currentMinutes >= startHour * 60 + startMinute &&
          currentMinutes < endHour * 60 + endMinute
        )
      })
      .map(event => Number(event.venue_id))
  )
  for (const venue of blockedVenues) occupiedIds.add(Number(venue.venue_id))
  for (const venue of examVenues) occupiedIds.add(Number(venue.venue_id))
  const availableVenues = venues.filter(
    venue => venue.status === 'ACTIVE' && !occupiedIds.has(Number(venue.id))
  )
  const occupiedVenues = venues.filter(venue =>
    occupiedIds.has(Number(venue.id))
  )
  const upcomingChanges = await query(
    `SELECT COUNT(*) AS total FROM schedule_overrides so
     JOIN timetable_entries te ON te.id = so.timetable_entry_id
     WHERE te.lecturer_id = ? AND so.status = 'APPROVED' AND so.effective_date >= CURDATE()`,
    [lecturer.id]
  )
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
        label: 'Upcoming make-up classes',
        value: String(Number(upcomingChanges[0]?.total || 0))
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
      }))
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

  const venueStats = (
    await query(
      'SELECT COUNT(*) AS total_venues, SUM(CASE WHEN status = "ACTIVE" THEN 1 ELSE 0 END) AS available_venues, SUM(CASE WHEN status != "ACTIVE" THEN 1 ELSE 0 END) AS occupied_venues FROM venues'
    )
  )[0]

  const safeArray = value => (Array.isArray(value) ? value : [])

  const timetableStats = (
    await query(
      'SELECT COUNT(*) AS active_entries FROM timetable_entries WHERE status = "SCHEDULED"'
    )
  )[0]

  const overrideStats = (
    await query(
      'SELECT COUNT(*) AS pending_overrides FROM schedule_overrides WHERE status = "PENDING"'
    )
  )[0]

  const examStats = (
    await query(
      'SELECT COUNT(*) AS upcoming_exams FROM exams WHERE exam_date >= CURDATE()'
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
       ORDER BY te.updated_at DESC
       LIMIT 6`
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
       WHERE te.day_of_week = ?
       ORDER BY te.start_time ASC
       LIMIT 10`,
      [todayName]
    )
  )

  const upcomingClasses = summarizeEntries(
    await query(
      `SELECT te.*, te.unit_id AS course_id,
       c.name AS course_name, v.name AS venue_name
       FROM timetable_entries te
      LEFT JOIN units c ON c.id = te.unit_id
       LEFT JOIN venues v ON v.id = te.venue_id
       WHERE te.day_of_week >= ?
       ORDER BY te.day_of_week, te.start_time ASC
       LIMIT 8`,
      [todayName]
    )
  )

  const venueAvailability = (
    await query(
      'SELECT COUNT(*) AS available_venues FROM venues WHERE status = "ACTIVE"'
    )
  )[0]

  const examList = await query(
    `SELECT e.*, e.unit_id AS course_id,
       c.name AS course_name, c.code AS course_code
     FROM exams e
     LEFT JOIN units c ON c.id = e.unit_id
     WHERE e.exam_date >= CURDATE()
     ORDER BY e.exam_date ASC, e.start_time ASC
     LIMIT 6`
  )

  const notifications = await query(
    `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 6`
  )

  const baseSummary = {
    totalVenues: Number(venueStats?.total_venues || 0),
    availableVenues: Number(venueStats?.available_venues || 0),
    occupiedVenues: Number(venueStats?.occupied_venues || 0),
    activeTimetableEntries: Number(timetableStats?.active_entries || 0),
    currentAcademicYear: currentYear?.name || 'N/A',
    currentSemester: currentSemester?.name || 'N/A',
    pendingScheduleOverrides: Number(overrideStats?.pending_overrides || 0),
    upcomingExams: Number(examStats?.upcoming_exams || 0),
    schedulingConflicts: Number(conflictStats?.scheduling_conflicts || 0),
    recentTimetableChanges: safeArray(recentEntries),
    recentAuditActivity: safeArray(recentAudit),
    todayClasses: safeArray(todayClasses),
    upcomingClasses: safeArray(upcomingClasses),
    assignedVenues: Number(venueAvailability?.available_venues || 0),
    venueAvailability: Number(venueAvailability?.available_venues || 0),
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
          label: 'Pending schedule overrides',
          value: String(baseSummary.pendingScheduleOverrides)
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
        upcomingExams: examList
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
          label: 'Pending temporary changes',
          value: String(baseSummary.pendingScheduleOverrides)
        },
        {
          label: 'Recent timetable changes',
          value: String(baseSummary.recentTimetableChanges.length)
        }
      ],
      lists: {
        todaysClasses: todayClasses,
        upcomingClasses,
        pendingTemporaryChanges: baseSummary.recentTimetableChanges,
        recentTimetableChanges: baseSummary.recentTimetableChanges,
        venueAvailability: baseSummary.availableVenues
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
          label: 'Venue changes',
          value: String(baseSummary.pendingScheduleOverrides)
        },
        { label: 'Upcoming exams', value: String(baseSummary.upcomingExams) },
        { label: 'Notifications', value: String(notifications.length) }
      ],
      lists: {
        cohortTimetable: baseSummary.recentTimetableChanges,
        todaysClasses: todayClasses,
        upcomingClasses,
        venueChanges: baseSummary.recentTimetableChanges,
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
      notifications
    }
  }
}

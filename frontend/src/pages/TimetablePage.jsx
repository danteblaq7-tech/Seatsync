import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { weekdayFromDateOnly } from '../utils/dateOnly'
import { semesterLabel } from '../utils/semesterLabel.js'
import { useAuth } from '../context/AuthContext'
import ScrollableSelect from '../components/ScrollableSelect'
import usePendingScheduleDrafts from '../hooks/usePendingScheduleDrafts'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const timeSlots = Array.from({ length: 15 }, (_, index) => index + 7)
const TIMETABLE_HOUR_HEIGHT = 72
const TIMETABLE_HOUR_GAP = 10
const TIMETABLE_MINUTES_PER_HOUR = TIMETABLE_HOUR_HEIGHT + TIMETABLE_HOUR_GAP
const TIMETABLE_LANE_WIDTH = 200
const fullDayNames = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday'
}
const overlapsInTime = (firstStart, firstEnd, secondStart, secondEnd) =>
  firstStart < secondEnd && firstEnd > secondStart
const laneCountForDay = events =>
  Math.max(1, ...events.map(event => event._laneCount || 1))

const venueIdsForEvent = event => {
  const ids = [
    ...(Array.isArray(event.venueIds) ? event.venueIds : []),
    ...(Array.isArray(event.venue_ids)
      ? event.venue_ids
      : String(event.venue_ids || '')
          .split(',')
          .filter(Boolean)),
    ...(Array.isArray(event.venueDetails)
      ? event.venueDetails.map(venue => venue.id ?? venue.venue_id)
      : []),
    event.venue_id ?? event.venueId
  ]
  return new Set(
    ids.filter(id => id !== undefined && id !== null && id !== '').map(String)
  )
}

const layoutOverlappingEvents = events => {
  const sorted = events
    .map(event => ({
      ...event,
      _start: timeToMinutes(event.start_time || event.startTime),
      _end: timeToMinutes(event.end_time || event.endTime)
    }))
    .filter(
      event =>
        event._end > event._start &&
        event._end > 7 * 60 &&
        event._start < 21 * 60
    )
    .sort(
      (first, second) =>
        first._start - second._start || first._end - second._end
    )

  const layout = []
  let group = []
  let groupEnd = -1

  const placeGroup = () => {
    if (!group.length) return
    const lanes = []
    for (const event of group) {
      let lane = lanes.findIndex(laneEnd => laneEnd <= event._start)
      if (lane === -1) lane = lanes.length
      lanes[lane] = event._end
      event._lane = lane
    }
    const laneCount = lanes.length
    for (const event of group) {
      let span = 1
      for (let lane = event._lane + 1; lane < laneCount; lane += 1) {
        const laneIsFree = !group.some(
          other =>
            other._lane === lane &&
            overlapsInTime(event._start, event._end, other._start, other._end)
        )
        if (!laneIsFree) break
        span += 1
      }
      layout.push({ ...event, _laneCount: laneCount, _laneSpan: span })
    }
    group = []
    groupEnd = -1
  }

  for (const event of sorted) {
    if (group.length && event._start >= groupEnd) placeGroup()
    group.push(event)
    groupEnd = Math.max(groupEnd, event._end)
  }
  placeGroup()
  return layout
}

const formatHour = hour => {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:00 ${suffix}`
}

const timeToMinutes = value => {
  const [hours, minutes] = String(value || '00:00')
    .split(':')
    .map(Number)
  return hours * 60 + minutes
}

const dateOnly = value => String(value || '').slice(0, 10)
const eventIdentity = event =>
  String(
    event.id ??
      `${event.day_of_week || event.dayOfWeek}-${
        event.start_time || event.startTime
      }-${event.end_time || event.endTime}-${event.venue_id || event.venueId}`
  )

const idList = (value, fallback) => {
  if (Array.isArray(value)) return value.map(String)
  if (value !== undefined && value !== null && value !== '') {
    return String(value)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  }
  return fallback === undefined || fallback === null ? [] : [String(fallback)]
}

const weekdayKey = value => {
  const normalized = String(value || '').toLowerCase()
  return (
    {
      mon: 'Mon',
      monday: 'Mon',
      tue: 'Tue',
      tues: 'Tue',
      tuesday: 'Tue',
      wed: 'Wed',
      wednesday: 'Wed',
      thu: 'Thu',
      thur: 'Thu',
      thurs: 'Thu',
      thursday: 'Thu',
      fri: 'Fri',
      friday: 'Fri'
    }[normalized] || value
  )
}

const emptyEntry = {
  academic_year_id: '',
  semester_id: '',
  course_id: '',
  faculty_ids: [],
  department_ids: [],
  programme_ids: [],
  cohort_ids: [],
  lecturer_id: '',
  venue_id: '',
  day_of_week: 'Mon',
  start_time: '08:00',
  end_time: '10:00',
  event_type: 'LECTURE',
  status: 'SCHEDULED'
}

export default function TimetablePage () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canScheduleEvents = (user?.roles || []).includes('ADMIN')
  const pendingSchedule = usePendingScheduleDrafts()
  const visiblePendingDrafts = (user?.roles || []).includes('ADMIN')
    ? pendingSchedule.drafts.filter(draft =>
        ['timetable', 'timetable_update'].includes(draft.kind)
      )
    : (user?.roles || []).includes('LECTURER')
    ? pendingSchedule.drafts.filter(
        draft =>
          ['timetable', 'timetable_update'].includes(draft.kind) &&
          Number(draft.createdBy) === Number(user.id)
      )
    : []
  const [showForm, setShowForm] = useState(false)
  const editorSectionRef = useRef(null)
  const [editingEntryId, setEditingEntryId] = useState(null)
  const [editingDraftId, setEditingDraftId] = useState(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('calendar')
  const [selectedDay, setSelectedDay] = useState('all')
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('all')
  const [selectedSemester, setSelectedSemester] = useState('all')
  const [selectedProgramme, setSelectedProgramme] = useState('all')
  const [selectedCohort, setSelectedCohort] = useState('all')
  const [selectedLecturer, setSelectedLecturer] = useState('all')
  const [selectedVenue, setSelectedVenue] = useState('all')
  const [selectedEventType, setSelectedEventType] = useState('all')
  const [form, setForm] = useState(emptyEntry)
  const [formError, setFormError] = useState('')
  const [capacityWarning, setCapacityWarning] = useState(null)
  const [makeupForm, setMakeupForm] = useState({
    effective_date: '',
    new_venue_id: '',
    new_start_time: '',
    new_end_time: '',
    reason: ''
  })
  const [makeupMessage, setMakeupMessage] = useState('')

  useEffect(() => {
    if (!formError) return undefined
    const timeout = setTimeout(() => setFormError(''), 10000)
    return () => clearTimeout(timeout)
  }, [formError])

  useEffect(() => {
    if (!showForm) return undefined
    const frame = requestAnimationFrame(() =>
      editorSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    )
    return () => cancelAnimationFrame(frame)
  }, [editingDraftId, editingEntryId, showForm])
  const [selectedEvent, setSelectedEvent] = useState(null)

  const {
    data: timetableData = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['timetable'],
    queryFn: async () => {
      const response = await api.get('/api/timetable')
      return toArray(response)
    }
  })

  const { data: academicYears = [] } = useQuery({
    queryKey: ['timetable-academic-years'],
    queryFn: async () => {
      const response = await api.get('/api/academic/academic-years')
      return toArray(response)
    }
  })

  const { data: semesters = [] } = useQuery({
    queryKey: ['timetable-semesters'],
    queryFn: async () => {
      const response = await api.get('/api/academic/semesters')
      return toArray(response)
    }
  })

  const { data: programmes = [] } = useQuery({
    queryKey: ['timetable-programmes'],
    queryFn: async () => {
      const response = await api.get('/api/academic/programmes')
      return toArray(response)
    }
  })

  const { data: faculties = [] } = useQuery({
    queryKey: ['timetable-faculties'],
    queryFn: async () => toArray(await api.get('/api/academic/faculties'))
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['timetable-departments'],
    queryFn: async () => toArray(await api.get('/api/academic/departments'))
  })

  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const response = await api.get('/api/academic/courses')
      return toArray(response)
    }
  })

  const { data: lecturers = [] } = useQuery({
    queryKey: ['lecturers'],
    queryFn: async () => {
      const response = await api.get('/api/academic/lecturers')
      return toArray(response)
    }
  })

  const { data: venues = [] } = useQuery({
    queryKey: ['venues'],
    queryFn: async () => {
      const response = await api.get('/api/academic/venues')
      return toArray(response)
    }
  })

  const { data: cohorts = [] } = useQuery({
    queryKey: ['cohorts'],
    queryFn: async () => {
      const response = await api.get('/api/academic/cohorts')
      return toArray(response)
    }
  })

  const { data: exams = [] } = useQuery({
    queryKey: ['timetable-exams'],
    queryFn: async () => toArray(await api.get('/api/exams'))
  })

  const makeupCohortIds = Array.isArray(selectedEvent?.cohortIds)
    ? selectedEvent.cohortIds.map(Number)
    : [Number(selectedEvent?.cohort_id ?? selectedEvent?.cohortId)].filter(
        Boolean
      )
  const makeupCapacity = cohorts
    .filter(cohort => makeupCohortIds.includes(Number(cohort.id)))
    .reduce(
      (total, cohort) =>
        total + Number(cohort.student_count ?? cohort.studentCount ?? 0),
      0
    )

  const { data: availableMakeupVenues = [] } = useQuery({
    queryKey: [
      'makeup-venue-availability',
      selectedEvent?.id,
      makeupForm.effective_date,
      makeupForm.new_start_time,
      makeupForm.new_end_time,
      makeupCapacity
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: makeupForm.effective_date,
        startTime: makeupForm.new_start_time,
        endTime: makeupForm.new_end_time,
        requiredCapacity: String(makeupCapacity),
        excludeTimetableEntryId: String(selectedEvent?.id || '')
      })
      return toArray(await api.get(`/api/timetable/availability?${params}`))
    },
    enabled: Boolean(
      makeupForm.effective_date &&
        makeupForm.new_start_time &&
        makeupForm.new_end_time
    )
  })

  const scheduleRows = useMemo(
    () => [
      ...timetableData,
      ...exams
        .filter(exam => {
          if (!(user?.roles || []).includes('LECTURER')) return true
          const lecturer = lecturers.find(
            item => Number(item.user_id ?? item.userId) === Number(user.id)
          )
          return (lecturer?.unitIds || [])
            .map(Number)
            .includes(Number(exam.course_id ?? exam.courseId))
        })
        .map(exam => ({
          ...exam,
          id: `exam-${exam.id}`,
          day_of_week: weekdayFromDateOnly(dateOnly(exam.exam_date)),
          event_type: 'EXAM'
        }))
    ],
    [exams, lecturers, timetableData, user]
  )

  const eligibleDepartments = departments.filter(department =>
    form.faculty_ids.includes(
      String(department.faculty_id ?? department.facultyId)
    )
  )
  const eligibleProgrammes = programmes.filter(
    programme =>
      !form.department_ids.length ||
      form.department_ids.includes(
        String(programme.department_id ?? programme.departmentId)
      )
  )
  const eligibleCohorts = cohorts.filter(
    cohort =>
      form.programme_ids.length === 0 ||
      form.programme_ids.includes(
        String(cohort.programme_id ?? cohort.programmeId)
      )
  )
  const eligibleUnits = courses.filter(unit => {
    const programmeIds = idList(
      unit.programmeIds ?? unit.programme_ids,
      undefined
    )
    const semesterMatch =
      !form.semester_id ||
      String(unit.semester_id ?? unit.semesterId) === String(form.semester_id)
    const programmeMatch =
      !form.programme_ids.length ||
      programmeIds.some(id => form.programme_ids.includes(id))
    return semesterMatch && programmeMatch
  })
  const eligibleLecturers = lecturers.filter(
    lecturer =>
      !form.programme_ids.length ||
      (lecturer.programmeIds || []).some(id =>
        form.programme_ids.includes(String(id))
      )
  )
  const courseNameMap = useMemo(
    () =>
      Object.fromEntries(
        (courses || []).map(course => [
          String(course.id),
          course.name || course.code
        ])
      ),
    [courses]
  )
  const lecturerNameMap = useMemo(
    () =>
      Object.fromEntries(
        (lecturers || []).map(lecturer => [
          String(lecturer.id),
          lecturer.name || lecturer.full_name || lecturer.email
        ])
      ),
    [lecturers]
  )
  const venueNameMap = useMemo(
    () =>
      Object.fromEntries(
        (venues || []).map(venue => [
          String(venue.id),
          venue.name || venue.venue_name
        ])
      ),
    [venues]
  )
  const unitNameMap = useMemo(
    () =>
      Object.fromEntries(
        (courses || []).map(unit => [
          String(unit.id),
          `${unit.code || ''} ${unit.name || ''}`.trim()
        ])
      ),
    [courses]
  )
  const cohortNameMap = useMemo(
    () =>
      Object.fromEntries(
        (cohorts || []).map(cohort => [String(cohort.id), cohort.name])
      ),
    [cohorts]
  )

  const eventTypeClass = event =>
    `event-type-${String(
      event.event_type || event.eventType || 'LECTURE'
    ).toLowerCase()}`

  const venueOptions = venues.map(venue => ({
    value: venue.id,
    label: `${venue.code ? `${venue.code} · ` : ''}${
      venue.name || venue.venue_name
    } (${venue.capacity || 0} seats)`,
    searchText: venue.name || venue.venue_name
  }))
  const makeupVenueOptions = (
    makeupForm.effective_date &&
    makeupForm.new_start_time &&
    makeupForm.new_end_time
      ? availableMakeupVenues
      : venues.filter(venue => venue.status === 'ACTIVE')
  ).map(venue => ({
    value: venue.id,
    label: `${venue.code ? `${venue.code} · ` : ''}${
      venue.name || venue.venue_name
    } (${venue.capacity || 0} seats)`,
    searchText: venue.name || venue.venue_name
  }))

  const venueFilterOptions = [
    { value: 'all', label: 'All venues' },
    ...venues.map(venue => ({
      value: venue.id,
      label: `${venue.code ? `${venue.code} · ` : ''}${
        venue.name || venue.venue_name
      }`
    }))
  ]

  const eventVenues = event =>
    event.event_type === 'EXAM'
      ? (event.venueDetails || [])
          .map(venue => `${venue.name} (${venue.capacity} allocated)`)
          .join(', ')
      : venueNameMap[String(event.venue_id ?? event.venueId)] || 'Venue'

  const itemVenueLabel = (event, details) => {
    if (event.venueDetails?.length) {
      const total = event.venueDetails.reduce(
        (sum, venue) => sum + Number(venue.capacity || 0),
        0
      )
      return `${event.venueDetails
        .map(venue => `${venue.name} (${venue.capacity} allocated)`)
        .join(', ')} · Total allocated: ${total}`
    }
    return details.venue?.name || ''
  }

  const createEntryMutation = useMutation({
    mutationFn: async payload =>
      pendingSchedule.stageDraft('timetable', payload, user?.id),
    onSuccess: () => {
      setShowForm(false)
      setForm(emptyEntry)
      setFormError('')
    },
    onError: err =>
      setFormError(err.message || 'Unable to stage timetable entry.')
  })

  const updateStagedEntryMutation = useMutation({
    mutationFn: ({ id, payload }) => pendingSchedule.updateDraft(id, payload),
    onSuccess: () => {
      setShowForm(false)
      setEditingEntryId(null)
      setEditingDraftId(null)
      setForm(emptyEntry)
      setFormError('')
    },
    onError: error =>
      setFormError(error.message || 'Unable to update staged timetable event.')
  })

  const stageEntryUpdateMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      pendingSchedule.stageDraft(
        'timetable_update',
        { ...payload, timetable_entry_id: Number(id) },
        user?.id
      ),
    onSuccess: () => {
      setShowForm(false)
      setEditingEntryId(null)
      setEditingDraftId(null)
      setForm(emptyEntry)
      setSelectedEvent(null)
      setFormError('')
    },
    onError: error =>
      setFormError(error.message || 'Unable to stage timetable event changes.')
  })

  const makeupMutation = useMutation({
    mutationFn: payload => api.post('/api/timetable/overrides', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      setMakeupForm({
        effective_date: '',
        new_venue_id: '',
        new_start_time: '',
        new_end_time: '',
        reason: ''
      })
      setMakeupMessage(
        'Make-up class request submitted and recorded in the audit log.'
      )
    },
    onError: error =>
      setMakeupMessage(
        error.message || 'Unable to submit make-up class request.'
      )
  })

  const filteredRows = useMemo(() => {
    return scheduleRows.filter(item => {
      const unitId = String(item.course_id ?? item.courseId ?? '')
      const unitName = unitNameMap[unitId] || courseNameMap[unitId] || ''
      const venueName =
        venueNameMap[String(item.venue_id ?? item.venueId)] || ''
      const lecturerName =
        lecturerNameMap[String(item.lecturer_id ?? item.lecturerId)] || ''
      const cohortIds = idList(
        item.cohortIds ?? item.cohort_ids,
        item.cohort_id ?? item.cohortId
      )
      const eventCohortDetails = Array.isArray(item.cohortDetails)
        ? item.cohortDetails
        : []
      const allCohortIds = Array.from(
        new Set([
          ...cohortIds,
          ...eventCohortDetails.map(cohort => String(cohort.id))
        ])
      )
      const cohortName = allCohortIds
        .map(
          id =>
            cohortNameMap[id] ||
            eventCohortDetails.find(item => String(item.id) === id)?.name ||
            ''
        )
        .filter(Boolean)
        .join(' ')
      const matchesSearch =
        `${unitName} ${venueName} ${lecturerName} ${cohortName}`
          .toLowerCase()
          .includes(search.toLowerCase())
      const matchesAcademic =
        selectedAcademicYear === 'all' ||
        String(item.academic_year_id ?? item.academicYearId) ===
          String(selectedAcademicYear)
      const matchesSemester =
        selectedSemester === 'all' ||
        String(item.semester_id ?? item.semesterId) === String(selectedSemester)
      const matchesCohort =
        selectedCohort === 'all' ||
        allCohortIds.includes(String(selectedCohort))
      const matchesLecturer =
        selectedLecturer === 'all' ||
        String(item.lecturer_id ?? item.lecturerId) === String(selectedLecturer)
      const matchesVenue =
        selectedVenue === 'all' ||
        String(item.venue_id ?? item.venueId) === String(selectedVenue)
      const matchesEventType =
        selectedEventType === 'all' ||
        String(item.event_type || item.eventType || '').toUpperCase() ===
          selectedEventType
      const eventProgrammeIds = idList(
        item.programmeIds ?? item.programme_ids,
        undefined
      )
      const cohortProgrammeIds = allCohortIds
        .map(
          id =>
            cohorts.find(cohort => String(cohort.id) === id)?.programme_id ??
            cohorts.find(cohort => String(cohort.id) === id)?.programmeId
        )
        .filter(value => value !== undefined && value !== null)
        .map(String)
      const allProgrammeIds = Array.from(
        new Set([...eventProgrammeIds, ...cohortProgrammeIds])
      )
      const matchesProgramme =
        selectedProgramme === 'all' ||
        allProgrammeIds.includes(String(selectedProgramme))

      return (
        matchesSearch &&
        matchesAcademic &&
        matchesSemester &&
        matchesCohort &&
        matchesLecturer &&
        matchesVenue &&
        matchesEventType &&
        matchesProgramme
      )
    })
  }, [
    cohorts,
    cohortNameMap,
    courseNameMap,
    lecturerNameMap,
    search,
    selectedAcademicYear,
    selectedCohort,
    selectedLecturer,
    selectedProgramme,
    selectedSemester,
    selectedVenue,
    selectedEventType,
    scheduleRows,
    venueNameMap,
    unitNameMap
  ])

  const venueConflictData = useMemo(() => {
    const conflictIds = new Set()
    const pairs = []
    for (
      let firstIndex = 0;
      firstIndex < filteredRows.length;
      firstIndex += 1
    ) {
      const first = filteredRows[firstIndex]
      const firstStart = timeToMinutes(first.start_time || first.startTime)
      const firstEnd = timeToMinutes(first.end_time || first.endTime)
      const firstVenues = venueIdsForEvent(first)
      if (firstEnd <= firstStart || !firstVenues.size) continue

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < filteredRows.length;
        secondIndex += 1
      ) {
        const second = filteredRows[secondIndex]
        const secondStart = timeToMinutes(second.start_time || second.startTime)
        const secondEnd = timeToMinutes(second.end_time || second.endTime)
        const secondVenues = venueIdsForEvent(second)
        const sameDay =
          weekdayKey(first.day_of_week || first.dayOfWeek) ===
          weekdayKey(second.day_of_week || second.dayOfWeek)
        const sharesVenue = [...firstVenues].some(id => secondVenues.has(id))

        if (
          sameDay &&
          sharesVenue &&
          overlapsInTime(firstStart, firstEnd, secondStart, secondEnd)
        ) {
          conflictIds.add(eventIdentity(first))
          conflictIds.add(eventIdentity(second))
          pairs.push([first, second])
        }
      }
    }
    return { conflictIds, pairs }
  }, [filteredRows])

  const visibleRows =
    viewMode === 'conflicts'
      ? filteredRows.filter(item =>
          venueConflictData.conflictIds.has(eventIdentity(item))
        )
      : filteredRows

  const dayFilteredRows = useMemo(
    () =>
      visibleRows.filter(
        item =>
          selectedDay === 'all' ||
          weekdayKey(item.day_of_week || item.dayOfWeek) === selectedDay
      ),
    [selectedDay, visibleRows]
  )

  const sortedVisibleRows = useMemo(
    () =>
      [...dayFilteredRows].sort((first, second) => {
        const firstStart = timeToMinutes(first.start_time || first.startTime)
        const secondStart = timeToMinutes(second.start_time || second.startTime)
        const dayOrder =
          days.indexOf(weekdayKey(first.day_of_week || first.dayOfWeek)) -
          days.indexOf(weekdayKey(second.day_of_week || second.dayOfWeek))
        return dayOrder || firstStart - secondStart
      }),
    [dayFilteredRows]
  )

  const eventsByDay = useMemo(() => {
    const map = {}
    for (const day of days) map[day] = []
    for (const item of dayFilteredRows || []) {
      const day = weekdayKey(item.day_of_week || item.dayOfWeek || 'Mon')
      if (!map[day]) map[day] = []
      map[day].push(item)
    }
    return Object.fromEntries(
      Object.entries(map).map(([day, events]) => [
        day,
        layoutOverlappingEvents(events)
      ])
    )
  }, [dayFilteredRows])

  const eventDetails = event => ({
    unit:
      event.unitCode || event.unit_code
        ? {
            code: event.unitCode || event.unit_code,
            name: event.unitName || event.unit_name
          }
        : courses.find(
            item =>
              String(item.id) === String(event.course_id ?? event.courseId)
          ),
    lecturer:
      event.lecturerName || event.lecturer_name
        ? { name: event.lecturerName || event.lecturer_name }
        : lecturers.find(
            item =>
              String(item.id) === String(event.lecturer_id ?? event.lecturerId)
          ),
    venue:
      event.venueDetails?.[0] ||
      (event.venueName || event.venue_name
        ? {
            name: event.venueName || event.venue_name,
            code: event.venueCode || event.venue_code,
            capacity: event.venueCapacity || event.venue_capacity
          }
        : null) ||
      venues.find(
        item => String(item.id) === String(event.venue_id ?? event.venueId)
      ),
    cohorts:
      event.cohortDetails ||
      (Array.isArray(event.cohort_ids)
        ? event.cohort_ids
        : Array.isArray(event.cohortIds)
        ? event.cohortIds
        : String(event.cohort_ids || event.cohortIds || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
      )
        .map(id => cohorts.find(item => String(item.id) === String(id)))
        .filter(Boolean)
  })

  const handleSubmit = event => {
    event.preventDefault()

    if (
      !form.academic_year_id ||
      !form.semester_id ||
      !form.course_id ||
      !form.lecturer_id ||
      !form.faculty_ids.length ||
      !form.department_ids.length ||
      !form.programme_ids.length ||
      !form.cohort_ids.length ||
      !form.venue_id ||
      !form.day_of_week
    ) {
      setFormError(
        'Academic year, semester, faculty, department, programme, unit, cohort, lecturer, venue, and day are required.'
      )
      return
    }

    const selectedCohorts = cohorts.filter(cohort =>
      form.cohort_ids.includes(String(cohort.id))
    )
    const expectedStudents = selectedCohorts.reduce(
      (total, cohort) =>
        total + Number(cohort.student_count ?? cohort.studentCount ?? 0),
      0
    )
    const selectedVenue = venues.find(
      venue => String(venue.id) === String(form.venue_id)
    )
    const venueCapacity = Number(selectedVenue?.capacity || 0)
    const payload = {
      ...form,
      academic_year_id: Number(form.academic_year_id) || null,
      semester_id: Number(form.semester_id) || null,
      course_id: Number(form.course_id),
      unit_name:
        courses.find(item => String(item.id) === String(form.course_id))
          ?.name || `Unit ${form.course_id}`,
      programme_ids: form.programme_ids.map(Number),
      cohort_ids: form.cohort_ids.map(Number),
      cohort_names: selectedCohorts.map(cohort => ({
        id: Number(cohort.id),
        name: cohort.name
      })),
      cohort_id: Number(form.cohort_ids[0]) || null,
      lecturer_id: Number(form.lecturer_id),
      venue_id: Number(form.venue_id),
      venue_name:
        selectedVenue?.name ||
        selectedVenue?.venue_name ||
        `Venue ${form.venue_id}`,
      expected_students: expectedStudents,
      venue_capacity: venueCapacity
    }

    if (expectedStudents > venueCapacity) {
      setCapacityWarning({
        payload,
        expectedStudents,
        venueCapacity,
        venueName: selectedVenue?.name || 'Selected venue'
      })
      return
    }

    if (editingDraftId) {
      updateStagedEntryMutation.mutate({ id: editingDraftId, payload })
    } else if (editingEntryId) {
      stageEntryUpdateMutation.mutate({ id: editingEntryId, payload })
    } else {
      createEntryMutation.mutate(payload)
    }
  }

  const openEntryEditor = (entry, pendingDraftId = null) => {
    const values = pendingDraftId ? entry.payload : entry
    const programmeIds = idList(
      values.programmeIds ?? values.programme_ids,
      undefined
    )
    const course = courses.find(
      item => String(item.id) === String(values.course_id ?? values.courseId)
    )
    const courseProgrammes = idList(
      course?.programmeIds ?? course?.programme_ids,
      undefined
    )
    const selectedProgrammes = programmes.filter(
      item =>
        programmeIds.includes(String(item.id)) ||
        courseProgrammes.includes(String(item.id))
    )
    const departmentIds = [
      ...new Set(
        selectedProgrammes.map(item =>
          String(item.department_id ?? item.departmentId)
        )
      )
    ]
    const facultyIds = [
      ...new Set(
        departmentIds
          .map(id => {
            const department = departments.find(item => String(item.id) === id)
            return String(department?.faculty_id ?? department?.facultyId ?? '')
          })
          .filter(Boolean)
      )
    ]
    setForm({
      ...emptyEntry,
      academic_year_id: String(
        values.academic_year_id ?? values.academicYearId ?? ''
      ),
      semester_id: String(values.semester_id ?? values.semesterId ?? ''),
      course_id: String(values.course_id ?? values.courseId ?? ''),
      faculty_ids: facultyIds,
      department_ids: departmentIds,
      programme_ids: selectedProgrammes.map(item => String(item.id)),
      cohort_ids: idList(
        values.cohortIds ?? values.cohort_ids,
        values.cohort_id ?? values.cohortId
      ),
      lecturer_id: String(values.lecturer_id ?? values.lecturerId ?? ''),
      venue_id: String(values.venue_id ?? values.venueId ?? ''),
      day_of_week: weekdayKey(values.day_of_week ?? values.dayOfWeek ?? 'Mon'),
      start_time: String(
        values.start_time ?? values.startTime ?? '08:00'
      ).slice(0, 5),
      end_time: String(values.end_time ?? values.endTime ?? '10:00').slice(
        0,
        5
      ),
      event_type: String(values.event_type ?? values.eventType ?? 'LECTURE'),
      status: values.status || 'SCHEDULED'
    })
    setEditingEntryId(pendingDraftId ? null : entry.id)
    setEditingDraftId(pendingDraftId)
    setFormError('')
    setSelectedEvent(null)
    setShowForm(true)
  }

  const stagedEventDescription = draft => {
    const payload = draft.payload || {}
    const courseId = String(payload.course_id ?? payload.courseId ?? '')
    const unit = courses.find(item => String(item.id) === courseId)
    const lecturer = lecturers.find(
      item =>
        String(item.id) ===
        String(payload.lecturer_id ?? payload.lecturerId ?? '')
    )
    const venue = venues.find(
      item =>
        String(item.id) === String(payload.venue_id ?? payload.venueId ?? '')
    )
    const cohortIds = idList(
      payload.cohort_ids ?? payload.cohortIds,
      payload.cohort_id ?? payload.cohortId
    )
    const cohortNames = cohortIds
      .map(
        id =>
          cohorts.find(item => String(item.id) === id)?.name || `Cohort ${id}`
      )
      .join(', ')
    const unitLabel = unit
      ? `${unit.code ? `${unit.code} · ` : ''}${unit.name || ''}`.trim()
      : `Unit ${courseId || '?'}`
    const lecturerName =
      lecturer?.name ||
      lecturer?.full_name ||
      lecturer?.email ||
      `Lecturer ${payload.lecturer_id ?? payload.lecturerId ?? '?'}`
    const venueName = venue
      ? `${venue.code ? `${venue.code} · ` : ''}${venue.name}`
      : `Venue ${payload.venue_id ?? payload.venueId ?? '?'}`
    const detail = `${unitLabel} · ${
      payload.event_type ?? payload.eventType ?? 'LECTURE'
    } · ${cohortNames || 'No cohorts'} · ${lecturerName} · ${venueName} · ${
      payload.day_of_week ?? payload.dayOfWeek ?? 'Day'
    } ${payload.start_time ?? payload.startTime}–${
      payload.end_time ?? payload.endTime
    }`
    return draft.kind === 'timetable_update'
      ? `Change to event #${payload.timetable_entry_id}: ${detail}`
      : detail
  }

  const toggleEventFaculty = (facultyId, checked) => {
    setForm(current => {
      const faculty_ids = checked
        ? [...new Set([...current.faculty_ids, String(facultyId)])]
        : current.faculty_ids.filter(id => id !== String(facultyId))
      const department_ids = current.department_ids.filter(id => {
        const department = departments.find(item => String(item.id) === id)
        return (
          department &&
          faculty_ids.includes(
            String(department.faculty_id ?? department.facultyId)
          )
        )
      })
      const programme_ids = current.programme_ids.filter(id => {
        const programme = programmes.find(item => String(item.id) === id)
        return (
          programme &&
          department_ids.includes(
            String(programme.department_id ?? programme.departmentId)
          )
        )
      })
      const cohortSet = new Set(
        cohorts
          .filter(item =>
            programme_ids.includes(
              String(item.programme_id ?? item.programmeId)
            )
          )
          .map(item => String(item.id))
      )
      const unit = courses.find(
        item => String(item.id) === String(current.course_id)
      )
      const unitProgrammes = idList(
        unit?.programmeIds ?? unit?.programme_ids,
        undefined
      )
      const unitAllowed = unitProgrammes.some(id => programme_ids.includes(id))
      return {
        ...current,
        faculty_ids,
        department_ids,
        programme_ids,
        cohort_ids: current.cohort_ids.filter(id => cohortSet.has(String(id))),
        course_id: unitAllowed ? current.course_id : ''
      }
    })
  }

  const toggleEventDepartment = (departmentId, checked) => {
    setForm(current => {
      const department_ids = checked
        ? [...new Set([...current.department_ids, String(departmentId)])]
        : current.department_ids.filter(id => id !== String(departmentId))
      const programme_ids = current.programme_ids.filter(id => {
        const programme = programmes.find(item => String(item.id) === id)
        return (
          programme &&
          department_ids.includes(
            String(programme.department_id ?? programme.departmentId)
          )
        )
      })
      const cohortSet = new Set(
        cohorts
          .filter(item =>
            programme_ids.includes(
              String(item.programme_id ?? item.programmeId)
            )
          )
          .map(item => String(item.id))
      )
      const unit = courses.find(
        item => String(item.id) === String(current.course_id)
      )
      const unitAllowed = idList(
        unit?.programmeIds ?? unit?.programme_ids,
        undefined
      ).some(id => programme_ids.includes(id))
      return {
        ...current,
        department_ids,
        programme_ids,
        cohort_ids: current.cohort_ids.filter(id => cohortSet.has(String(id))),
        course_id: unitAllowed ? current.course_id : ''
      }
    })
  }

  const updateSelectedProgrammes = (programmeId, checked) => {
    setForm(current => {
      const programmeIds = checked
        ? [...new Set([...current.programme_ids, String(programmeId)])]
        : current.programme_ids.filter(id => id !== String(programmeId))
      const selectedUnit = eligibleUnits.find(
        unit => String(unit.id) === String(current.course_id)
      )
      const selectedUnitProgrammes = idList(
        selectedUnit?.programmeIds ?? selectedUnit?.programme_ids,
        undefined
      )
      return {
        ...current,
        programme_ids: programmeIds,
        cohort_ids: current.cohort_ids.filter(id =>
          cohorts.some(
            cohort =>
              String(cohort.id) === String(id) &&
              programmeIds.includes(
                String(cohort.programme_id ?? cohort.programmeId)
              )
          )
        ),
        course_id:
          !current.course_id ||
          selectedUnitProgrammes.some(id => programmeIds.includes(id))
            ? current.course_id
            : ''
      }
    })
  }

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Academic planning</p>
          <h1>Timetable</h1>
        </div>

        <div
          className='toolbar-actions timetable-view-switcher'
          role='group'
          aria-label='Timetable views'
        >
          {[
            ['calendar', 'Calendar'],
            ['conflicts', `Conflicts (${venueConflictData.pairs.length})`],
            ['list', 'List']
          ].map(([mode, label]) => (
            <button
              key={mode}
              type='button'
              className={
                viewMode === mode ? 'primary-button' : 'secondary-button'
              }
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
            >
              {label}
            </button>
          ))}
          {canScheduleEvents && (
            <button
              type='button'
              className='primary-button'
              onClick={() => {
                if (showForm) {
                  setShowForm(false)
                  setEditingEntryId(null)
                  setEditingDraftId(null)
                  setForm(emptyEntry)
                } else {
                  setEditingEntryId(null)
                  setEditingDraftId(null)
                  setForm(emptyEntry)
                  setShowForm(true)
                }
              }}
            >
              {showForm ? 'Close form' : 'Add entry'}
            </button>
          )}
          {visiblePendingDrafts.length > 0 && (
            <button
              type='button'
              className='primary-button schedule-publish-button'
              disabled={pendingSchedule.isPublishing}
              onClick={() =>
                pendingSchedule
                  .publishDrafts(visiblePendingDrafts)
                  .catch(() => {})
              }
            >
              {pendingSchedule.isPublishing
                ? 'Publishing…'
                : `Publish ${visiblePendingDrafts.length} pending item${
                    visiblePendingDrafts.length === 1 ? '' : 's'
                  }`}
            </button>
          )}
        </div>
      </div>

      {visiblePendingDrafts.length > 0 && (
        <section className='content-panel pending-schedule-panel'>
          <div className='page-header'>
            <div>
              <p className='eyebrow'>Not yet on the timetable</p>
              <h2>
                {visiblePendingDrafts.length} staged timetable event
                {visiblePendingDrafts.length === 1 ? '' : 's'}
              </h2>
              <p>
                Review, edit, and publish each event separately, or publish the
                full event batch. Unpublished drafts are not on the timetable.
              </p>
            </div>
          </div>
          <div className='draft-list-scroll'>
            {visiblePendingDrafts.map(draft => (
              <div
                className='pending-schedule-row event-staging-card'
                key={draft.id}
              >
                <div className='staging-card-details'>
                  <span className='staging-card-type'>
                    {draft.kind === 'timetable_update'
                      ? 'Pending event changes'
                      : 'Staged timetable event'}
                  </span>
                  <strong>{stagedEventDescription(draft)}</strong>
                </div>
                <div className='staging-card-actions'>
                  <button
                    type='button'
                    className='table-action'
                    onClick={() => openEntryEditor(draft, draft.id)}
                  >
                    Edit draft
                  </button>
                  <button
                    type='button'
                    className='primary-button'
                    disabled={pendingSchedule.isPublishing}
                    onClick={() =>
                      pendingSchedule.publishDrafts([draft]).catch(() => {})
                    }
                  >
                    {draft.kind === 'timetable_update'
                      ? 'Publish changes'
                      : 'Publish this event'}
                  </button>
                  <button
                    type='button'
                    className='table-action danger'
                    onClick={() => pendingSchedule.removeDraft(draft.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          {pendingSchedule.publishError && (
            <div className='schedule-conflict-alert' role='alert'>
              <strong>Schedule conflict</strong>
              <span>{pendingSchedule.publishError}</span>
            </div>
          )}
          <button
            type='button'
            className='primary-button'
            disabled={pendingSchedule.isPublishing}
            onClick={() =>
              pendingSchedule
                .publishDrafts(visiblePendingDrafts)
                .catch(() => {})
            }
          >
            {pendingSchedule.isPublishing
              ? 'Publishing batch…'
              : 'Publish all pending timetable items'}
          </button>
        </section>
      )}

      {showForm && canScheduleEvents && (
        <section
          className='content-panel timetable-editor-section'
          ref={editorSectionRef}
        >
          <div className='page-header'>
            <div>
              <p className='eyebrow'>
                {editingEntryId || editingDraftId
                  ? 'Update schedule'
                  : 'New schedule'}
              </p>
              <h2>
                {editingEntryId || editingDraftId
                  ? 'Edit timetable event'
                  : 'Add timetable entry'}
              </h2>
              {editingEntryId && (
                <p className='muted'>
                  Changes stay pending and will not affect the live timetable
                  until published.
                </p>
              )}
            </div>
          </div>
          <form
            className='stack-form timetable-entry-form'
            onSubmit={handleSubmit}
          >
            <div className='form-grid'>
              <label className='selection-container'>
                Academic year
                <select
                  value={form.academic_year_id}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      academic_year_id: event.target.value
                    }))
                  }
                >
                  <option value=''>Select year</option>
                  {(academicYears || []).map(year => (
                    <option
                      key={year.id ?? year.name}
                      value={year.id ?? year.name}
                    >
                      {year.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className='selection-container'>
                Semester
                <select
                  value={form.semester_id}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      semester_id: event.target.value,
                      programme_ids: [],
                      cohort_ids: [],
                      course_id: ''
                    }))
                  }
                >
                  <option value=''>Select semester</option>
                  {(semesters || []).map(semester => (
                    <option
                      key={semester.id ?? semester.name}
                      value={semester.id ?? semester.name}
                    >
                      {semesterLabel(semester, academicYears)}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className='full-width checkbox-fieldset'>
                <legend>Faculties</legend>
                <div className='checkbox-list'>
                  {faculties.map(faculty => (
                    <label key={faculty.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        disabled={!form.semester_id}
                        checked={form.faculty_ids.includes(String(faculty.id))}
                        onChange={event =>
                          toggleEventFaculty(faculty.id, event.target.checked)
                        }
                      />
                      <span>{faculty.name || faculty.code}</span>
                    </label>
                  ))}
                  {!form.semester_id && <small>Select a semester first.</small>}
                </div>
              </fieldset>

              <fieldset className='full-width checkbox-fieldset'>
                <legend>Departments</legend>
                <div className='checkbox-list'>
                  {eligibleDepartments.map(department => (
                    <label key={department.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        disabled={!form.faculty_ids.length}
                        checked={form.department_ids.includes(
                          String(department.id)
                        )}
                        onChange={event =>
                          toggleEventDepartment(
                            department.id,
                            event.target.checked
                          )
                        }
                      />
                      <span>{department.name || department.code}</span>
                    </label>
                  ))}
                  {!form.faculty_ids.length && (
                    <small>Select a faculty first.</small>
                  )}
                </div>
              </fieldset>

              <fieldset className='full-width checkbox-fieldset'>
                <legend>Programmes</legend>
                <div className='checkbox-list'>
                  {eligibleProgrammes.map(programme => (
                    <label key={programme.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        disabled={!form.semester_id}
                        checked={form.programme_ids.includes(
                          String(programme.id)
                        )}
                        onChange={event =>
                          updateSelectedProgrammes(
                            programme.id,
                            event.target.checked
                          )
                        }
                      />
                      <span>{programme.name || programme.code}</span>
                    </label>
                  ))}
                  {!form.department_ids.length && (
                    <small>Select a department first.</small>
                  )}
                </div>
              </fieldset>

              <label className='selection-container'>
                Unit
                <select
                  value={form.course_id}
                  disabled={!form.programme_ids.length}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      course_id: event.target.value
                    }))
                  }
                >
                  <option value=''>
                    {form.programme_ids.length
                      ? 'Select unit'
                      : 'Select programme first'}
                  </option>
                  {eligibleUnits.map(course => (
                    <option
                      key={course.id ?? course.code}
                      value={course.id ?? course.code}
                    >
                      {course.code ? `${course.code} - ` : ''}
                      {course.name || 'Unnamed unit'}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Lecturer
                <select
                  value={form.lecturer_id}
                  disabled={!form.programme_ids.length}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      lecturer_id: event.target.value
                    }))
                  }
                >
                  <option value=''>
                    {form.programme_ids.length
                      ? 'Select lecturer'
                      : 'Select programme first'}
                  </option>
                  {eligibleLecturers.map(lecturer => (
                    <option
                      key={lecturer.id ?? lecturer.email}
                      value={lecturer.id ?? lecturer.email}
                    >
                      {lecturer.name || lecturer.full_name || lecturer.email}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Venue
                <ScrollableSelect
                  value={form.venue_id}
                  options={venueOptions}
                  placeholder='Select venue'
                  ariaLabel='Select venue'
                  onChange={value =>
                    setForm(current => ({ ...current, venue_id: value }))
                  }
                />
              </label>

              <fieldset className='full-width checkbox-fieldset'>
                <legend>Cohorts</legend>
                <div className='checkbox-list'>
                  {eligibleCohorts.map(cohort => (
                    <label key={cohort.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        disabled={!form.programme_ids.length}
                        checked={form.cohort_ids.includes(String(cohort.id))}
                        onChange={event =>
                          setForm(current => ({
                            ...current,
                            cohort_ids: event.target.checked
                              ? [...current.cohort_ids, String(cohort.id)]
                              : current.cohort_ids.filter(
                                  id => id !== String(cohort.id)
                                )
                          }))
                        }
                      />
                      <span>
                        {cohort.name} (
                        {cohort.student_count ?? cohort.studentCount ?? 0}{' '}
                        students)
                      </span>
                    </label>
                  ))}
                  {!form.programme_ids.length && (
                    <small>Select a programme first.</small>
                  )}
                </div>
              </fieldset>

              <label>
                Day
                <select
                  value={form.day_of_week}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      day_of_week: event.target.value
                    }))
                  }
                >
                  {days.map(day => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Event type
                <select
                  value={form.event_type}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      event_type: event.target.value
                    }))
                  }
                >
                  <option value='LECTURE'>Lecture</option>
                  <option value='TUTORIAL'>Tutorial</option>
                  <option value='LAB'>Lab</option>
                  <option value='SEMINAR'>Seminar</option>
                </select>
              </label>

              <label>
                Start time
                <input
                  type='time'
                  value={form.start_time}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      start_time: event.target.value
                    }))
                  }
                />
              </label>

              <label>
                End time
                <input
                  type='time'
                  value={form.end_time}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      end_time: event.target.value
                    }))
                  }
                />
              </label>
            </div>

            {formError && (
              <div className='schedule-conflict-alert' role='alert'>
                <strong>Schedule conflict</strong>
                <span>{formError}</span>
              </div>
            )}

            <div className='toolbar-actions'>
              <button
                type='submit'
                className='primary-button'
                disabled={
                  createEntryMutation.isPending ||
                  stageEntryUpdateMutation.isPending ||
                  updateStagedEntryMutation.isPending
                }
              >
                {createEntryMutation.isPending ||
                stageEntryUpdateMutation.isPending ||
                updateStagedEntryMutation.isPending
                  ? 'Saving...'
                  : editingEntryId
                  ? 'Stage event changes'
                  : editingDraftId
                  ? 'Save staged event'
                  : 'Stage event'}
              </button>
              <button
                type='button'
                className='secondary-button'
                onClick={() => {
                  setShowForm(false)
                  setEditingEntryId(null)
                  setEditingDraftId(null)
                  setForm(emptyEntry)
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className='content-panel'>
        <div className='filter-row'>
          <input
            type='text'
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder='Search unit code or name'
          />
          <select
            value={selectedAcademicYear}
            onChange={event => setSelectedAcademicYear(event.target.value)}
          >
            <option value='all'>Academic year</option>
            {(academicYears || []).map(year => (
              <option key={year.id ?? year.name} value={year.id ?? year.name}>
                {year.name}
              </option>
            ))}
          </select>
          <select
            value={selectedSemester}
            onChange={event => setSelectedSemester(event.target.value)}
          >
            <option value='all'>Semester</option>
            {(semesters || []).map(semester => (
              <option
                key={semester.id ?? semester.name}
                value={semester.id ?? semester.name}
              >
                {semesterLabel(semester, academicYears)}
              </option>
            ))}
          </select>
          <select
            value={selectedProgramme}
            onChange={event => setSelectedProgramme(event.target.value)}
          >
            <option value='all'>Programme</option>
            {(programmes || []).map(programme => (
              <option
                key={programme.id ?? programme.code}
                value={programme.id ?? programme.code}
              >
                {programme.name || programme.code}
              </option>
            ))}
          </select>
          <select
            value={selectedCohort}
            onChange={event => setSelectedCohort(event.target.value)}
          >
            <option value='all'>Cohort</option>
            {(cohorts || []).map(cohort => (
              <option
                key={cohort.id ?? cohort.name}
                value={cohort.id ?? cohort.name}
              >
                {cohort.name}
              </option>
            ))}
          </select>
          <select
            value={selectedLecturer}
            onChange={event => setSelectedLecturer(event.target.value)}
          >
            <option value='all'>Lecturer</option>
            {(lecturers || []).map(lecturer => (
              <option
                key={lecturer.id ?? lecturer.email}
                value={lecturer.id ?? lecturer.email}
              >
                {lecturer.name || lecturer.full_name || lecturer.email}
              </option>
            ))}
          </select>
          <ScrollableSelect
            value={selectedVenue}
            options={venueFilterOptions}
            placeholder='Venue'
            ariaLabel='Filter by venue'
            onChange={setSelectedVenue}
          />
          <select
            value={selectedDay}
            onChange={event => setSelectedDay(event.target.value)}
            aria-label='Filter by day'
          >
            <option value='all'>All days</option>
            {days.map(day => (
              <option key={day} value={day}>
                {fullDayNames[day]}
              </option>
            ))}
          </select>
          <select
            value={selectedEventType}
            onChange={event => setSelectedEventType(event.target.value)}
          >
            <option value='all'>All event types</option>
            <option value='EXAM'>Exams</option>
            <option value='LECTURE'>Lectures</option>
            <option value='TUTORIAL'>Tutorials</option>
            <option value='SEMINAR'>Seminars</option>
            <option value='LAB'>Labs</option>
          </select>
        </div>
      </section>

      <section className='content-panel timetable-panel'>
        {viewMode === 'conflicts' && !isLoading && !error && (
          <div
            className={`conflict-summary ${
              venueConflictData.pairs.length ? 'has-conflicts' : ''
            }`}
            role='status'
          >
            <strong>
              {venueConflictData.pairs.length
                ? `${venueConflictData.pairs.length} venue ${
                    venueConflictData.pairs.length === 1
                      ? 'conflict'
                      : 'conflicts'
                  } detected`
                : 'No venue conflicts detected'}
            </strong>
            <span>
              {venueConflictData.conflictIds.size
                ? `${venueConflictData.conflictIds.size} affected timetable entries`
                : 'Overlaps in different venues are not treated as venue conflicts.'}
            </span>
          </div>
        )}
        {isLoading ? (
          <p>Loading timetable...</p>
        ) : error ? (
          <p className='form-error'>Unable to load timetable.</p>
        ) : viewMode !== 'list' ? (
          <div
            className='timetable-grid'
            style={{
              gridTemplateColumns: `110px ${days
                .map(
                  day =>
                    `${
                      laneCountForDay(eventsByDay[day] || []) *
                      TIMETABLE_LANE_WIDTH
                    }px`
                )
                .join(' ')}`
            }}
          >
            <div className='time-column'>
              <div className='grid-header empty'>Time</div>
              {timeSlots.map(time => (
                <div key={time} className='time-slot'>
                  {formatHour(time)}
                </div>
              ))}
            </div>

            {days.map(day => {
              const dayEvents = eventsByDay[day] || []
              const dayWidth = laneCountForDay(dayEvents) * TIMETABLE_LANE_WIDTH
              return (
                <div
                  key={day}
                  className='day-column'
                  style={{ width: `${dayWidth}px` }}
                >
                  <div className='grid-header'>{fullDayNames[day]}</div>
                  <div
                    className='day-schedule'
                    style={{ width: `${dayWidth}px` }}
                  >
                    {timeSlots.map(time => (
                      <div key={`${day}-${time}`} className='hour-row' />
                    ))}
                    {dayEvents.map(item => {
                      const start = item._start
                      const visibleStart = Math.max(start, 7 * 60)
                      const visibleEnd = Math.min(item._end, 21 * 60)
                      const top =
                        ((visibleStart - 7 * 60) / 60) *
                        TIMETABLE_MINUTES_PER_HOUR
                      const height = Math.max(
                        18,
                        ((visibleEnd - visibleStart) / 60) *
                          TIMETABLE_MINUTES_PER_HOUR +
                          TIMETABLE_HOUR_HEIGHT
                      )
                      const left = item._lane * TIMETABLE_LANE_WIDTH
                      const width = item._laneSpan * TIMETABLE_LANE_WIDTH
                      const crowded = item._laneCount > 1
                      const isVenueConflict = venueConflictData.conflictIds.has(
                        eventIdentity(item)
                      )
                      const showTime = height >= 44
                      const showDetails = height >= 62 && width >= 170
                      const lecturerName =
                        lecturerNameMap[
                          String(item.lecturer_id ?? item.lecturerId)
                        ]
                      return (
                        <button
                          type='button'
                          key={item.id ?? `${day}-${start}-${item.course_id}`}
                          className={`timetable-card timetable-card-positioned ${eventTypeClass(
                            item
                          )} ${crowded ? 'timetable-card-crowded' : ''} ${
                            isVenueConflict ? 'timetable-card-conflict' : ''
                          }`}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            left: `${left + 3}px`,
                            width: `${width - 6}px`,
                            zIndex: isVenueConflict ? 4 : 2
                          }}
                          onClick={() => {
                            setSelectedEvent(item)
                            setMakeupForm({
                              effective_date: '',
                              new_venue_id: '',
                              new_start_time: '',
                              new_end_time: '',
                              reason: ''
                            })
                            setMakeupMessage('')
                          }}
                          title={`${
                            item.unitCode ||
                            item.unit_code ||
                            courses.find(
                              course =>
                                String(course.id) ===
                                String(item.course_id ?? item.courseId)
                            )?.code ||
                            item.course_id ||
                            'Unit'
                          } · ${
                            item.isMakeup
                              ? `Make-up ${dateOnly(item.effective_date)} · `
                              : ''
                          }${item.start_time || item.startTime}-${
                            item.end_time || item.endTime
                          } · ${eventVenues(item)}`}
                        >
                          <strong>
                            {item.unitCode ||
                              item.unit_code ||
                              courses.find(
                                course =>
                                  String(course.id) ===
                                  String(item.course_id ?? item.courseId)
                              )?.code ||
                              item.course_id ||
                              'Unit'}
                          </strong>
                          {isVenueConflict && (
                            <span className='venue-conflict-badge'>
                              ⚠ Venue conflict
                            </span>
                          )}
                          {showTime && (
                            <span>
                              {item.isMakeup
                                ? `Make-up ${dateOnly(item.effective_date)} · `
                                : ''}
                              {item.start_time || item.startTime} -{' '}
                              {item.end_time || item.endTime}
                            </span>
                          )}
                          {showDetails && (
                            <>
                              {(item.lecturerName ||
                                item.lecturer_name ||
                                lecturerName) && (
                                <small>
                                  {item.lecturerName ||
                                    item.lecturer_name ||
                                    lecturerName}
                                </small>
                              )}
                              <small>{eventVenues(item)}</small>
                            </>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <ul className='simple-list'>
            {sortedVisibleRows.map(item => (
              <li
                key={
                  item.id ??
                  `${item.day_of_week}-${item.start_time}-${item.venue_id}`
                }
              >
                <button
                  type='button'
                  className='timetable-list-event'
                  onClick={() => {
                    setSelectedEvent(item)
                    setMakeupForm({
                      effective_date: '',
                      new_venue_id: '',
                      new_start_time: '',
                      new_end_time: '',
                      reason: ''
                    })
                    setMakeupMessage('')
                  }}
                >
                  <span>
                    <strong>
                      {item.unitCode || item.unit_code
                        ? `${item.unitCode || item.unit_code} ${
                            item.unitName || item.unit_name || ''
                          }`.trim()
                        : unitNameMap[
                            String(item.course_id ?? item.courseId)
                          ] ||
                          item.course_id ||
                          item.courseId ||
                          'Unit'}
                    </strong>
                    {' · '}
                    {item.day_of_week || item.dayOfWeek || 'Day'}
                    {item.effective_date
                      ? ` · Make-up ${dateOnly(item.effective_date)}`
                      : ''}
                  </span>
                  <strong>
                    {item.start_time || item.startTime} -{' '}
                    {item.end_time || item.endTime}
                  </strong>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {capacityWarning && (
        <div className='profile-modal-backdrop'>
          <section className='profile-modal content-panel capacity-warning-modal'>
            <p className='eyebrow'>Capacity warning</p>
            <h2>Venue capacity exceeded</h2>
            <p>
              The selected cohorts contain {capacityWarning.expectedStudents}{' '}
              students, but {capacityWarning.venueName} has capacity for{' '}
              {capacityWarning.venueCapacity}.
            </p>
            <p>Do you want to create this timetable entry anyway?</p>
            <div className='toolbar-actions'>
              <button
                type='button'
                className='primary-button'
                onClick={() => {
                  const payload = {
                    ...capacityWarning.payload,
                    allow_capacity_override: true
                  }
                  if (editingDraftId) {
                    updateStagedEntryMutation.mutate({
                      id: editingDraftId,
                      payload
                    })
                  } else if (editingEntryId) {
                    stageEntryUpdateMutation.mutate({
                      id: editingEntryId,
                      payload
                    })
                  } else {
                    createEntryMutation.mutate(payload)
                  }
                  setCapacityWarning(null)
                }}
                disabled={
                  createEntryMutation.isPending ||
                  stageEntryUpdateMutation.isPending ||
                  updateStagedEntryMutation.isPending
                }
              >
                Confirm anyway
              </button>
              <button
                type='button'
                className='secondary-button'
                onClick={() => setCapacityWarning(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedEvent &&
        (() => {
          const details = eventDetails(selectedEvent)
          return (
            <div
              className='profile-modal-backdrop'
              onClick={() => setSelectedEvent(null)}
            >
              <section
                className='profile-modal content-panel timetable-details-modal timetable-entry-modal'
                onClick={event => event.stopPropagation()}
              >
                <div className='page-header'>
                  <div>
                    <p className='eyebrow'>Timetable assignment</p>
                    <h2>
                      {details.unit?.code ||
                        selectedEvent.unit_code ||
                        selectedEvent.course_id ||
                        'Unit'}{' '}
                      -{' '}
                      {details.unit?.name ||
                        selectedEvent.unit_name ||
                        'Unit details'}
                    </h2>
                  </div>
                  <div className='toolbar-actions'>
                    {(user?.roles || []).includes('ADMIN') &&
                      !String(selectedEvent.id).startsWith('exam-') &&
                      !selectedEvent.isMakeup && (
                        <button
                          type='button'
                          className='primary-button'
                          onClick={() => openEntryEditor(selectedEvent)}
                        >
                          Edit event
                        </button>
                      )}
                    <button
                      type='button'
                      className='secondary-button'
                      onClick={() => setSelectedEvent(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
                <dl className='timetable-details-list'>
                  <div>
                    <dt>Event type</dt>
                    <dd>
                      {selectedEvent.event_type ||
                        selectedEvent.eventType ||
                        'LECTURE'}
                    </dd>
                  </div>
                  <div>
                    <dt>Day</dt>
                    <dd>
                      {selectedEvent.day_of_week || selectedEvent.dayOfWeek}
                    </dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>
                      {selectedEvent.start_time || selectedEvent.startTime} -{' '}
                      {selectedEvent.end_time || selectedEvent.endTime}
                    </dd>
                  </div>
                  <div>
                    <dt>Unit code</dt>
                    <dd>{details.unit?.code || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt>Unit name</dt>
                    <dd>
                      {details.unit?.name ||
                        selectedEvent.unit_name ||
                        courseNameMap[
                          String(
                            selectedEvent.course_id ?? selectedEvent.courseId
                          )
                        ] ||
                        'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt>Lecturer</dt>
                    <dd>
                      {details.lecturer?.name ||
                        selectedEvent.lecturer_name ||
                        lecturerNameMap[
                          String(
                            selectedEvent.lecturer_id ??
                              selectedEvent.lecturerId
                          )
                        ] ||
                        'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt>Venue</dt>
                    <dd>
                      {itemVenueLabel(selectedEvent, details, eventVenues) ||
                        selectedEvent.venue_name ||
                        venueNameMap[
                          String(
                            selectedEvent.venue_id ?? selectedEvent.venueId
                          )
                        ] ||
                        'N/A'}{' '}
                      {details.venue?.capacity
                        ? `(${details.venue.capacity} seats)`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Event type</dt>
                    <dd>
                      {selectedEvent.event_type ||
                        selectedEvent.eventType ||
                        'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{selectedEvent.status || 'SCHEDULED'}</dd>
                  </div>
                  <div>
                    <dt>Academic year</dt>
                    <dd>
                      {academicYears.find(
                        item =>
                          String(item.id) ===
                          String(
                            selectedEvent.academic_year_id ??
                              selectedEvent.academicYearId
                          )
                      )?.name || 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt>Semester</dt>
                    <dd>
                      {semesters.find(
                        item =>
                          String(item.id) ===
                          String(
                            selectedEvent.semester_id ??
                              selectedEvent.semesterId
                          )
                      )?.name || 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt>Cohorts</dt>
                    <dd>
                      {details.cohorts.length
                        ? details.cohorts
                            .map(
                              cohort =>
                                `${cohort.name} (${
                                  cohort.student_count ??
                                  cohort.studentCount ??
                                  0
                                } students)`
                            )
                            .join(', ')
                        : 'N/A'}
                    </dd>
                  </div>
                </dl>
                {(user?.roles || []).some(role =>
                  ['ADMIN', 'LECTURER'].includes(role)
                ) &&
                  !String(selectedEvent.id).startsWith('exam-') && (
                    <form
                      className='stack-form makeup-class-form responsive-form-panel'
                      onSubmit={event => {
                        event.preventDefault()
                        setMakeupMessage('')
                        if (!makeupForm.new_venue_id) {
                          setMakeupMessage(
                            'Select a venue for the make-up class.'
                          )
                          return
                        }
                        makeupMutation.mutate({
                          timetableEntryId: Number(selectedEvent.id),
                          effectiveDate: makeupForm.effective_date,
                          originalVenueId: Number(
                            selectedEvent.venue_id ?? selectedEvent.venueId
                          ),
                          newVenueId: Number(makeupForm.new_venue_id),
                          originalStartTime:
                            selectedEvent.start_time ?? selectedEvent.startTime,
                          newStartTime: makeupForm.new_start_time,
                          originalEndTime:
                            selectedEvent.end_time ?? selectedEvent.endTime,
                          newEndTime: makeupForm.new_end_time,
                          reason: makeupForm.reason
                        })
                      }}
                    >
                      <div className='makeup-form-heading'>
                        <div>
                          <p className='eyebrow'>Schedule change</p>
                          <h3>Request a temporary make-up class</h3>
                        </div>
                      </div>
                      <div className='form-grid'>
                        <label>
                          Make-up date
                          <input
                            type='date'
                            required
                            value={makeupForm.effective_date}
                            onChange={event =>
                              setMakeupForm(current => ({
                                ...current,
                                effective_date: event.target.value,
                                new_venue_id: ''
                              }))
                            }
                          />
                        </label>
                        <label>
                          Venue
                          <ScrollableSelect
                            required
                            value={makeupForm.new_venue_id}
                            options={makeupVenueOptions}
                            placeholder='Select venue'
                            ariaLabel='Select make-up class venue'
                            onChange={value =>
                              setMakeupForm(current => ({
                                ...current,
                                new_venue_id: value
                              }))
                            }
                          />
                        </label>
                        <label>
                          Start time
                          <input
                            type='time'
                            required
                            value={makeupForm.new_start_time}
                            onChange={event =>
                              setMakeupForm(current => ({
                                ...current,
                                new_start_time: event.target.value,
                                new_venue_id: ''
                              }))
                            }
                          />
                        </label>
                        <label>
                          End time
                          <input
                            type='time'
                            required
                            value={makeupForm.new_end_time}
                            onChange={event =>
                              setMakeupForm(current => ({
                                ...current,
                                new_end_time: event.target.value,
                                new_venue_id: ''
                              }))
                            }
                          />
                        </label>
                        <label className='full-width'>
                          Reason
                          <input
                            required
                            value={makeupForm.reason}
                            onChange={event =>
                              setMakeupForm(current => ({
                                ...current,
                                reason: event.target.value
                              }))
                            }
                            placeholder='Reason for the make-up class'
                          />
                        </label>
                      </div>
                      {makeupMessage && (
                        <p
                          className={
                            makeupMutation.isError
                              ? 'form-error'
                              : 'success-message'
                          }
                        >
                          {makeupMessage}
                        </p>
                      )}
                      <button
                        type='submit'
                        className='primary-button'
                        disabled={makeupMutation.isPending}
                      >
                        {makeupMutation.isPending
                          ? 'Submitting...'
                          : 'Submit make-up request'}
                      </button>
                    </form>
                  )}
              </section>
            </div>
          )
        })()}
    </div>
  )
}

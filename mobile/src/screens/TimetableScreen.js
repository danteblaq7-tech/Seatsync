import React, { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import useAutoClear from '../hooks/useAutoClear'
import usePendingScheduleDrafts from '../hooks/usePendingScheduleDrafts'
import { weekdayFromDateOnly } from '../utils/dateOnly'
import { toArray } from '../utils/data'
import { colors, eventTypeColors, radius, type } from '../theme'
import { Text } from '../components/Typography'
import Select from '../components/Select'
import Sheet from '../components/Sheet'
import { DateField, TimeField } from '../components/DateTime'
import {
  BoxedField, Body, Checkbox, CheckboxList, ConflictAlert, DangerAction, DetailCell, Eyebrow, Field, Fieldset, FilterRow,
  FormError, FormGrid, H2, H3, Muted, P, PageHeader, Panel, PrimaryButton, Screen, SecondaryButton, Small, StackForm,
  StagingCard, SuccessMessage, TableAction, TextField, ToolbarActions
} from '../components/ui'

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const fullDayNames = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' }
const timeSlots = Array.from({ length: 15 }, (_, i) => i + 7)
const HOUR_HEIGHT = 72
const HOUR_GAP = 10
const MINUTES_PER_HOUR = HOUR_HEIGHT + HOUR_GAP
const LANE_WIDTH = 200
const TIME_COLUMN = 110

const overlapsInTime = (aS, aE, bS, bE) => aS < bE && aE > bS
const timeToMinutes = value => {
  const [h, m] = String(value || '00:00').split(':').map(Number)
  return h * 60 + m
}
const dateOnly = v => String(v || '').slice(0, 10)
const formatHour = hour => `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`
const laneCountForDay = events => Math.max(1, ...events.map(e => e._laneCount || 1))
const eventIdentity = e => String(e.id ?? `${e.day_of_week || e.dayOfWeek}-${e.start_time || e.startTime}-${e.end_time || e.endTime}-${e.venue_id || e.venueId}`)

const idList = (value, fallback) => {
  if (Array.isArray(value)) return value.map(String)
  if (value !== undefined && value !== null && value !== '') return String(value).split(',').map(s => s.trim()).filter(Boolean)
  return fallback === undefined || fallback === null ? [] : [String(fallback)]
}
const weekdayKey = value => {
  const n = String(value || '').toLowerCase()
  return ({ mon: 'Mon', monday: 'Mon', tue: 'Tue', tues: 'Tue', tuesday: 'Tue', wed: 'Wed', wednesday: 'Wed',
    thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu', fri: 'Fri', friday: 'Fri' })[n] || value
}
const venueIdsForEvent = e => {
  const ids = [
    ...(Array.isArray(e.venueIds) ? e.venueIds : []),
    ...(Array.isArray(e.venue_ids) ? e.venue_ids : String(e.venue_ids || '').split(',').filter(Boolean)),
    ...(Array.isArray(e.venueDetails) ? e.venueDetails.map(v => v.id ?? v.venue_id) : []),
    e.venue_id ?? e.venueId
  ]
  return new Set(ids.filter(id => id !== undefined && id !== null && id !== '').map(String))
}

const layoutOverlappingEvents = events => {
  const sorted = events
    .map(e => ({ ...e, _start: timeToMinutes(e.start_time || e.startTime), _end: timeToMinutes(e.end_time || e.endTime) }))
    .filter(e => e._end > e._start && e._end > 7 * 60 && e._start < 21 * 60)
    .sort((a, b) => a._start - b._start || a._end - b._end)
  const result = []
  let group = []
  let groupEnd = -1
  const placeGroup = () => {
    if (!group.length) return
    const lanes = []
    for (const e of group) {
      let lane = lanes.findIndex(end => end <= e._start)
      if (lane === -1) lane = lanes.length
      lanes[lane] = e._end
      e._lane = lane
    }
    const laneCount = lanes.length
    for (const e of group) {
      let span = 1
      for (let lane = e._lane + 1; lane < laneCount; lane += 1) {
        const free = !group.some(o => o._lane === lane && overlapsInTime(e._start, e._end, o._start, o._end))
        if (!free) break
        span += 1
      }
      result.push({ ...e, _laneCount: laneCount, _laneSpan: span })
    }
    group = []
    groupEnd = -1
  }
  for (const e of sorted) {
    if (group.length && e._start >= groupEnd) placeGroup()
    group.push(e)
    groupEnd = Math.max(groupEnd, e._end)
  }
  placeGroup()
  return result
}

const emptyEntry = {
  academic_year_id: '', semester_id: '', course_id: '', faculty_ids: [], department_ids: [], programme_ids: [], cohort_ids: [],
  lecturer_id: '', venue_id: '', day_of_week: 'Mon', start_time: '08:00', end_time: '10:00', event_type: 'LECTURE', status: 'SCHEDULED'
}
const emptyMakeup = { effective_date: '', new_venue_id: '', new_start_time: '', new_end_time: '', reason: '' }

export default function TimetableScreen () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const roles = user?.roles || []
  const canSchedule = roles.includes('ADMIN')
  const pending = usePendingScheduleDrafts()
  const visibleDrafts = roles.includes('ADMIN')
    ? pending.drafts.filter(d => ['timetable', 'timetable_update'].includes(d.kind))
    : roles.includes('LECTURER')
    ? pending.drafts.filter(d => ['timetable', 'timetable_update'].includes(d.kind) && Number(d.createdBy) === Number(user.id))
    : []

  const [showForm, setShowForm] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState(null)
  const [editingDraftId, setEditingDraftId] = useState(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('calendar')
  const [selectedDay, setSelectedDay] = useState('all')
  const [fAcademicYear, setFAcademicYear] = useState('all')
  const [fSemester, setFSemester] = useState('all')
  const [fProgramme, setFProgramme] = useState('all')
  const [fCohort, setFCohort] = useState('all')
  const [fLecturer, setFLecturer] = useState('all')
  const [fVenue, setFVenue] = useState('all')
  const [fEventType, setFEventType] = useState('all')
  const [form, setForm] = useState(emptyEntry)
  const [formError, setFormError] = useState('')
  const [capacityWarning, setCapacityWarning] = useState(null)
  const [makeupForm, setMakeupForm] = useState(emptyMakeup)
  const [makeupMessage, setMakeupMessage] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  useAutoClear(formError, useCallback(() => setFormError(''), []), 10000)

  const q = (key, path) => useQuery({ queryKey: [key], queryFn: async () => toArray(await api.get(path)) })
  const { data: timetableData = [], isLoading, error, refetch, isRefetching } = q('timetable', '/api/timetable')
  const { data: academicYears = [] } = q('timetable-academic-years', '/api/academic/academic-years')
  const { data: semesters = [] } = q('timetable-semesters', '/api/academic/semesters')
  const { data: programmes = [] } = q('timetable-programmes', '/api/academic/programmes')
  const { data: faculties = [] } = q('timetable-faculties', '/api/academic/faculties')
  const { data: departments = [] } = q('timetable-departments', '/api/academic/departments')
  const { data: courses = [] } = q('courses', '/api/academic/courses')
  const { data: lecturers = [] } = q('lecturers', '/api/academic/lecturers')
  const { data: venues = [] } = q('venues', '/api/academic/venues')
  const { data: cohorts = [] } = q('cohorts', '/api/academic/cohorts')
  const { data: exams = [] } = q('timetable-exams', '/api/exams')

  const makeupCohortIds = Array.isArray(selectedEvent?.cohortIds)
    ? selectedEvent.cohortIds.map(Number)
    : [Number(selectedEvent?.cohort_id ?? selectedEvent?.cohortId)].filter(Boolean)
  const makeupCapacity = cohorts.filter(c => makeupCohortIds.includes(Number(c.id)))
    .reduce((t, c) => t + Number(c.student_count ?? c.studentCount ?? 0), 0)

  const { data: availableMakeupVenues = [] } = useQuery({
    queryKey: ['makeup-venue-availability', selectedEvent?.id, makeupForm.effective_date, makeupForm.new_start_time, makeupForm.new_end_time, makeupCapacity],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: makeupForm.effective_date, startTime: makeupForm.new_start_time, endTime: makeupForm.new_end_time,
        requiredCapacity: String(makeupCapacity), excludeTimetableEntryId: String(selectedEvent?.id || '')
      })
      return toArray(await api.get(`/api/timetable/availability?${params}`))
    },
    enabled: Boolean(makeupForm.effective_date && makeupForm.new_start_time && makeupForm.new_end_time)
  })

  const scheduleRows = useMemo(() => [
    ...timetableData,
    ...exams.filter(exam => {
      if (!roles.includes('LECTURER')) return true
      const lecturer = lecturers.find(i => Number(i.user_id ?? i.userId) === Number(user.id))
      return (lecturer?.unitIds || []).map(Number).includes(Number(exam.course_id ?? exam.courseId))
    }).map(exam => ({ ...exam, id: `exam-${exam.id}`, day_of_week: weekdayFromDateOnly(dateOnly(exam.exam_date)), event_type: 'EXAM' }))
  ], [exams, lecturers, timetableData, user, roles])

  const eligibleDepartments = departments.filter(d => form.faculty_ids.includes(String(d.faculty_id ?? d.facultyId)))
  const eligibleProgrammes = programmes.filter(p => !form.department_ids.length || form.department_ids.includes(String(p.department_id ?? p.departmentId)))
  const eligibleCohorts = cohorts.filter(c => form.programme_ids.length === 0 || form.programme_ids.includes(String(c.programme_id ?? c.programmeId)))
  const eligibleUnits = courses.filter(unit => {
    const progIds = idList(unit.programmeIds ?? unit.programme_ids, undefined)
    const sem = !form.semester_id || String(unit.semester_id ?? unit.semesterId) === String(form.semester_id)
    const prog = !form.programme_ids.length || progIds.some(id => form.programme_ids.includes(id))
    return sem && prog
  })
  const eligibleLecturers = lecturers.filter(l => !form.programme_ids.length || (l.programmeIds || []).some(id => form.programme_ids.includes(String(id))))

  const mapBy = (list, key) => Object.fromEntries((list || []).map(i => [String(i.id), key(i)]))
  const courseNameMap = useMemo(() => mapBy(courses, c => c.name || c.code), [courses])
  const lecturerNameMap = useMemo(() => mapBy(lecturers, l => l.name || l.full_name || l.email), [lecturers])
  const venueNameMap = useMemo(() => mapBy(venues, v => v.name || v.venue_name), [venues])
  const unitNameMap = useMemo(() => mapBy(courses, u => `${u.code || ''} ${u.name || ''}`.trim()), [courses])
  const cohortNameMap = useMemo(() => mapBy(cohorts, c => c.name), [cohorts])

  const venueLabel = v => `${v.code ? `${v.code} · ` : ''}${v.name || v.venue_name} (${v.capacity || 0} seats)`
  const venueOptions = venues.map(v => ({ value: String(v.id), label: venueLabel(v), searchText: v.name || v.venue_name }))
  const makeupVenueOptions = (makeupForm.effective_date && makeupForm.new_start_time && makeupForm.new_end_time
    ? availableMakeupVenues : venues.filter(v => v.status === 'ACTIVE'))
    .map(v => ({ value: String(v.id), label: venueLabel(v), searchText: v.name || v.venue_name }))

  const eventVenues = e => e.event_type === 'EXAM'
    ? (e.venueDetails || []).map(v => `${v.name} (${v.capacity} allocated)`).join(', ')
    : venueNameMap[String(e.venue_id ?? e.venueId)] || 'Venue'
  const itemVenueLabel = (e, details) => {
    if (e.venueDetails?.length) {
      const total = e.venueDetails.reduce((s, v) => s + Number(v.capacity || 0), 0)
      return `${e.venueDetails.map(v => `${v.name} (${v.capacity} allocated)`).join(', ')} · Total allocated: ${total}`
    }
    return details.venue?.name || ''
  }

  const finishEdit = () => { setShowForm(false); setEditingEntryId(null); setEditingDraftId(null); setForm(emptyEntry); setFormError('') }
  const createEntry = useMutation({
    mutationFn: payload => pending.stageDraft('timetable', payload, user?.id),
    onSuccess: finishEdit, onError: e => setFormError(e.message || 'Unable to stage timetable entry.')
  })
  const updateStaged = useMutation({
    mutationFn: ({ id, payload }) => pending.updateDraft(id, payload),
    onSuccess: finishEdit, onError: e => setFormError(e.message || 'Unable to update staged timetable event.')
  })
  const stageUpdate = useMutation({
    mutationFn: ({ id, payload }) => pending.stageDraft('timetable_update', { ...payload, timetable_entry_id: Number(id) }, user?.id),
    onSuccess: () => { finishEdit(); setSelectedEvent(null) }, onError: e => setFormError(e.message || 'Unable to stage timetable event changes.')
  })
  const makeupMutation = useMutation({
    mutationFn: payload => api.post('/api/timetable/overrides', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      setMakeupForm(emptyMakeup)
      setMakeupMessage('Make-up class request submitted and recorded in the audit log.')
    },
    onError: e => setMakeupMessage(e.message || 'Unable to submit make-up class request.')
  })
  const saving = createEntry.isPending || stageUpdate.isPending || updateStaged.isPending

  const filteredRows = useMemo(() => scheduleRows.filter(item => {
    const unitId = String(item.course_id ?? item.courseId ?? '')
    const unitName = unitNameMap[unitId] || courseNameMap[unitId] || ''
    const venueName = venueNameMap[String(item.venue_id ?? item.venueId)] || ''
    const lecturerName = lecturerNameMap[String(item.lecturer_id ?? item.lecturerId)] || ''
    const cohortIds = idList(item.cohortIds ?? item.cohort_ids, item.cohort_id ?? item.cohortId)
    const details = Array.isArray(item.cohortDetails) ? item.cohortDetails : []
    const allCohortIds = Array.from(new Set([...cohortIds, ...details.map(c => String(c.id))]))
    const cohortName = allCohortIds.map(id => cohortNameMap[id] || details.find(d => String(d.id) === id)?.name || '').filter(Boolean).join(' ')
    const eventProg = idList(item.programmeIds ?? item.programme_ids, undefined)
    const cohortProg = allCohortIds.map(id => { const c = cohorts.find(x => String(x.id) === id); return c?.programme_id ?? c?.programmeId })
      .filter(v => v !== undefined && v !== null).map(String)
    const allProg = Array.from(new Set([...eventProg, ...cohortProg]))
    return `${unitName} ${venueName} ${lecturerName} ${cohortName}`.toLowerCase().includes(search.toLowerCase()) &&
      (fAcademicYear === 'all' || String(item.academic_year_id ?? item.academicYearId) === String(fAcademicYear)) &&
      (fSemester === 'all' || String(item.semester_id ?? item.semesterId) === String(fSemester)) &&
      (fCohort === 'all' || allCohortIds.includes(String(fCohort))) &&
      (fLecturer === 'all' || String(item.lecturer_id ?? item.lecturerId) === String(fLecturer)) &&
      (fVenue === 'all' || String(item.venue_id ?? item.venueId) === String(fVenue)) &&
      (fEventType === 'all' || String(item.event_type || item.eventType || '').toUpperCase() === fEventType) &&
      (fProgramme === 'all' || allProg.includes(String(fProgramme)))
  }), [cohorts, cohortNameMap, courseNameMap, lecturerNameMap, search, fAcademicYear, fCohort, fLecturer, fProgramme, fSemester, fVenue, fEventType, scheduleRows, venueNameMap, unitNameMap])

  const conflictData = useMemo(() => {
    const ids = new Set()
    const pairs = []
    for (let i = 0; i < filteredRows.length; i += 1) {
      const a = filteredRows[i]
      const aS = timeToMinutes(a.start_time || a.startTime)
      const aE = timeToMinutes(a.end_time || a.endTime)
      const aV = venueIdsForEvent(a)
      if (aE <= aS || !aV.size) continue
      for (let j = i + 1; j < filteredRows.length; j += 1) {
        const b = filteredRows[j]
        const bV = venueIdsForEvent(b)
        const sameDay = weekdayKey(a.day_of_week || a.dayOfWeek) === weekdayKey(b.day_of_week || b.dayOfWeek)
        if (sameDay && [...aV].some(id => bV.has(id)) &&
            overlapsInTime(aS, aE, timeToMinutes(b.start_time || b.startTime), timeToMinutes(b.end_time || b.endTime))) {
          ids.add(eventIdentity(a)); ids.add(eventIdentity(b)); pairs.push([a, b])
        }
      }
    }
    return { conflictIds: ids, pairs }
  }, [filteredRows])

  const visibleRows = viewMode === 'conflicts' ? filteredRows.filter(i => conflictData.conflictIds.has(eventIdentity(i))) : filteredRows
  const dayRows = useMemo(() => visibleRows.filter(i => selectedDay === 'all' || weekdayKey(i.day_of_week || i.dayOfWeek) === selectedDay), [selectedDay, visibleRows])
  const sortedRows = useMemo(() => [...dayRows].sort((a, b) =>
    (days.indexOf(weekdayKey(a.day_of_week || a.dayOfWeek)) - days.indexOf(weekdayKey(b.day_of_week || b.dayOfWeek))) ||
    timeToMinutes(a.start_time || a.startTime) - timeToMinutes(b.start_time || b.startTime)), [dayRows])
  const eventsByDay = useMemo(() => {
    const map = {}
    days.forEach(d => { map[d] = [] })
    for (const item of dayRows) {
      const day = weekdayKey(item.day_of_week || item.dayOfWeek || 'Mon')
      if (!map[day]) map[day] = []
      map[day].push(item)
    }
    return Object.fromEntries(Object.entries(map).map(([d, ev]) => [d, layoutOverlappingEvents(ev)]))
  }, [dayRows])

  const eventDetails = e => ({
    unit: e.unitCode || e.unit_code
      ? { code: e.unitCode || e.unit_code, name: e.unitName || e.unit_name }
      : courses.find(i => String(i.id) === String(e.course_id ?? e.courseId)),
    lecturer: e.lecturerName || e.lecturer_name
      ? { name: e.lecturerName || e.lecturer_name }
      : lecturers.find(i => String(i.id) === String(e.lecturer_id ?? e.lecturerId)),
    venue: e.venueDetails?.[0] ||
      (e.venueName || e.venue_name ? { name: e.venueName || e.venue_name, code: e.venueCode || e.venue_code, capacity: e.venueCapacity || e.venue_capacity } : null) ||
      venues.find(i => String(i.id) === String(e.venue_id ?? e.venueId)),
    cohorts: e.cohortDetails ||
      idList(e.cohort_ids ?? e.cohortIds, undefined).map(id => cohorts.find(i => String(i.id) === String(id))).filter(Boolean)
  })

  const handleSubmit = () => {
    if (!form.academic_year_id || !form.semester_id || !form.course_id || !form.lecturer_id || !form.faculty_ids.length ||
        !form.department_ids.length || !form.programme_ids.length || !form.cohort_ids.length || !form.venue_id || !form.day_of_week) {
      return setFormError('Academic year, semester, faculty, department, programme, unit, cohort, lecturer, venue, and day are required.')
    }
    const selectedCohorts = cohorts.filter(c => form.cohort_ids.includes(String(c.id)))
    const expected = selectedCohorts.reduce((t, c) => t + Number(c.student_count ?? c.studentCount ?? 0), 0)
    const venue = venues.find(v => String(v.id) === String(form.venue_id))
    const capacity = Number(venue?.capacity || 0)
    const payload = {
      ...form,
      academic_year_id: Number(form.academic_year_id) || null,
      semester_id: Number(form.semester_id) || null,
      course_id: Number(form.course_id),
      unit_name: courses.find(i => String(i.id) === String(form.course_id))?.name || `Unit ${form.course_id}`,
      programme_ids: form.programme_ids.map(Number),
      cohort_ids: form.cohort_ids.map(Number),
      cohort_names: selectedCohorts.map(c => ({ id: Number(c.id), name: c.name })),
      cohort_id: Number(form.cohort_ids[0]) || null,
      lecturer_id: Number(form.lecturer_id),
      venue_id: Number(form.venue_id),
      venue_name: venue?.name || venue?.venue_name || `Venue ${form.venue_id}`,
      expected_students: expected,
      venue_capacity: capacity
    }
    if (expected > capacity) {
      setCapacityWarning({ payload, expectedStudents: expected, venueCapacity: capacity, venueName: venue?.name || 'Selected venue' })
      return
    }
    submitPayload(payload)
  }
  const submitPayload = payload => {
    if (editingDraftId) updateStaged.mutate({ id: editingDraftId, payload })
    else if (editingEntryId) stageUpdate.mutate({ id: editingEntryId, payload })
    else createEntry.mutate(payload)
  }

  const openEntryEditor = (entry, pendingDraftId = null) => {
    const v = pendingDraftId ? entry.payload : entry
    const programmeIds = idList(v.programmeIds ?? v.programme_ids, undefined)
    const course = courses.find(i => String(i.id) === String(v.course_id ?? v.courseId))
    const courseProg = idList(course?.programmeIds ?? course?.programme_ids, undefined)
    const selProg = programmes.filter(i => programmeIds.includes(String(i.id)) || courseProg.includes(String(i.id)))
    const departmentIds = [...new Set(selProg.map(i => String(i.department_id ?? i.departmentId)))]
    const facultyIds = [...new Set(departmentIds.map(id => {
      const d = departments.find(i => String(i.id) === id)
      return String(d?.faculty_id ?? d?.facultyId ?? '')
    }).filter(Boolean))]
    setForm({
      ...emptyEntry,
      academic_year_id: String(v.academic_year_id ?? v.academicYearId ?? ''),
      semester_id: String(v.semester_id ?? v.semesterId ?? ''),
      course_id: String(v.course_id ?? v.courseId ?? ''),
      faculty_ids: facultyIds, department_ids: departmentIds, programme_ids: selProg.map(i => String(i.id)),
      cohort_ids: idList(v.cohortIds ?? v.cohort_ids, v.cohort_id ?? v.cohortId),
      lecturer_id: String(v.lecturer_id ?? v.lecturerId ?? ''),
      venue_id: String(v.venue_id ?? v.venueId ?? ''),
      day_of_week: weekdayKey(v.day_of_week ?? v.dayOfWeek ?? 'Mon'),
      start_time: String(v.start_time ?? v.startTime ?? '08:00').slice(0, 5),
      end_time: String(v.end_time ?? v.endTime ?? '10:00').slice(0, 5),
      event_type: String(v.event_type ?? v.eventType ?? 'LECTURE'),
      status: v.status || 'SCHEDULED'
    })
    setEditingEntryId(pendingDraftId ? null : entry.id)
    setEditingDraftId(pendingDraftId)
    setFormError('')
    setSelectedEvent(null)
    setShowForm(true)
  }

  const stagedDescription = draft => {
    const p = draft.payload || {}
    const courseId = String(p.course_id ?? p.courseId ?? '')
    const unit = courses.find(i => String(i.id) === courseId)
    const lecturer = lecturers.find(i => String(i.id) === String(p.lecturer_id ?? p.lecturerId ?? ''))
    const venue = venues.find(i => String(i.id) === String(p.venue_id ?? p.venueId ?? ''))
    const cohortNames = idList(p.cohort_ids ?? p.cohortIds, p.cohort_id ?? p.cohortId)
      .map(id => cohorts.find(i => String(i.id) === id)?.name || `Cohort ${id}`).join(', ')
    const unitLabel = unit ? `${unit.code ? `${unit.code} · ` : ''}${unit.name || ''}`.trim() : `Unit ${courseId || '?'}`
    const lecturerName = lecturer?.name || lecturer?.full_name || lecturer?.email || `Lecturer ${p.lecturer_id ?? p.lecturerId ?? '?'}`
    const venueName = venue ? `${venue.code ? `${venue.code} · ` : ''}${venue.name}` : `Venue ${p.venue_id ?? p.venueId ?? '?'}`
    const detail = `${unitLabel} · ${p.event_type ?? p.eventType ?? 'LECTURE'} · ${cohortNames || 'No cohorts'} · ${lecturerName} · ${venueName} · ${p.day_of_week ?? p.dayOfWeek ?? 'Day'} ${p.start_time ?? p.startTime}–${p.end_time ?? p.endTime}`
    return draft.kind === 'timetable_update' ? `Change to event #${p.timetable_entry_id}: ${detail}` : detail
  }

  const toggleList = (list, id, on) => (on ? [...new Set([...list, String(id)])] : list.filter(v => v !== String(id)))
  const unitAllowed = (c, programme_ids) => {
    const unit = courses.find(i => String(i.id) === String(c.course_id))
    return idList(unit?.programmeIds ?? unit?.programme_ids, undefined).some(id => programme_ids.includes(id))
  }
  const pruneProgrammes = (c, department_ids) => c.programme_ids.filter(id => {
    const p = programmes.find(i => String(i.id) === id)
    return p && department_ids.includes(String(p.department_id ?? p.departmentId))
  })
  const pruneCohorts = (c, programme_ids) => {
    const set = new Set(cohorts.filter(i => programme_ids.includes(String(i.programme_id ?? i.programmeId))).map(i => String(i.id)))
    return c.cohort_ids.filter(id => set.has(String(id)))
  }
  const toggleFaculty = (id, on) => setForm(c => {
    const faculty_ids = toggleList(c.faculty_ids, id, on)
    const department_ids = c.department_ids.filter(d => {
      const dep = departments.find(i => String(i.id) === d)
      return dep && faculty_ids.includes(String(dep.faculty_id ?? dep.facultyId))
    })
    const programme_ids = pruneProgrammes(c, department_ids)
    return { ...c, faculty_ids, department_ids, programme_ids, cohort_ids: pruneCohorts(c, programme_ids), course_id: unitAllowed(c, programme_ids) ? c.course_id : '' }
  })
  const toggleDepartment = (id, on) => setForm(c => {
    const department_ids = toggleList(c.department_ids, id, on)
    const programme_ids = pruneProgrammes(c, department_ids)
    return { ...c, department_ids, programme_ids, cohort_ids: pruneCohorts(c, programme_ids), course_id: unitAllowed(c, programme_ids) ? c.course_id : '' }
  })
  const toggleProgramme = (id, on) => setForm(c => {
    const programme_ids = toggleList(c.programme_ids, id, on)
    const unit = eligibleUnits.find(u => String(u.id) === String(c.course_id))
    const ok = !c.course_id || idList(unit?.programmeIds ?? unit?.programme_ids, undefined).some(p => programme_ids.includes(p))
    return { ...c, programme_ids, cohort_ids: pruneCohorts(c, programme_ids), course_id: ok ? c.course_id : '' }
  })

  const openEvent = item => { setSelectedEvent(item); setMakeupForm(emptyMakeup); setMakeupMessage('') }
  const unitCodeOf = item => item.unitCode || item.unit_code || courses.find(c => String(c.id) === String(item.course_id ?? item.courseId))?.code || item.course_id || 'Unit'

  const filterOpts = (list, label, key = x => String(x.id ?? x.name), text = x => x.name) =>
    [{ value: 'all', label }, ...(list || []).map(x => ({ value: key(x), label: text(x) }))]

  const needsSem = !form.semester_id
  const set = key => v => setForm(c => ({ ...c, [key]: v }))

  /* ---------------- calendar ---------------- */
  const renderCalendar = () => (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ width: TIME_COLUMN, gap: 10 }}>
          <View style={[styles.gridHeader, { width: TIME_COLUMN, backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.gridHeaderText, { color: colors.text }]}>Time</Text></View>
          {timeSlots.map(t => (
            <View key={t} style={[styles.gridHeader, { width: TIME_COLUMN, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.gridHeaderText, { color: colors.text }]}>{formatHour(t)}</Text>
            </View>
          ))}
        </View>
        {days.map(day => {
          const dayEvents = eventsByDay[day] || []
          const dayWidth = laneCountForDay(dayEvents) * LANE_WIDTH
          return (
            <View key={day} style={{ width: dayWidth, gap: 10 }}>
              <View style={[styles.gridHeader, { width: dayWidth, backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.gridHeaderText, { color: colors.text }]}>{fullDayNames[day]}</Text></View>
              <View style={{ width: dayWidth, height: timeSlots.length * MINUTES_PER_HOUR }}>
                {timeSlots.map((t, i) => (
                  <View key={`${day}-${t}`} style={[styles.hourRow, { top: i * MINUTES_PER_HOUR, backgroundColor: colors.tableHeadBg, borderColor: colors.border }]} />
                ))}
                {dayEvents.map(item => {
                  const visibleStart = Math.max(item._start, 7 * 60)
                  const visibleEnd = Math.min(item._end, 21 * 60)
                  const top = ((visibleStart - 7 * 60) / 60) * MINUTES_PER_HOUR
                  const height = Math.max(18, ((visibleEnd - visibleStart) / 60) * MINUTES_PER_HOUR + HOUR_HEIGHT)
                  const left = item._lane * LANE_WIDTH
                  const width = item._laneSpan * LANE_WIDTH
                  const crowded = item._laneCount > 1
                  const conflict = conflictData.conflictIds.has(eventIdentity(item))
                  const showTime = height >= 44
                  const showDetails = height >= 62 && width >= 170
                  const lecturerName = item.lecturerName || item.lecturer_name || lecturerNameMap[String(item.lecturer_id ?? item.lecturerId)]
                  const kind = String(item.event_type || item.eventType || 'LECTURE').toLowerCase()
                  return (
                    <Pressable key={item.id ?? `${day}-${item._start}-${item.course_id}`} onPress={() => openEvent(item)}
                      accessibilityRole='button'
                      style={[styles.card, {
                        top, height, left: left + 3, width: width - 6,
                        borderColor: conflict ? colors.danger : eventTypeColors[kind] || colors.border,
                        backgroundColor: conflict ? colors.conflictBg : colors.surface,
                        zIndex: conflict ? 4 : 2,
                        padding: crowded ? undefined : undefined
                      }, crowded && { paddingVertical: 5, paddingHorizontal: 6, gap: 2, justifyContent: 'flex-start', alignItems: 'flex-start' }]}>
                      <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.heading }, crowded && { fontSize: 11.52, lineHeight: 13.2 }]}>{unitCodeOf(item)}</Text>
                      {conflict && <Text numberOfLines={1} style={[styles.conflictBadge, { color: colors.danger }]}>⚠ Venue conflict</Text>}
                      {showTime && (
                        <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted }]}>
                          {item.isMakeup ? `Make-up ${dateOnly(item.effective_date)} · ` : ''}{item.start_time || item.startTime} - {item.end_time || item.endTime}
                        </Text>
                      )}
                      {showDetails && (
                        <>
                          {!!lecturerName && <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted }]}>{lecturerName}</Text>}
                          <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted }]}>{eventVenues(item)}</Text>
                        </>
                      )}
                    </Pressable>
                  )
                })}
              </View>
            </View>
          )
        })}
      </View>
    </ScrollView>
  )

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader eyebrow='Academic planning' title='Timetable'>
        <ToolbarActions accessibilityRole='group'>
          {[['calendar', 'Calendar'], ['conflicts', `Conflicts (${conflictData.pairs.length})`], ['list', 'List']].map(([mode, label]) => (
            viewMode === mode
              ? <PrimaryButton key={mode} title={label} onPress={() => setViewMode(mode)} />
              : <SecondaryButton key={mode} title={label} onPress={() => setViewMode(mode)} />
          ))}
          {canSchedule && (
            <PrimaryButton title={showForm ? 'Close form' : 'Add entry'}
              onPress={() => { if (showForm) finishEdit(); else { setEditingEntryId(null); setEditingDraftId(null); setForm(emptyEntry); setShowForm(true) } }} />
          )}
          {visibleDrafts.length > 0 && (
            <PrimaryButton disabled={pending.isPublishing}
              title={pending.isPublishing ? 'Publishing…' : `Publish ${visibleDrafts.length} pending item${visibleDrafts.length === 1 ? '' : 's'}`}
              onPress={() => pending.publishDrafts(visibleDrafts).catch(() => {})} />
          )}
        </ToolbarActions>
      </PageHeader>

      {visibleDrafts.length > 0 && (
        <Panel style={{ gap: 14 }}>
          <View>
            <Eyebrow>Not yet on the timetable</Eyebrow>
            <H2>{visibleDrafts.length} staged timetable event{visibleDrafts.length === 1 ? '' : 's'}</H2>
            <P>Review, edit, and publish each event separately, or publish the full event batch. Unpublished drafts are not on the timetable.</P>
          </View>
          <View style={{ gap: 10 }}>
            {visibleDrafts.map(draft => (
              <StagingCard key={draft.id} type={draft.kind === 'timetable_update' ? 'Pending event changes' : 'Staged timetable event'} description={stagedDescription(draft)}>
                <TableAction title='Edit draft' onPress={() => openEntryEditor(draft, draft.id)} />
                <PrimaryButton disabled={pending.isPublishing} title={draft.kind === 'timetable_update' ? 'Publish changes' : 'Publish this event'}
                  onPress={() => pending.publishDrafts([draft]).catch(() => {})} />
                <DangerAction title='Remove' onPress={() => pending.removeDraft(draft.id)} />
              </StagingCard>
            ))}
          </View>
          <ConflictAlert message={pending.publishError} />
          <PrimaryButton disabled={pending.isPublishing} title={pending.isPublishing ? 'Publishing batch…' : 'Publish all pending timetable items'}
            onPress={() => pending.publishDrafts(visibleDrafts).catch(() => {})} />
        </Panel>
      )}

      {showForm && canSchedule && (
        <Sheet visible onClose={finishEdit}>
          <View>
            <Eyebrow>{editingEntryId || editingDraftId ? 'Update schedule' : 'New schedule'}</Eyebrow>
            <H2>{editingEntryId || editingDraftId ? 'Edit timetable event' : 'Add timetable entry'}</H2>
            {!!editingEntryId && <Muted style={{ marginTop: 16 }}>Changes stay pending and will not affect the live timetable until published.</Muted>}
          </View>
          <StackForm>
            <FormGrid>
              <BoxedField label='Academic year'>
                <Select value={String(form.academic_year_id)} emptyLabel='Select year' searchable={false}
                  options={academicYears.map(y => ({ value: String(y.id ?? y.name), label: y.name }))} onChange={set('academic_year_id')} />
              </BoxedField>
              <BoxedField label='Semester'>
                <Select value={String(form.semester_id)} emptyLabel='Select semester' searchable={false}
                  options={semesters.map(s => ({ value: String(s.id ?? s.name), label: s.name }))}
                  onChange={v => setForm(c => ({ ...c, semester_id: v, programme_ids: [], cohort_ids: [], course_id: '' }))} />
              </BoxedField>
              <Fieldset legend='Faculties'>
                <CheckboxList>
                  {faculties.map(f => <Checkbox key={f.id} label={f.name || f.code} disabled={needsSem}
                    checked={form.faculty_ids.includes(String(f.id))} onChange={on => toggleFaculty(f.id, on)} />)}
                  {needsSem && <Small>Select a semester first.</Small>}
                </CheckboxList>
              </Fieldset>
              <Fieldset legend='Departments'>
                <CheckboxList>
                  {eligibleDepartments.map(d => <Checkbox key={d.id} label={d.name || d.code} disabled={!form.faculty_ids.length}
                    checked={form.department_ids.includes(String(d.id))} onChange={on => toggleDepartment(d.id, on)} />)}
                  {!form.faculty_ids.length && <Small>Select a faculty first.</Small>}
                </CheckboxList>
              </Fieldset>
              <Fieldset legend='Programmes'>
                <CheckboxList>
                  {eligibleProgrammes.map(p => <Checkbox key={p.id} label={p.name || p.code} disabled={needsSem}
                    checked={form.programme_ids.includes(String(p.id))} onChange={on => toggleProgramme(p.id, on)} />)}
                  {!form.department_ids.length && <Small>Select a department first.</Small>}
                </CheckboxList>
              </Fieldset>
              <BoxedField label='Unit'>
                <Select value={String(form.course_id)} disabled={!form.programme_ids.length}
                  emptyLabel={form.programme_ids.length ? 'Select unit' : 'Select programme first'}
                  options={eligibleUnits.map(c => ({ value: String(c.id ?? c.code), label: `${c.code ? `${c.code} - ` : ''}${c.name || 'Unnamed unit'}` }))}
                  onChange={set('course_id')} />
              </BoxedField>
              <Field label='Lecturer'>
                <Select value={String(form.lecturer_id)} disabled={!form.programme_ids.length}
                  emptyLabel={form.programme_ids.length ? 'Select lecturer' : 'Select programme first'}
                  options={eligibleLecturers.map(l => ({ value: String(l.id ?? l.email), label: l.name || l.full_name || l.email }))}
                  onChange={set('lecturer_id')} />
              </Field>
              <Field label='Venue'>
                <Select variant='scrollable' value={String(form.venue_id)} placeholder='Select venue' title='Select venue'
                  options={venueOptions} onChange={set('venue_id')} />
              </Field>
              <Fieldset legend='Cohorts'>
                <CheckboxList>
                  {eligibleCohorts.map(c => <Checkbox key={c.id} label={`${c.name} (${c.student_count ?? c.studentCount ?? 0} students)`}
                    disabled={!form.programme_ids.length} checked={form.cohort_ids.includes(String(c.id))}
                    onChange={on => setForm(cur => ({ ...cur, cohort_ids: on ? [...cur.cohort_ids, String(c.id)] : cur.cohort_ids.filter(id => id !== String(c.id)) }))} />)}
                  {!form.programme_ids.length && <Small>Select a programme first.</Small>}
                </CheckboxList>
              </Fieldset>
              <Field label='Day'>
                <Select value={form.day_of_week} searchable={false} options={days.map(d => ({ value: d, label: d }))} onChange={set('day_of_week')} />
              </Field>
              <Field label='Event type'>
                <Select value={form.event_type} searchable={false} onChange={set('event_type')}
                  options={[{ value: 'LECTURE', label: 'Lecture' }, { value: 'TUTORIAL', label: 'Tutorial' }, { value: 'LAB', label: 'Lab' }, { value: 'SEMINAR', label: 'Seminar' }]} />
              </Field>
              <Field label='Start time'><TimeField value={form.start_time} onChange={set('start_time')} /></Field>
              <Field label='End time'><TimeField value={form.end_time} onChange={set('end_time')} /></Field>
            </FormGrid>
            <ConflictAlert message={formError} />
            <ToolbarActions>
              <PrimaryButton disabled={saving}
                title={saving ? 'Saving...' : editingEntryId ? 'Stage event changes' : editingDraftId ? 'Save staged event' : 'Stage event'}
                onPress={handleSubmit} />
              <SecondaryButton title='Cancel' onPress={finishEdit} />
            </ToolbarActions>
          </StackForm>
        </Sheet>
      )}

      <Panel>
        <FilterRow>
          <TextField value={search} onChangeText={setSearch} placeholder='Search unit code or name' />
          <Select value={fAcademicYear} onChange={setFAcademicYear} searchable={false} options={filterOpts(academicYears, 'Academic year')} />
          <Select value={fSemester} onChange={setFSemester} searchable={false} options={filterOpts(semesters, 'Semester')} />
          <Select value={fProgramme} onChange={setFProgramme} options={filterOpts(programmes, 'Programme', p => String(p.id ?? p.code), p => p.name || p.code)} />
          <Select value={fCohort} onChange={setFCohort} options={filterOpts(cohorts, 'Cohort')} />
          <Select value={fLecturer} onChange={setFLecturer} options={filterOpts(lecturers, 'Lecturer', l => String(l.id ?? l.email), l => l.name || l.full_name || l.email)} />
          <Select variant='scrollable' value={fVenue} onChange={setFVenue} title='Filter by venue'
            options={[{ value: 'all', label: 'All venues' }, ...venues.map(v => ({ value: String(v.id), label: `${v.code ? `${v.code} · ` : ''}${v.name || v.venue_name}` }))]} />
          <Select value={selectedDay} onChange={setSelectedDay} searchable={false}
            options={[{ value: 'all', label: 'All days' }, ...days.map(d => ({ value: d, label: fullDayNames[d] }))]} />
          <Select value={fEventType} onChange={setFEventType} searchable={false}
            options={[{ value: 'all', label: 'All event types' }, { value: 'EXAM', label: 'Exams' }, { value: 'LECTURE', label: 'Lectures' },
              { value: 'TUTORIAL', label: 'Tutorials' }, { value: 'SEMINAR', label: 'Seminars' }, { value: 'LAB', label: 'Labs' }]} />
        </FilterRow>
      </Panel>

      <Panel>
        {viewMode === 'conflicts' && !isLoading && !error && (
          <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.tableHeadBg }, conflictData.pairs.length > 0 && { borderColor: colors.conflictSoftBorder, backgroundColor: colors.conflictBg }]}
            accessibilityRole='summary'>
            <Text style={[type.body, { fontWeight: '700', color: conflictData.pairs.length ? colors.dangerText : colors.text }]}>
              {conflictData.pairs.length
                ? `${conflictData.pairs.length} venue ${conflictData.pairs.length === 1 ? 'conflict' : 'conflicts'} detected`
                : 'No venue conflicts detected'}
            </Text>
            <Text style={[type.body, { color: colors.muted }]}>
              {conflictData.conflictIds.size
                ? `${conflictData.conflictIds.size} affected timetable entries`
                : 'Overlaps in different venues are not treated as venue conflicts.'}
            </Text>
          </View>
        )}
        {isLoading ? <P>Loading timetable...</P>
          : error ? <FormError style={{ marginVertical: 16 }}>Unable to load timetable.</FormError>
          : viewMode !== 'list' ? renderCalendar() : (
            <View style={{ marginTop: 18 }}>
              {sortedRows.map((item, index) => (
                <View key={item.id ?? `${item.day_of_week}-${item.start_time}-${item.venue_id}`}
                  style={{ paddingVertical: 12, borderBottomWidth: index === sortedRows.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                  <Pressable onPress={() => openEvent(item)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 4 }}>
                    <Text style={[type.body, { flex: 1 }]}>
                      <Text style={{ fontWeight: '700' }}>
                        {item.unitCode || item.unit_code ? `${item.unitCode || item.unit_code} ${item.unitName || item.unit_name || ''}`.trim()
                          : unitNameMap[String(item.course_id ?? item.courseId)] || item.course_id || item.courseId || 'Unit'}
                      </Text>
                      {' · '}{item.day_of_week || item.dayOfWeek || 'Day'}{item.effective_date ? ` · Make-up ${dateOnly(item.effective_date)}` : ''}
                    </Text>
                    <Text style={[type.body, { fontWeight: '700' }]}>{item.start_time || item.startTime} - {item.end_time || item.endTime}</Text>
                  </Pressable>
                </View>
              ))}
              {!sortedRows.length && <Body>No timetable entries match the filters.</Body>}
            </View>
          )}
      </Panel>

      {capacityWarning && (
        <Sheet visible dismissable={false} maxWidth={520}>
          <View><Eyebrow>Capacity warning</Eyebrow><H2>Venue capacity exceeded</H2></View>
          <Body>The selected cohorts contain {capacityWarning.expectedStudents} students, but {capacityWarning.venueName} has capacity for {capacityWarning.venueCapacity}.</Body>
          <Body>Do you want to create this timetable entry anyway?</Body>
          <ToolbarActions>
            <PrimaryButton title='Confirm anyway' disabled={saving}
              onPress={() => { submitPayload({ ...capacityWarning.payload, allow_capacity_override: true }); setCapacityWarning(null) }} />
            <SecondaryButton title='Cancel' onPress={() => setCapacityWarning(null)} />
          </ToolbarActions>
        </Sheet>
      )}

      {selectedEvent && (() => {
        const details = eventDetails(selectedEvent)
        const isExam = String(selectedEvent.id).startsWith('exam-')
        const find = (list, id) => list.find(i => String(i.id) === String(id))?.name || 'N/A'
        return (
          <Sheet visible onClose={() => setSelectedEvent(null)} maxWidth={620}>
            <View style={{ gap: 12 }}>
              <View>
                <Eyebrow>Timetable assignment</Eyebrow>
                <H2>{details.unit?.code || selectedEvent.unit_code || selectedEvent.course_id || 'Unit'} - {details.unit?.name || selectedEvent.unit_name || 'Unit details'}</H2>
              </View>
              <ToolbarActions>
                {roles.includes('ADMIN') && !isExam && !selectedEvent.isMakeup && <PrimaryButton title='Edit event' onPress={() => openEntryEditor(selectedEvent)} />}
                <SecondaryButton title='Close' onPress={() => setSelectedEvent(null)} />
              </ToolbarActions>
            </View>
            <View style={{ gap: 12 }}>
              <DetailCell label='Event type' value={selectedEvent.event_type || selectedEvent.eventType || 'LECTURE'} />
              <DetailCell label='Day' value={selectedEvent.day_of_week || selectedEvent.dayOfWeek} />
              <DetailCell label='Time' value={`${selectedEvent.start_time || selectedEvent.startTime} - ${selectedEvent.end_time || selectedEvent.endTime}`} />
              <DetailCell label='Unit code' value={details.unit?.code || 'N/A'} />
              <DetailCell label='Unit name' value={details.unit?.name || selectedEvent.unit_name || courseNameMap[String(selectedEvent.course_id ?? selectedEvent.courseId)] || 'N/A'} />
              <DetailCell label='Lecturer' value={details.lecturer?.name || selectedEvent.lecturer_name || lecturerNameMap[String(selectedEvent.lecturer_id ?? selectedEvent.lecturerId)] || 'N/A'} />
              <DetailCell label='Venue' value={`${itemVenueLabel(selectedEvent, details) || selectedEvent.venue_name || venueNameMap[String(selectedEvent.venue_id ?? selectedEvent.venueId)] || 'N/A'} ${details.venue?.capacity ? `(${details.venue.capacity} seats)` : ''}`.trim()} />
              <DetailCell label='Event type' value={selectedEvent.event_type || selectedEvent.eventType || 'N/A'} />
              <DetailCell label='Status' value={selectedEvent.status || 'SCHEDULED'} />
              <DetailCell label='Academic year' value={find(academicYears, selectedEvent.academic_year_id ?? selectedEvent.academicYearId)} />
              <DetailCell label='Semester' value={find(semesters, selectedEvent.semester_id ?? selectedEvent.semesterId)} />
              <DetailCell label='Cohorts' value={details.cohorts.length ? details.cohorts.map(c => `${c.name} (${c.student_count ?? c.studentCount ?? 0} students)`).join(', ') : 'N/A'} />
            </View>

            {roles.some(r => ['ADMIN', 'LECTURER'].includes(r)) && !isExam && (
              <StackForm gap={14}>
                <View><Eyebrow>Schedule change</Eyebrow><H3 style={{ marginBottom: 0 }}>Request a temporary make-up class</H3></View>
                <FormGrid>
                  <Field label='Make-up date'><DateField value={makeupForm.effective_date} onChange={v => setMakeupForm(c => ({ ...c, effective_date: v, new_venue_id: '' }))} /></Field>
                  <Field label='Venue'>
                    <Select variant='scrollable' value={String(makeupForm.new_venue_id)} placeholder='Select venue' title='Select make-up class venue'
                      options={makeupVenueOptions} onChange={v => setMakeupForm(c => ({ ...c, new_venue_id: v }))} />
                  </Field>
                  <Field label='Start time'><TimeField value={makeupForm.new_start_time} onChange={v => setMakeupForm(c => ({ ...c, new_start_time: v, new_venue_id: '' }))} /></Field>
                  <Field label='End time'><TimeField value={makeupForm.new_end_time} onChange={v => setMakeupForm(c => ({ ...c, new_end_time: v, new_venue_id: '' }))} /></Field>
                  <Field label='Reason'><TextField value={makeupForm.reason} placeholder='Reason for the make-up class' autoCapitalize='sentences' onChangeText={v => setMakeupForm(c => ({ ...c, reason: v }))} /></Field>
                </FormGrid>
                {!!makeupMessage && (makeupMutation.isError ? <FormError>{makeupMessage}</FormError> : <SuccessMessage>{makeupMessage}</SuccessMessage>)}
                <PrimaryButton disabled={makeupMutation.isPending} title={makeupMutation.isPending ? 'Submitting...' : 'Submit make-up request'}
                  onPress={() => {
                    setMakeupMessage('')
                    if (!makeupForm.effective_date || !makeupForm.new_start_time || !makeupForm.new_end_time || !makeupForm.reason) {
                      return setMakeupMessage('Make-up date, start time, end time, and reason are required.')
                    }
                    if (!makeupForm.new_venue_id) return setMakeupMessage('Select a venue for the make-up class.')
                    makeupMutation.mutate({
                      timetableEntryId: Number(selectedEvent.id), effectiveDate: makeupForm.effective_date,
                      originalVenueId: Number(selectedEvent.venue_id ?? selectedEvent.venueId), newVenueId: Number(makeupForm.new_venue_id),
                      originalStartTime: selectedEvent.start_time ?? selectedEvent.startTime, newStartTime: makeupForm.new_start_time,
                      originalEndTime: selectedEvent.end_time ?? selectedEvent.endTime, newEndTime: makeupForm.new_end_time, reason: makeupForm.reason
                    })
                  }} />
              </StackForm>
            )}
          </Sheet>
        )
      })()}
    </Screen>
  )
}

const styles = StyleSheet.create({
  gridHeader: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface
  },
  gridHeaderText: { ...type.body, fontWeight: '700' },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HOUR_HEIGHT,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.tableHeadBg
  },
  card: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: radius.cell,
    paddingVertical: 8,
    paddingHorizontal: 9,
    gap: 4,
    overflow: 'hidden'
  },
  cardTitle: { ...type.body, fontSize: 14.4, lineHeight: 21.6, fontWeight: '700' },
  cardMeta: { ...type.body, color: colors.muted, fontSize: 14, lineHeight: 18 },
  conflictBadge: { color: colors.dangerText, fontSize: 10.88, lineHeight: 12, fontWeight: '800' },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 16,
    rowGap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.tableHeadBg
  }
})

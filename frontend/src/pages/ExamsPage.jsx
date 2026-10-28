import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { formatDateOnly, weekdayFromDateOnly } from '../utils/dateOnly'
import ScrollableSelect from '../components/ScrollableSelect'
import PaginationControls from '../components/PaginationControls'
import ConfirmActionModal from '../components/ConfirmActionModal'
import { useAuth } from '../context/AuthContext'
import usePendingScheduleDrafts from '../hooks/usePendingScheduleDrafts'
import { semesterLabel } from '../utils/semesterLabel.js'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

const todayInputDate = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

const formatExamDate = value => {
  if (!value) return 'TBA'
  return formatDateOnly(value)
}

const examDay = value => {
  if (!value) return 'TBA'
  return weekdayFromDateOnly(value)
}

const emptyExam = {
  academic_year_id: '',
  semester_id: '',
  faculty_ids: [],
  unit_year_level: '',
  department_ids: [],
  programme_ids: [],
  course_id: '',
  exam_date: '',
  start_time: '09:00',
  end_time: '11:00',
  duration_minutes: 120,
  instructions: '',
  cohort_allocations: {},
  venue_allocations: [{ venueId: '', allocatedCapacity: '' }]
}

export default function ExamsPage () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const pendingSchedule = usePendingScheduleDrafts()
  const canManageExams = (user?.roles || []).includes('ADMIN')
  const pendingExamDrafts = pendingSchedule.drafts.filter(draft =>
    ['exam', 'exam_update'].includes(draft.kind)
  )
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const examEditorRef = useRef(null)
  const [editingExam, setEditingExam] = useState(null)
  const [form, setForm] = useState(emptyExam)
  const [formError, setFormError] = useState('')
  const [capacityWarning, setCapacityWarning] = useState(null)
  const [sortBy, setSortBy] = useState('date')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [examToDelete, setExamToDelete] = useState(null)

  useEffect(() => {
    if (!formError) return undefined
    const timeout = setTimeout(() => setFormError(''), 10000)
    return () => clearTimeout(timeout)
  }, [formError])

  useEffect(() => {
    if (!showForm) return undefined
    const frame = requestAnimationFrame(() =>
      examEditorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    )
    return () => cancelAnimationFrame(frame)
  }, [editingExam, showForm])

  const {
    data = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['exams'],
    queryFn: async () => {
      const response = await api.get('/api/exams')
      return toArray(response)
    }
  })

  const { data: courses = [] } = useQuery({
    queryKey: ['exam-course-options'],
    queryFn: async () => {
      const response = await api.get('/api/academic/courses')
      return toArray(response)
    }
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['exam-department-options'],
    queryFn: async () => toArray(await api.get('/api/academic/departments'))
  })

  const { data: faculties = [] } = useQuery({
    queryKey: ['exam-faculty-options'],
    queryFn: async () => toArray(await api.get('/api/academic/faculties'))
  })

  const { data: programmes = [] } = useQuery({
    queryKey: ['exam-programme-options'],
    queryFn: async () => toArray(await api.get('/api/academic/programmes'))
  })

  const { data: cohorts = [] } = useQuery({
    queryKey: ['exam-cohort-options'],
    queryFn: async () => {
      const response = await api.get('/api/academic/cohorts')
      return toArray(response)
    }
  })

  const { data: venues = [] } = useQuery({
    queryKey: ['exam-venue-options'],
    queryFn: async () => {
      const response = await api.get('/api/academic/venues')
      return toArray(response)
    }
  })

  const { data: academicYears = [] } = useQuery({
    queryKey: ['exam-academic-year-options'],
    queryFn: async () => {
      const response = await api.get('/api/academic/academic-years')
      return toArray(response)
    }
  })

  const { data: semesters = [] } = useQuery({
    queryKey: ['exam-semester-options'],
    queryFn: async () => {
      const response = await api.get('/api/academic/semesters')
      return toArray(response)
    }
  })

  const optionLabel = (items, emptyLabel) => (items.length ? null : emptyLabel)

  const eligibleUnits = useMemo(() => {
    return courses.filter(unit => {
      const matchesYear =
        !form.unit_year_level ||
        String(unit.year_level ?? unit.yearLevel) ===
          String(form.unit_year_level)
      const matchesSemester =
        !form.semester_id ||
        String(unit.semester_id ?? unit.semesterId) === String(form.semester_id)
      const matchesDepartment =
        !form.department_ids.length ||
        (unit.departmentIds || [unit.department_id ?? unit.departmentId]).some(
          id => form.department_ids.includes(String(id))
        )
      const programmeIds = unit.programmeIds || unit.programme_ids || []
      const matchesProgramme =
        !form.programme_ids.length ||
        programmeIds.some(id => form.programme_ids.includes(String(id)))
      return (
        matchesYear && matchesSemester && matchesDepartment && matchesProgramme
      )
    })
  }, [
    courses,
    form.department_ids,
    form.programme_ids,
    form.semester_id,
    form.unit_year_level
  ])

  const eligibleDepartments = useMemo(
    () =>
      departments.filter(department =>
        form.faculty_ids.includes(
          String(department.faculty_id ?? department.facultyId)
        )
      ),
    [departments, form.faculty_ids]
  )

  const eligibleProgrammes = useMemo(
    () =>
      programmes.filter(programme =>
        form.department_ids.includes(
          String(programme.department_id ?? programme.departmentId)
        )
      ),
    [form.department_ids, programmes]
  )

  const eligibleSemesters = useMemo(() => {
    if (!form.academic_year_id) return []
    return semesters.filter(
      semester =>
        String(semester.academic_year_id ?? semester.academicYearId) ===
        String(form.academic_year_id)
    )
  }, [form.academic_year_id, semesters])

  const eligibleCohorts = useMemo(() => {
    return cohorts.filter(cohort => {
      const matchesYear =
        !form.academic_year_id ||
        String(cohort.academic_year_id ?? cohort.academicYearId) ===
          String(form.academic_year_id)
      const matchesDepartment =
        !form.department_ids.length ||
        form.department_ids.includes(
          String(
            cohort.department_id ??
              cohort.departmentId ??
              programmes.find(
                item =>
                  String(item.id) ===
                  String(cohort.programme_id ?? cohort.programmeId)
              )?.department_id ??
              programmes.find(
                item =>
                  String(item.id) ===
                  String(cohort.programme_id ?? cohort.programmeId)
              )?.departmentId
          )
        )
      const matchesProgramme =
        !form.programme_ids.length ||
        form.programme_ids.includes(
          String(cohort.programme_id ?? cohort.programmeId)
        )
      return matchesYear && matchesDepartment && matchesProgramme
    })
  }, [
    cohorts,
    form.academic_year_id,
    form.department_ids,
    form.programme_ids,
    programmes
  ])

  const createExamMutation = useMutation({
    mutationFn: async payload =>
      pendingSchedule.stageDraft('exam', payload, user?.id),
    onSuccess: () => {
      setShowForm(false)
      setForm(emptyExam)
      setFormError('')
    },
    onError: err => setFormError(err.message || 'Unable to stage exam.')
  })

  const stageExamEditMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      pendingSchedule.stageDraft(
        'exam_update',
        { ...payload, exam_id: Number(id) },
        user?.id
      ),
    onSuccess: () => {
      setShowForm(false)
      setEditingExam(null)
      setForm(emptyExam)
      setFormError('')
    },
    onError: error =>
      setFormError(error.message || 'Unable to stage exam changes.')
  })

  const updateStagedExamMutation = useMutation({
    mutationFn: ({ id, payload }) => pendingSchedule.updateDraft(id, payload),
    onSuccess: () => {
      setShowForm(false)
      setEditingExam(null)
      setForm(emptyExam)
      setFormError('')
    },
    onError: error => setFormError(error.message || 'Unable to update draft.')
  })

  const deleteExamMutation = useMutation({
    mutationFn: id => api.del(`/api/exams/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exams'] }),
        queryClient.invalidateQueries({ queryKey: ['timetable-exams'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
      ])
      setExamToDelete(null)
    }
  })

  const editExam = (exam, pendingDraftId = null, pendingDraftKind = 'exam') => {
    const values = pendingDraftId ? exam.payload : exam
    const unit = courses.find(
      item => String(item.id) === String(values.course_id ?? values.courseId)
    )
    const departmentIds = (
      unit?.departmentIds ||
      unit?.department_ids || [unit?.department_id ?? unit?.departmentId]
    )
      .filter(value => value !== undefined && value !== null)
      .map(String)
    const programmeIds = (unit?.programmeIds || unit?.programme_ids || []).map(
      String
    )
    const facultyIds = departments
      .filter(item => departmentIds.includes(String(item.id)))
      .map(item => String(item.faculty_id ?? item.facultyId))
    const cohortRows = values.cohort_allocations || exam.cohortDetails || []
    const cohortAllocations = Object.fromEntries(
      cohortRows.map(item => [
        String(item.cohortId ?? item.cohort_id ?? item.id),
        String(item.studentCount ?? item.student_count ?? '')
      ])
    )
    const venueRows = values.venue_allocations || exam.venueDetails || []
    const venueAllocations = venueRows.map(item => ({
      venueId: String(item.venueId ?? item.venue_id ?? item.id),
      allocatedCapacity: String(
        item.allocatedCapacity ?? item.allocated_capacity ?? item.capacity ?? ''
      )
    }))
    setForm({
      academic_year_id: String(
        values.academic_year_id ?? values.academicYearId ?? ''
      ),
      semester_id: String(values.semester_id ?? values.semesterId ?? ''),
      faculty_ids: [...new Set(facultyIds)],
      unit_year_level: String(unit?.year_level ?? unit?.yearLevel ?? ''),
      department_ids: departmentIds,
      programme_ids: programmeIds,
      course_id: String(values.course_id ?? values.courseId ?? ''),
      exam_date: String(values.exam_date ?? values.examDate ?? '').slice(0, 10),
      start_time: String(
        values.start_time ?? values.startTime ?? '09:00'
      ).slice(0, 5),
      end_time: String(values.end_time ?? values.endTime ?? '11:00').slice(
        0,
        5
      ),
      duration_minutes:
        values.duration_minutes ?? values.durationMinutes ?? 120,
      instructions: values.instructions || '',
      cohort_allocations: cohortAllocations,
      venue_allocations: venueAllocations.length
        ? venueAllocations
        : [{ venueId: '', allocatedCapacity: '' }]
    })
    setEditingExam(
      pendingDraftId
        ? {
            pendingDraftId,
            pendingDraftKind,
            examId: values.exam_id ?? values.examId
          }
        : exam
    )
    setFormError('')
    setShowForm(true)
  }

  const stagedExamDescription = draft => {
    const payload = draft.payload || {}
    const unit = courses.find(
      item =>
        String(item.id) === String(payload.course_id ?? payload.courseId ?? '')
    )
    const cohortNames = (payload.cohort_allocations || [])
      .map(allocation => {
        const id = allocation.cohortId ?? allocation.cohort_id
        return (
          cohorts.find(item => String(item.id) === String(id))?.name ||
          allocation.cohortName ||
          `Cohort ${id}`
        )
      })
      .join(', ')
    const venueNames = (payload.venue_allocations || [])
      .map(allocation => {
        const id = allocation.venueId ?? allocation.venue_id
        const venue = venues.find(item => String(item.id) === String(id))
        return venue
          ? `${venue.code ? `${venue.code} · ` : ''}${venue.name}`
          : `Venue ${id}`
      })
      .join(', ')
    const unitLabel = unit
      ? `${unit.code ? `${unit.code} · ` : ''}${unit.name || ''}`.trim()
      : `Unit ${payload.course_id ?? payload.courseId ?? '?'}`
    const yearName = academicYears.find(
      item =>
        String(item.id) ===
        String(payload.academic_year_id ?? payload.academicYearId ?? '')
    )?.name
    const semesterName = semesters.find(
      item =>
        String(item.id) ===
        String(payload.semester_id ?? payload.semesterId ?? '')
    )?.name
    const date = payload.exam_date ?? payload.examDate
    return `${
      payload.exam_id ? `Exam #${payload.exam_id} changes · ` : ''
    }${unitLabel} · ${yearName || 'Year'} / ${semesterName || 'Semester'} · ${
      cohortNames || 'No cohorts'
    } · ${venueNames || 'No venues'} · ${examDay(date)}, ${formatExamDate(
      date
    )} (${payload.start_time ?? payload.startTime}–${
      payload.end_time ?? payload.endTime
    })`
  }

  const toggleFaculty = (facultyId, checked) => {
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
      const allowedCohorts = new Set(
        cohorts
          .filter(cohort =>
            programme_ids.includes(
              String(cohort.programme_id ?? cohort.programmeId)
            )
          )
          .map(cohort => String(cohort.id))
      )
      const cohort_allocations = Object.fromEntries(
        Object.entries(current.cohort_allocations).filter(([id]) =>
          allowedCohorts.has(id)
        )
      )
      const selectedUnit = courses.find(
        item => String(item.id) === String(current.course_id)
      )
      const selectedUnitProgrammes = (
        selectedUnit?.programmeIds ||
        selectedUnit?.programme_ids ||
        []
      ).map(String)
      return {
        ...current,
        faculty_ids,
        department_ids,
        programme_ids,
        cohort_allocations,
        course_id: selectedUnitProgrammes.some(id => programme_ids.includes(id))
          ? current.course_id
          : '',
        unit_year_level: selectedUnitProgrammes.some(id =>
          programme_ids.includes(id)
        )
          ? current.unit_year_level
          : ''
      }
    })
  }

  const toggleDepartment = (departmentId, checked) => {
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
      const selectedUnit = courses.find(
        item => String(item.id) === String(current.course_id)
      )
      const selectedUnitProgrammes = (
        selectedUnit?.programmeIds ||
        selectedUnit?.programme_ids ||
        []
      ).map(String)
      const cohortIds = new Set(
        cohorts
          .filter(cohort =>
            programme_ids.includes(
              String(cohort.programme_id ?? cohort.programmeId)
            )
          )
          .map(cohort => String(cohort.id))
      )
      return {
        ...current,
        department_ids,
        programme_ids,
        cohort_allocations: Object.fromEntries(
          Object.entries(current.cohort_allocations).filter(([id]) =>
            cohortIds.has(id)
          )
        ),
        course_id: selectedUnitProgrammes.some(id => programme_ids.includes(id))
          ? current.course_id
          : '',
        unit_year_level: selectedUnitProgrammes.some(id =>
          programme_ids.includes(id)
        )
          ? current.unit_year_level
          : ''
      }
    })
  }

  const toggleProgramme = (programmeId, checked) => {
    setForm(current => {
      const programme_ids = checked
        ? [...new Set([...current.programme_ids, String(programmeId)])]
        : current.programme_ids.filter(id => id !== String(programmeId))
      const cohortIds = new Set(
        cohorts
          .filter(cohort =>
            programme_ids.includes(
              String(cohort.programme_id ?? cohort.programmeId)
            )
          )
          .map(cohort => String(cohort.id))
      )
      const selectedUnit = courses.find(
        item => String(item.id) === String(current.course_id)
      )
      const selectedUnitProgrammes = (
        selectedUnit?.programmeIds ||
        selectedUnit?.programme_ids ||
        []
      ).map(String)
      const unitStillAvailable = selectedUnitProgrammes.some(id =>
        programme_ids.includes(id)
      )
      return {
        ...current,
        programme_ids,
        cohort_allocations: Object.fromEntries(
          Object.entries(current.cohort_allocations).filter(([id]) =>
            cohortIds.has(id)
          )
        ),
        course_id: unitStillAvailable ? current.course_id : '',
        unit_year_level: unitStillAvailable ? current.unit_year_level : ''
      }
    })
  }

  const filteredRows = useMemo(() => {
    return [...(data || [])]
      .filter(item => {
        const text = `${item.unitCode || item.unit_code || ''} ${
          item.unitName || item.unit_name || ''
        } ${item.programmes || ''} ${(item.cohortDetails || [])
          .map(cohort => cohort.name)
          .join(' ')} ${(item.venueDetails || [])
          .map(venue => venue.name)
          .join(' ')} ${item.course_id || item.courseId || ''} ${
          item.venue_id || item.venueId || ''
        }`.toLowerCase()
        const status = item.status || 'SCHEDULED'
        return (
          text.includes(search.toLowerCase()) &&
          (statusFilter === 'all' || status === statusFilter)
        )
      })
      .sort((first, second) => {
        if (sortBy === 'time')
          return String(first.start_time || '').localeCompare(
            String(second.start_time || '')
          )
        if (sortBy === 'unit')
          return String(first.unitCode || first.unit_code || '').localeCompare(
            String(second.unitCode || second.unit_code || '')
          )
        if (sortBy === 'status')
          return String(first.status || '').localeCompare(
            String(second.status || '')
          )
        return String(first.exam_date || '').localeCompare(
          String(second.exam_date || '')
        )
      })
  }, [data, search, sortBy, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const handleSubmit = event => {
    event.preventDefault()

    if (
      !form.academic_year_id ||
      !form.semester_id ||
      !form.course_id ||
      !form.faculty_ids.length ||
      !form.department_ids.length ||
      !form.programme_ids.length ||
      !form.exam_date
    ) {
      setFormError(
        'Academic year, semester, faculty, department, programme, unit year, unit, and date are required.'
      )
      return
    }

    const today = todayInputDate()
    if (form.exam_date < today) {
      setFormError('Exam date cannot be in the past.')
      return
    }
    if (form.start_time >= form.end_time) {
      setFormError('Exam end time must be later than its start time.')
      return
    }

    if (form.exam_date === today) {
      const currentTime = new Date().toTimeString().slice(0, 5)
      if (form.start_time <= currentTime) {
        setFormError('Exam start time must be later than the current time.')
        return
      }
    }

    const cohortAllocations = Object.keys(form.cohort_allocations)
      .map(cohortId => {
        const cohort = cohorts.find(
          item => String(item.id) === String(cohortId)
        )
        return {
          cohortId,
          studentCount: Number(
            cohort?.student_count ?? cohort?.studentCount ?? 0
          ),
          cohortName: cohort?.name || `Cohort ${cohortId}`
        }
      })
      .filter(allocation => allocation.studentCount > 0)

    if (!cohortAllocations.length) {
      setFormError('Select at least one cohort with students.')
      return
    }
    if (
      new Set(cohortAllocations.map(item => String(item.cohortId))).size !==
      cohortAllocations.length
    ) {
      setFormError('Each cohort can only be added once to an exam.')
      return
    }

    const totalStudents = cohortAllocations.reduce(
      (total, allocation) => total + Number(allocation.studentCount),
      0
    )
    const incompleteVenue = form.venue_allocations.find(
      allocation =>
        Number(allocation.allocatedCapacity) > 0 && !allocation.venueId
    )
    if (incompleteVenue) {
      setFormError('Select a venue for every allocation with a capacity.')
      return
    }

    const venueAllocations = form.venue_allocations
      .map(allocation => ({ ...allocation }))
      .filter(
        allocation =>
          Number(allocation.allocatedCapacity) > 0 && allocation.venueId
      )
      .map(allocation => ({
        ...allocation,
        studentCount: Number(allocation.allocatedCapacity)
      }))

    if (!venueAllocations.length) {
      setFormError(
        'Select at least one venue and enter its allocation capacity.'
      )
      return
    }
    if (
      new Set(venueAllocations.map(item => String(item.venueId))).size !==
      venueAllocations.length
    ) {
      setFormError('Each venue can only be added once to an exam.')
      return
    }

    const allocatedStudents = venueAllocations.reduce(
      (total, allocation) => total + allocation.studentCount,
      0
    )
    if (allocatedStudents < totalStudents) {
      setFormError(
        `Venue allocations cover ${allocatedStudents} students, but the selected cohorts contain ${totalStudents}.`
      )
      return
    }

    const overCapacityVenue = venueAllocations.find(allocation => {
      const venue = venues.find(
        item => String(item.id) === String(allocation.venueId)
      )
      return allocation.allocatedCapacity > Number(venue?.capacity || 0)
    })
    if (overCapacityVenue) {
      const venue = venues.find(
        item => String(item.id) === String(overCapacityVenue.venueId)
      )
      setFormError(
        `${venue?.name || 'Selected venue'} cannot be allocated more than ${
          venue?.capacity || 0
        } students.`
      )
      return
    }

    const payload = {
      academic_year_id: Number(form.academic_year_id),
      semester_id: Number(form.semester_id),
      course_id: Number(form.course_id),
      unit_name:
        courses.find(item => String(item.id) === String(form.course_id))
          ?.name || `Unit ${form.course_id}`,
      cohort_names: cohortAllocations.map(allocation => ({
        id: Number(allocation.cohortId),
        name: allocation.cohortName
      })),
      venue_names: venueAllocations.map(allocation => {
        const venue = venues.find(
          item => String(item.id) === String(allocation.venueId)
        )
        return {
          id: Number(allocation.venueId),
          name:
            venue?.name || venue?.venue_name || `Venue ${allocation.venueId}`
        }
      }),
      exam_date: form.exam_date,
      start_time: form.start_time,
      end_time: form.end_time,
      duration_minutes: Number(form.duration_minutes) || 120,
      instructions: form.instructions,
      cohort_allocations: cohortAllocations,
      venue_allocations: venueAllocations
    }

    if (editingExam?.pendingDraftId) {
      updateStagedExamMutation.mutate({
        id: editingExam.pendingDraftId,
        payload:
          editingExam.pendingDraftKind === 'exam_update'
            ? { ...payload, exam_id: Number(editingExam.examId) }
            : payload
      })
    } else if (editingExam) {
      stageExamEditMutation.mutate({ id: editingExam.id, payload })
    } else {
      createExamMutation.mutate(payload)
    }
  }

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Assessment</p>
          <h1>Exams</h1>
        </div>

        <div className='toolbar-actions'>
          {canManageExams && pendingExamDrafts.length > 0 && (
            <button
              type='button'
              className='primary-button'
              disabled={pendingSchedule.isPublishing}
              onClick={() =>
                pendingSchedule.publishDrafts(pendingExamDrafts).catch(() => {})
              }
            >
              {pendingSchedule.isPublishing
                ? 'Publishing…'
                : `Publish ${pendingExamDrafts.length} pending exam${
                    pendingExamDrafts.length === 1 ? '' : 's'
                  }`}
            </button>
          )}
          {canManageExams && (
            <button
              type='button'
              className='primary-button'
              onClick={() => {
                if (showForm) {
                  setShowForm(false)
                  setEditingExam(null)
                  setForm(emptyExam)
                } else {
                  setShowForm(true)
                  setEditingExam(null)
                  setForm(emptyExam)
                }
              }}
            >
              {showForm ? 'Close form' : 'Add exam'}
            </button>
          )}
        </div>
      </div>

      {canManageExams && pendingExamDrafts.length > 0 && (
        <section className='content-panel pending-schedule-panel'>
          <div className='page-header'>
            <div>
              <p className='eyebrow'>Draft schedule</p>
              <h2>
                {pendingExamDrafts.length} staged exam
                {pendingExamDrafts.length === 1 ? '' : 's'}
              </h2>
              <p>
                Review each exam and publish it individually, or publish the
                full exam batch. Drafts remain private until published.
              </p>
            </div>
          </div>
          <div className='draft-list-scroll'>
            {pendingExamDrafts.map(draft => (
              <div
                className='pending-schedule-row exam-staging-card'
                key={draft.id}
              >
                <div className='staging-card-details'>
                  <span className='staging-card-type'>
                    {draft.kind === 'exam_update'
                      ? 'Pending exam changes'
                      : 'Staged exam'}
                  </span>
                  <strong>{stagedExamDescription(draft)}</strong>
                  {draft.payload.instructions && (
                    <small>{draft.payload.instructions}</small>
                  )}
                </div>
                <div className='staging-card-actions'>
                  <button
                    type='button'
                    className='table-action'
                    onClick={() => editExam(draft, draft.id, draft.kind)}
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
                    {draft.kind === 'exam_update'
                      ? 'Publish changes'
                      : 'Publish this exam'}
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
              pendingSchedule.publishDrafts(pendingExamDrafts).catch(() => {})
            }
          >
            {pendingSchedule.isPublishing
              ? 'Publishing batch…'
              : 'Publish all staged exams'}
          </button>
        </section>
      )}

      {showForm && canManageExams && (
        <section
          className='content-panel exam-editor-section'
          ref={examEditorRef}
        >
          <div className='page-header exam-editor-header'>
            <div>
              <p className='eyebrow'>
                {editingExam ? 'Update assessment' : 'New assessment'}
              </p>
              <h2>{editingExam ? 'Edit exam' : 'Stage exam'}</h2>
              {editingExam && !editingExam.pendingDraftId && (
                <p className='muted'>
                  Changes will remain pending and will not affect the published
                  exam until an administrator publishes them.
                </p>
              )}
            </div>
          </div>
          <form className='stack-form' onSubmit={handleSubmit}>
            <div className='form-grid'>
              <label className='selection-container'>
                Academic year
                <select
                  value={form.academic_year_id}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      academic_year_id: event.target.value,
                      semester_id: '',
                      faculty_ids: [],
                      department_ids: [],
                      programme_ids: [],
                      unit_year_level: '',
                      course_id: '',
                      cohort_allocations: {}
                    }))
                  }
                >
                  <option value=''>Select year</option>
                  {!academicYears.length && (
                    <option disabled>
                      {optionLabel(
                        academicYears,
                        'No academic years available'
                      )}
                    </option>
                  )}
                  {(academicYears || []).map(item => (
                    <option
                      key={item.id ?? item.name}
                      value={item.id ?? item.name}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className='selection-container'>
                Semester
                <select
                  value={form.semester_id}
                  disabled={!form.academic_year_id}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      semester_id: event.target.value,
                      course_id: '',
                      unit_year_level: ''
                    }))
                  }
                >
                  <option value=''>
                    {form.academic_year_id
                      ? 'Select semester'
                      : 'Select academic year first'}
                  </option>
                  {form.academic_year_id && !eligibleSemesters.length && (
                    <option disabled>
                      No semesters for this academic year
                    </option>
                  )}
                  {eligibleSemesters.map(item => (
                    <option
                      key={item.id ?? item.name}
                      value={item.id ?? item.name}
                    >
                      {semesterLabel(item, academicYears)}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className='full-width checkbox-fieldset selection-container'>
                <legend>Faculties</legend>
                <div className='checkbox-list'>
                  {faculties.map(faculty => (
                    <label key={faculty.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        disabled={!form.semester_id}
                        checked={form.faculty_ids.includes(String(faculty.id))}
                        onChange={event =>
                          toggleFaculty(faculty.id, event.target.checked)
                        }
                      />
                      <span>{faculty.name || faculty.code}</span>
                    </label>
                  ))}
                  {!form.semester_id && <small>Select a semester first.</small>}
                </div>
              </fieldset>

              <fieldset className='full-width checkbox-fieldset selection-container'>
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
                          toggleDepartment(department.id, event.target.checked)
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

              <fieldset className='full-width checkbox-fieldset selection-container'>
                <legend>Programmes</legend>
                <div className='checkbox-list'>
                  {eligibleProgrammes.map(programme => (
                    <label key={programme.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        checked={form.programme_ids.includes(
                          String(programme.id)
                        )}
                        onChange={event =>
                          toggleProgramme(programme.id, event.target.checked)
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
                Unit year
                <select
                  value={form.unit_year_level}
                  disabled={!form.semester_id}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      unit_year_level: event.target.value,
                      course_id: ''
                    }))
                  }
                >
                  <option value=''>
                    {form.semester_id ? 'Select year' : 'Select semester first'}
                  </option>
                  {[1, 2, 3, 4, 5, 6].map(year => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </select>
              </label>

              <label className='selection-container'>
                Unit
                <select
                  value={form.course_id}
                  disabled={
                    !form.unit_year_level ||
                    !form.semester_id ||
                    !form.department_ids.length ||
                    !form.programme_ids.length
                  }
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      course_id: event.target.value
                    }))
                  }
                >
                  <option value=''>
                    {form.unit_year_level &&
                    form.semester_id &&
                    form.department_ids.length &&
                    form.programme_ids.length
                      ? 'Select unit'
                      : 'Complete filters first'}
                  </option>
                  {!eligibleUnits.length && (
                    <option disabled>
                      No units match this year and semester
                    </option>
                  )}
                  {eligibleUnits.map(unit => (
                    <option
                      key={unit.id ?? unit.code}
                      value={unit.id ?? unit.code}
                    >
                      {unit.code ? `${unit.code} - ` : ''}
                      {unit.name || 'Unnamed unit'}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Exam date
                <input
                  type='date'
                  value={form.exam_date}
                  min={todayInputDate()}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      exam_date: event.target.value
                    }))
                  }
                />
              </label>

              <label>
                Start time
                <input
                  type='time'
                  value={form.start_time}
                  min={
                    form.exam_date === todayInputDate()
                      ? new Date().toTimeString().slice(0, 5)
                      : undefined
                  }
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

              <label>
                Duration (minutes)
                <input
                  type='number'
                  value={form.duration_minutes}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      duration_minutes: event.target.value
                    }))
                  }
                />
              </label>

              <fieldset className='full-width checkbox-fieldset'>
                <legend>Venues and allocation capacity</legend>
                <div className='allocation-list'>
                  {form.venue_allocations.map((allocation, index) => (
                    <div
                      key={`venue-allocation-${index}`}
                      className='allocation-row'
                    >
                      <ScrollableSelect
                        value={allocation.venueId}
                        required
                        options={(venues || []).map(venue => ({
                          value: venue.id ?? venue.name,
                          label: `${venue.code ? `${venue.code} · ` : ''}${
                            venue.name || venue.venue_name
                          } (${venue.capacity || 0} seats)`,
                          searchText: venue.name || venue.venue_name
                        }))}
                        placeholder='Select venue'
                        ariaLabel='Select exam venue'
                        onChange={value =>
                          setForm(current => ({
                            ...current,
                            venue_allocations: current.venue_allocations.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, venueId: value }
                                  : item
                            )
                          }))
                        }
                      />
                      <input
                        type='number'
                        min='1'
                        max={
                          venues.find(
                            venue =>
                              String(venue.id) === String(allocation.venueId)
                          )?.capacity || undefined
                        }
                        placeholder='Allocation'
                        value={allocation.allocatedCapacity}
                        onChange={event =>
                          setForm(current => ({
                            ...current,
                            venue_allocations: current.venue_allocations.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      allocatedCapacity: event.target.value
                                    }
                                  : item
                            )
                          }))
                        }
                      />
                      {form.venue_allocations.length > 1 && (
                        <button
                          type='button'
                          className='table-action danger'
                          onClick={() =>
                            setForm(current => ({
                              ...current,
                              venue_allocations:
                                current.venue_allocations.filter(
                                  (_, itemIndex) => itemIndex !== index
                                )
                            }))
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type='button'
                    className='secondary-button'
                    onClick={() =>
                      setForm(current => ({
                        ...current,
                        venue_allocations: [
                          ...current.venue_allocations,
                          { venueId: '', allocatedCapacity: '' }
                        ]
                      }))
                    }
                  >
                    Add another venue
                  </button>
                  {!venues.length && <small>No venues available</small>}
                </div>
              </fieldset>

              <fieldset className='full-width checkbox-fieldset'>
                <legend>Cohorts</legend>
                <div className='checkbox-list'>
                  {eligibleCohorts.map(cohort => {
                    const cohortId = String(cohort.id ?? cohort.name)
                    const selected = Object.prototype.hasOwnProperty.call(
                      form.cohort_allocations,
                      cohortId
                    )
                    return (
                      <div
                        key={cohortId}
                        className='checkbox-option cohort-option'
                      >
                        <label>
                          <input
                            type='checkbox'
                            checked={selected}
                            onChange={event =>
                              setForm(current => {
                                const next = { ...current.cohort_allocations }
                                if (event.target.checked) next[cohortId] = ''
                                else delete next[cohortId]
                                return { ...current, cohort_allocations: next }
                              })
                            }
                          />
                          <span>
                            {cohort.name} (
                            {cohort.student_count ?? cohort.studentCount ?? 0}{' '}
                            students)
                          </span>
                        </label>
                      </div>
                    )
                  })}
                  {!eligibleCohorts.length && (
                    <small>
                      Select an academic year and department with available
                      cohorts.
                    </small>
                  )}
                </div>
              </fieldset>

              <label className='full-width'>
                Instructions
                <textarea
                  value={form.instructions}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      instructions: event.target.value
                    }))
                  }
                  placeholder='Optional instructions for invigilators or students'
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
                  createExamMutation.isPending ||
                  stageExamEditMutation.isPending ||
                  updateStagedExamMutation.isPending
                }
              >
                {createExamMutation.isPending ||
                stageExamEditMutation.isPending ||
                updateStagedExamMutation.isPending
                  ? 'Saving...'
                  : editingExam
                  ? editingExam.pendingDraftId
                    ? 'Save staged exam'
                    : 'Stage exam changes'
                  : 'Stage exam'}
              </button>
              <button
                type='button'
                className='secondary-button'
                onClick={() => setShowForm(false)}
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
            onChange={event => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder='Search exam or unit'
          />
          <select
            value={statusFilter}
            onChange={event => {
              setStatusFilter(event.target.value)
              setPage(1)
            }}
          >
            <option value='all'>All statuses</option>
            <option value='SCHEDULED'>Scheduled</option>
            <option value='CANCELLED'>Cancelled</option>
            <option value='COMPLETED'>Completed</option>
          </select>
          <select
            value={sortBy}
            onChange={event => setSortBy(event.target.value)}
          >
            <option value='date'>Sort by date</option>
            <option value='time'>Sort by time</option>
            <option value='unit'>Sort by unit</option>
            <option value='status'>Sort by status</option>
          </select>
        </div>
      </section>

      <section className='content-panel'>
        {isLoading ? (
          <p>Loading exams...</p>
        ) : error ? (
          <p className='form-error'>Unable to load exams.</p>
        ) : (
          <div className='table-panel exam-table-scroll'>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Unit</th>
                  <th>Cohorts</th>
                  <th>Programmes</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                  <th>Venues</th>
                  {canManageExams && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length ? (
                  visibleRows.map(item => (
                    <tr key={item.id ?? `${item.exam_date}-${item.course_id}`}>
                      <td>{formatExamDate(item.exam_date)}</td>
                      <td>{examDay(item.exam_date)}</td>
                      <td>
                        {item.unitCode ||
                          item.unit_code ||
                          item.course_id ||
                          'Unit'}{' '}
                        - {item.unitName || item.unit_name || ''}
                      </td>
                      <td>
                        {(item.cohortDetails || [])
                          .map(
                            cohort => `${cohort.name} (${cohort.studentCount})`
                          )
                          .join(', ') || 'N/A'}
                      </td>
                      <td
                        className='exam-programmes-cell'
                        title={item.programmes || 'All assigned'}
                      >
                        <span>{item.programmes || 'All assigned'}</span>
                      </td>
                      <td>{item.status || 'SCHEDULED'}</td>
                      <td>{item.start_time || 'TBA'}</td>
                      <td>{item.end_time || 'TBA'}</td>
                      <td>
                        {item.duration_minutes
                          ? `${item.duration_minutes} min`
                          : 'N/A'}
                      </td>
                      <td>
                        {(item.venueDetails || [])
                          .map(venue => `${venue.name} (${venue.capacity})`)
                          .join(', ') || 'N/A'}
                      </td>
                      {canManageExams && (
                        <td>
                          <button
                            type='button'
                            className='table-action'
                            onClick={() => editExam(item)}
                          >
                            Edit exam
                          </button>
                          <button
                            type='button'
                            className='table-action danger'
                            onClick={() => {
                              deleteExamMutation.reset()
                              setExamToDelete(item)
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canManageExams ? 11 : 10}>No exams found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && !error && (
          <PaginationControls
            page={currentPage}
            pageSize={pageSize}
            totalItems={filteredRows.length}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={size => {
              setPageSize(size)
              setPage(1)
            }}
          />
        )}
      </section>

      {capacityWarning && (
        <div className='profile-modal-backdrop'>
          <section className='profile-modal content-panel capacity-warning-modal'>
            <p className='eyebrow'>Capacity warning</p>
            <h2>Review exam allocation</h2>
            <p>
              Selected cohorts contain {capacityWarning.totalStudents} students,
              while venues are allocated for {capacityWarning.allocatedStudents}
              .
            </p>
            {capacityWarning.venueName && (
              <p>
                {capacityWarning.venueName} has capacity for{' '}
                {capacityWarning.venueCapacity}, but{' '}
                {capacityWarning.venueAllocation} has been allocated.
              </p>
            )}
            <p>You can continue anyway or return and adjust the allocations.</p>
            <div className='toolbar-actions'>
              <button
                type='button'
                className='primary-button'
                onClick={() => {
                  const payload = {
                    ...capacityWarning.payload,
                    allow_capacity_override: true
                  }
                  if (editingExam?.pendingDraftId) {
                    updateStagedExamMutation.mutate({
                      id: editingExam.pendingDraftId,
                      payload:
                        editingExam.pendingDraftKind === 'exam_update'
                          ? { ...payload, exam_id: Number(editingExam.examId) }
                          : payload
                    })
                  } else if (editingExam) {
                    stageExamEditMutation.mutate({
                      id: editingExam.id,
                      payload
                    })
                  } else {
                    createExamMutation.mutate(payload)
                  }
                  setCapacityWarning(null)
                }}
                disabled={
                  createExamMutation.isPending ||
                  stageExamEditMutation.isPending ||
                  updateStagedExamMutation.isPending
                }
              >
                Continue anyway
              </button>
              <button
                type='button'
                className='secondary-button'
                onClick={() => setCapacityWarning(null)}
              >
                Adjust allocations
              </button>
            </div>
          </section>
        </div>
      )}
      {examToDelete && (
        <ConfirmActionModal
          title='Delete exam?'
          eyebrow='This will be recorded in Reports'
          message={`Delete ${
            examToDelete.unitCode || examToDelete.unit_code || 'this exam'
          } on ${formatExamDate(
            examToDelete.exam_date
          )}? Its cohort and venue allocations will also be removed.`}
          errorMessage={deleteExamMutation.error?.message || ''}
          isPending={deleteExamMutation.isPending}
          onConfirm={() => deleteExamMutation.mutate(examToDelete.id)}
          onCancel={() => {
            if (!deleteExamMutation.isPending) setExamToDelete(null)
          }}
        />
      )}
    </div>
  )
}

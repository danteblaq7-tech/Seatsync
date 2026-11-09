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

const emptyUnitGroup = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  unit_year_level: '',
  course_id: '',
  cohort_allocations: {},
  venue_allocations: [{ venueId: '', allocatedCapacity: '' }]
})

const emptyExam = {
  academic_year_id: '',
  semester_id: '',
  faculty_ids: [],
  department_ids: [],
  programme_ids: [],
  sitting_group_id: '',
  unit_groups: [emptyUnitGroup()],
  exam_date: '',
  start_time: '09:00',
  end_time: '11:00',
  duration_minutes: 120,
  instructions: ''
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
  const [today, setToday] = useState(todayInputDate)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [examToDelete, setExamToDelete] = useState(null)
  const [selectedRollbackExamIds, setSelectedRollbackExamIds] = useState([])

  useEffect(() => {
    const timer = setInterval(() => setToday(todayInputDate()), 60000)
    return () => clearInterval(timer)
  }, [])

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

  const examVenueLabel = venueDetails => {
    const venueId =
      venueDetails.id ?? venueDetails.venue_id ?? venueDetails.venueId
    const venue = venues.find(item => String(item.id) === String(venueId))
    const code = venueDetails.code ?? venueDetails.venue_code ?? venue?.code
    const name =
      venueDetails.name ??
      venueDetails.venue_name ??
      venue?.name ??
      venue?.venue_name ??
      'Venue'
    return `${code ? `${code} · ` : ''}${name}`
  }

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

  const selectedExamSemester = semesters.find(
    semester => String(semester.id) === String(form.semester_id)
  )

  const unitsForYear = yearLevel => {
    return courses.filter(unit => {
      const matchesYear =
        !yearLevel ||
        String(unit.year_level ?? unit.yearLevel) ===
          String(yearLevel)
      const matchesSemester =
        !form.semester_id ||
        Number(unit.semester_type_id ?? unit.semesterTypeId) ===
          Number(
            selectedExamSemester?.semester_type_id ??
              selectedExamSemester?.semesterTypeId
          )
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
  }

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

  const { data: eligibleCohortsByGroup = {} } = useQuery({
    queryKey: [
      'eligible-cohorts',
      form.academic_year_id,
      form.semester_id,
      form.programme_ids,
      form.unit_groups
    ],
    queryFn: async () => {
      const groups = form.unit_groups.filter(
        group => group.unit_year_level && group.course_id
      )
      const resultEntries = await Promise.all(
        groups.map(async group => {
          const unit = courses.find(
            item => String(item.id) === String(group.course_id)
          )
          const unitProgrammeIds = (
            unit?.programmeIds ||
            unit?.programme_ids ||
            form.programme_ids
          ).map(String)
          const programmeIds = form.programme_ids.filter(id =>
            unitProgrammeIds.includes(String(id))
          )
          const results = await Promise.all(
            programmeIds.map(async programmeId => {
              const params = new URLSearchParams({
                academicYearId: form.academic_year_id,
                semesterId: form.semester_id,
                programmeId,
                studyYear: String(group.unit_year_level)
              })
              return toArray(
                await api.get(`/api/academic/eligible-cohorts?${params}`)
              )
            })
          )
          return [
            group.id,
            Array.from(
              new Map(
                results.flat().map(cohort => [String(cohort.id), cohort])
              ).values()
            )
          ]
        })
      )
      return Object.fromEntries(resultEntries)
    },
    enabled: Boolean(
      form.academic_year_id &&
        form.semester_id &&
        form.programme_ids.length &&
        form.unit_groups.some(group => group.course_id)
    )
  })

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

  const rollbackExamsMutation = useMutation({
    mutationFn: ids =>
      pendingSchedule.rollbackToStaging(
        ids.map(id => ({ kind: 'exam', id }))
      ),
    onSuccess: () => setSelectedRollbackExamIds([])
  })

  const editExam = (exam, pendingDraftId = null, pendingDraftKind = 'exam') => {
    const values = pendingDraftId ? exam.payload : exam
    const sourceGroups =
      Array.isArray(values.unit_groups) && pendingDraftId
        ? values.unit_groups
        : [values]
    const unitGroups = sourceGroups.map((group, index) => {
      const unit = courses.find(
        item =>
          String(item.id) ===
          String(group.course_id ?? group.courseId ?? values.course_id ?? '')
      )
      const cohortRows =
        group.cohort_allocations ||
        (index === 0 ? values.cohort_allocations || exam.cohortDetails : [])
      return {
        id: group.id || `edit-${index}`,
        unit_year_level: String(
          group.study_year ??
            group.unit_year_level ??
            unit?.year_level ??
            unit?.yearLevel ??
            ''
        ),
        course_id: String(
          group.course_id ?? group.courseId ?? values.course_id ?? ''
        ),
        cohort_allocations: Object.fromEntries(
          cohortRows.map(item => [
            String(item.cohortId ?? item.cohort_id ?? item.id),
            String(item.studentCount ?? item.student_count ?? '')
          ])
        ),
        venue_allocations: (
          group.venue_allocations ||
          (index === 0
            ? values.venue_allocations || exam.venueDetails || []
            : [])
        ).map(item => ({
          venueId: String(item.venueId ?? item.venue_id ?? item.id ?? ''),
          allocatedCapacity: String(
            item.allocatedCapacity ??
              item.allocated_capacity ??
              item.capacity ??
              ''
          )
        }))
      }
    })
    const storedProgrammeIds =
      values.programme_ids ??
      values.programmeIds ??
      (Array.isArray(values.unit_groups)
        ? values.unit_groups.flatMap(group => group.programme_ids || [])
        : undefined)
    const cohortProgrammeIds = unitGroups.flatMap(group =>
      Object.keys(group.cohort_allocations)
        .map(cohortId =>
          cohorts.find(item => String(item.id) === String(cohortId))
        )
        .map(cohort => cohort?.programme_id ?? cohort?.programmeId)
        .filter(value => value !== undefined && value !== null)
    )
    const selectedUnits = unitGroups
      .map(group =>
        courses.find(item => String(item.id) === String(group.course_id))
      )
      .filter(Boolean)
    const departmentIds = [
      ...new Set(
        selectedUnits
          .flatMap(unit =>
            unit.departmentIds ||
            unit.department_ids || [unit.department_id ?? unit.departmentId]
          )
          .filter(value => value !== undefined && value !== null)
          .map(String)
      )
    ]
    const programmeIds = storedProgrammeIds
      ? [...new Set(storedProgrammeIds.map(String))]
      : cohortProgrammeIds.length
        ? [...new Set(cohortProgrammeIds.map(String))]
        : [
            ...new Set(
              selectedUnits
                .flatMap(unit => unit.programmeIds || unit.programme_ids || [])
                .map(String)
            )
          ]
    const facultyIds = departments
      .filter(item => departmentIds.includes(String(item.id)))
      .map(item => String(item.faculty_id ?? item.facultyId))
    setForm({
      academic_year_id: String(
        values.academic_year_id ?? values.academicYearId ?? ''
      ),
      semester_id: String(values.semester_id ?? values.semesterId ?? ''),
      faculty_ids: [...new Set(facultyIds)],
      department_ids: departmentIds,
      programme_ids: programmeIds,
      sitting_group_id: values.sitting_group_id ?? values.sittingGroupId ?? '',
      unit_groups: unitGroups.length ? unitGroups : [emptyUnitGroup()],
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
      instructions: values.instructions || ''
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
    const groups = Array.isArray(payload.unit_groups)
      ? payload.unit_groups
      : [payload]
    const groupLabels = groups.map(group => {
      const unit = courses.find(
        item =>
          String(item.id) ===
          String(group.course_id ?? group.courseId ?? '')
      )
      const unitLabel = unit
        ? `${unit.code ? `${unit.code} · ` : ''}${unit.name || ''}`.trim()
        : `Unit ${group.course_id ?? group.courseId ?? '?'}`
      const studyYear =
        group.study_year ??
        group.studyYear ??
        group.unit_year_level ??
        unit?.year_level ??
        unit?.yearLevel
      const cohortNames = (group.cohort_allocations || [])
        .map(allocation => {
          const id = allocation.cohortId ?? allocation.cohort_id
          return (
            cohorts.find(item => String(item.id) === String(id))?.name ||
            allocation.cohortName ||
            `Cohort ${id}`
          )
        })
        .join(', ')
      return `Year ${studyYear ?? '?'} · ${unitLabel}: ${
        cohortNames || 'No cohorts'
      }`
    })
    const venueAllocations = groups.flatMap(
      group => group.venue_allocations || []
    )
    const venueNames = (
      venueAllocations.length
        ? venueAllocations
        : payload.venue_allocations || payload.venue_names || []
    )
      .map(allocation => {
        const id = allocation.venueId ?? allocation.venue_id
        const venue = venues.find(item => String(item.id) === String(id))
        return venue
          ? `${venue.code ? `${venue.code} · ` : ''}${venue.name}`
          : allocation.name ||
              allocation.venueName ||
              allocation.venue_name ||
              (id ? `Venue ${id}` : '')
      })
      .filter(Boolean)
    const uniqueVenueNames = [...new Set(venueNames)]
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
    }${groupLabels.join(' | ')} · ${yearName || 'Year'} / ${
      semesterName || 'Semester'
    } · ${uniqueVenueNames.join(', ') || 'No venues'} · ${examDay(date)}, ${formatExamDate(
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
      return {
        ...current,
        faculty_ids,
        department_ids,
        programme_ids,
        unit_groups: [emptyUnitGroup()]
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
      return {
        ...current,
        department_ids,
        programme_ids,
        unit_groups: [emptyUnitGroup()]
      }
    })
  }

  const toggleProgramme = (programmeId, checked) => {
    setForm(current => {
      const programme_ids = checked
        ? [...new Set([...current.programme_ids, String(programmeId)])]
        : current.programme_ids.filter(id => id !== String(programmeId))
      return {
        ...current,
        programme_ids,
        unit_groups: [emptyUnitGroup()]
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
      !form.unit_groups.length ||
      !form.faculty_ids.length ||
      !form.department_ids.length ||
      !form.programme_ids.length ||
      !form.exam_date
    ) {
      setFormError(
        'Academic year, semester, faculty, department, programme, unit groups, and date are required.'
      )
      return
    }
    if (
      form.unit_groups.some(
        group => !group.unit_year_level || !group.course_id
      )
    ) {
      setFormError('Choose a unit year and unit for every group.')
      return
    }
    if (
      new Set(form.unit_groups.map(group => String(group.course_id))).size !==
      form.unit_groups.length
    ) {
      setFormError('Each unit can only be added once to an exam sitting.')
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

    const unitGroups = form.unit_groups.map(group => {
      const availableCohorts = eligibleCohortsByGroup[group.id] || []
      const cohortAllocations = Object.keys(group.cohort_allocations)
        .map(cohortId => {
          const cohort = availableCohorts.find(
            item => String(item.id) === String(cohortId)
          )
          return {
            cohortId: Number(cohortId),
            studentCount: Number(
              cohort?.student_count ?? cohort?.studentCount ?? 0
            ),
            cohortName: cohort?.name || `Cohort ${cohortId}`
          }
        })
        .filter(allocation => allocation.studentCount > 0)
      const unit = courses.find(
        item => String(item.id) === String(group.course_id)
      )
      const unitProgrammeIds = (
        unit?.programmeIds ||
        unit?.programme_ids ||
        form.programme_ids
      ).map(String)
      return {
        course_id: Number(group.course_id),
        study_year: Number(group.unit_year_level),
        programme_ids: form.programme_ids
          .filter(id => unitProgrammeIds.includes(String(id)))
          .map(Number),
        unit_name: unit?.name || `Unit ${group.course_id}`,
        cohort_allocations: cohortAllocations
      }
    })
    if (unitGroups.some(group => !group.cohort_allocations.length)) {
      setFormError('Select at least one cohort with students for each unit.')
      return
    }
    const allCohortIds = unitGroups.flatMap(group =>
      group.cohort_allocations.map(allocation => allocation.cohortId)
    )
    if (new Set(allCohortIds).size !== allCohortIds.length) {
      setFormError('A cohort can only be assigned to one unit in a sitting.')
      return
    }

    const selectedVenueStudentCounts = new Map()
    for (const group of unitGroups) {
      let groupStudents = group.cohort_allocations.reduce(
        (total, allocation) => total + allocation.studentCount,
        0
      )
      const selectedGroup = form.unit_groups.find(
        item => item.course_id === String(group.course_id)
      )
      if (
        selectedGroup.venue_allocations.some(
          item => !item.venueId && item.allocatedCapacity
        )
      ) {
        setFormError('Choose a venue for each venue allocation.')
        return
      }
      const selectedVenueAllocations = selectedGroup.venue_allocations
        .filter(item => item.venueId)
        .map(item => {
          const venue = venues.find(
            option => String(option.id) === String(item.venueId)
          )
          return {
            venueId: Number(item.venueId),
            allocatedCapacity: Number(
              item.allocatedCapacity || venue?.capacity || 0
            )
          }
        })
      if (!selectedVenueAllocations.length) {
        setFormError(
          `Select at least one venue for ${group.unit_name || 'each unit group'}.`
        )
        return
      }
      if (
        new Set(
          selectedVenueAllocations.map(item => String(item.venueId))
        ).size !== selectedVenueAllocations.length
      ) {
        setFormError('Each venue can only be added once within a unit group.')
        return
      }
      if (
        selectedVenueAllocations.some(allocation => {
          const venue = venues.find(
            item => String(item.id) === String(allocation.venueId)
          )
          return (
            allocation.allocatedCapacity < 1 ||
            allocation.allocatedCapacity > Number(venue?.capacity || 0)
          )
        })
      ) {
        setFormError(
          'A venue allocation is invalid or exceeds that venue’s capacity.'
        )
        return
      }
      group.venue_allocations = []
      for (const venueAllocation of selectedVenueAllocations) {
        const assignedStudents = Math.min(
          groupStudents,
          venueAllocation.allocatedCapacity
        )
        if (assignedStudents > 0) {
          group.venue_allocations.push({
            ...venueAllocation,
            studentCount: assignedStudents
          })
          const key = String(venueAllocation.venueId)
          selectedVenueStudentCounts.set(
            key,
            (selectedVenueStudentCounts.get(key) || 0) + assignedStudents
          )
          groupStudents -= assignedStudents
        }
        if (!groupStudents) break
      }
      if (groupStudents > 0) {
        setFormError(
          'The selected venue allocations do not have enough combined capacity for every unit group.'
        )
        return
      }
    }
    for (const [venueId, studentCount] of selectedVenueStudentCounts) {
      const venue = venues.find(item => String(item.id) === venueId)
      if (studentCount > Number(venue?.capacity || 0)) {
        setFormError(
          `${venue?.name || 'Selected venue'} is assigned ${studentCount} students across unit groups but has capacity for ${venue?.capacity || 0}.`
        )
        return
      }
    }

    const firstGroup = unitGroups[0]
    const commonVenueNames = [
      ...new Map(
        unitGroups
          .flatMap(group => group.venue_allocations)
          .map(allocation => [String(allocation.venueId), allocation])
      ).values()
    ].map(allocation => {
      const venue = venues.find(
        item => String(item.id) === String(allocation.venueId)
      )
      return {
        id: Number(allocation.venueId),
        name: venue?.name || venue?.venue_name || `Venue ${allocation.venueId}`
      }
    })
    const payload = {
      academic_year_id: Number(form.academic_year_id),
      semester_id: Number(form.semester_id),
      course_id: firstGroup.course_id,
      programme_ids: form.programme_ids.map(Number),
      study_year: firstGroup.study_year,
      unit_name: firstGroup.unit_name,
      unit_groups: unitGroups,
      sitting_group_id:
        form.sitting_group_id ||
        (unitGroups.length > 1
          ? globalThis.crypto?.randomUUID?.() ||
            `sitting-${Date.now()}-${Math.random().toString(36).slice(2)}`
          : null),
      cohort_names: unitGroups.flatMap(group =>
        group.cohort_allocations.map(allocation => ({
          id: Number(allocation.cohortId),
          name: allocation.cohortName
        }))
      ),
      venue_names: commonVenueNames,
      exam_date: form.exam_date,
      start_time: form.start_time,
      end_time: form.end_time,
      duration_minutes: Number(form.duration_minutes) || 120,
      instructions: form.instructions
    }

    if (
      editingExam &&
      (!editingExam.pendingDraftId ||
        editingExam.pendingDraftKind === 'exam_update')
    ) {
      const editedGroup = unitGroups[0]
      payload.cohort_allocations = editedGroup.cohort_allocations
      payload.venue_allocations = editedGroup.venue_allocations
      payload.course_id = editedGroup.course_id
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
                      unit_groups: [emptyUnitGroup()],
                      sitting_group_id: ''
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
                      unit_groups: current.unit_groups.map(group => ({
                        ...group,
                        unit_year_level: '',
                        course_id: '',
                        cohort_allocations: {}
                      })),
                      sitting_group_id: ''
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

              <fieldset className='full-width checkbox-fieldset'>
                <legend>Exam schedule</legend>
                <div className='form-grid'>
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
                </div>
              </fieldset>

              <fieldset className='full-width checkbox-fieldset'>
                <legend>Units and cohort groups</legend>
                <p className='muted'>
                  Add one group for each unit. Assign each cohort to the unit
                  it will sit, even when groups are from different years. Set
                  the exam schedule above before assigning venues to each
                  group.
                </p>
                <div className='stack-form'>
                  {form.unit_groups.map((group, groupIndex) => {
                    const groupCohorts =
                      eligibleCohortsByGroup[group.id] || []
                    return (
                      <fieldset
                        key={group.id}
                        className='checkbox-fieldset selection-container'
                      >
                        <legend>Unit group {groupIndex + 1}</legend>
                        <div className='form-grid'>
                          <label>
                            Unit year
                            <select
                              value={group.unit_year_level}
                              disabled={!form.semester_id}
                              onChange={event =>
                                setForm(current => ({
                                  ...current,
                                  unit_groups: current.unit_groups.map(item =>
                                    item.id === group.id
                                      ? {
                                          ...item,
                                          unit_year_level: event.target.value,
                                          course_id: '',
                                          cohort_allocations: {}
                                        }
                                      : item
                                  )
                                }))
                              }
                            >
                              <option value=''>
                                {form.semester_id
                                  ? 'Select year'
                                  : 'Select semester first'}
                              </option>
                              {[1, 2, 3, 4, 5, 6].map(year => (
                                <option key={year} value={year}>
                                  Year {year}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Unit
                            <select
                              value={group.course_id}
                              disabled={
                                !group.unit_year_level ||
                                !form.semester_id ||
                                !form.department_ids.length ||
                                !form.programme_ids.length
                              }
                              onChange={event =>
                                setForm(current => ({
                                  ...current,
                                  unit_groups: current.unit_groups.map(item =>
                                    item.id === group.id
                                      ? {
                                          ...item,
                                          course_id: event.target.value,
                                          cohort_allocations: {}
                                        }
                                      : item
                                  )
                                }))
                              }
                            >
                              <option value=''>
                                {group.unit_year_level &&
                                form.semester_id &&
                                form.department_ids.length &&
                                form.programme_ids.length
                                  ? 'Select unit'
                                  : 'Complete filters first'}
                              </option>
                              {unitsForYear(group.unit_year_level).map(unit => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.code ? `${unit.code} - ` : ''}
                                  {unit.name || 'Unnamed unit'}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className='checkbox-list'>
                          {groupCohorts.map(cohort => {
                            const cohortId = String(cohort.id)
                            const selected =
                              Object.prototype.hasOwnProperty.call(
                                group.cohort_allocations,
                                cohortId
                              )
                            return (
                              <label
                                key={cohortId}
                                className='checkbox-option cohort-option'
                              >
                                <input
                                  type='checkbox'
                                  checked={selected}
                                  onChange={event =>
                                    setForm(current => ({
                                      ...current,
                                      unit_groups: current.unit_groups.map(
                                        item => {
                                          if (item.id !== group.id) return item
                                          const cohort_allocations = {
                                            ...item.cohort_allocations
                                          }
                                          if (event.target.checked) {
                                            cohort_allocations[cohortId] = ''
                                          } else {
                                            delete cohort_allocations[cohortId]
                                          }
                                          return {
                                            ...item,
                                            cohort_allocations
                                          }
                                        }
                                      )
                                    }))
                                  }
                                />
                                <span>
                                  {cohort.name}
                                  {cohort.cohort_type_name
                                    ? ` · ${cohort.cohort_type_name}`
                                    : ''}{' '}
                                  (
                                  {cohort.student_count ??
                                    cohort.studentCount ??
                                    0}{' '}
                                  students)
                                </span>
                              </label>
                            )
                          })}
                          {group.course_id && !groupCohorts.length && (
                            <small>
                              No eligible cohorts are available for this unit
                              year and academic period.
                            </small>
                          )}
                          {!group.course_id && (
                            <small>Select a unit to load eligible cohorts.</small>
                          )}
                        </div>
                        <fieldset className='checkbox-fieldset'>
                          <legend>Venue assignment for this unit</legend>
                          <p className='muted'>
                            Assign this group to a room. To share a room, select
                            the same venue for each group; capacity is checked
                            across all groups using it.
                          </p>
                          <div className='allocation-list'>
                            {group.venue_allocations.map(
                              (allocation, index) => (
                                <div
                                  key={`${group.id}-venue-${index}`}
                                  className='allocation-row'
                                >
                                  <ScrollableSelect
                                    value={allocation.venueId}
                                    required
                                    options={venues.map(venue => ({
                                      value: venue.id,
                                      label: `${venue.code ? `${venue.code} · ` : ''}${
                                        venue.name || venue.venue_name
                                      } (${venue.capacity || 0} seats)`,
                                      searchText:
                                        venue.name || venue.venue_name
                                    }))}
                                    placeholder='Select venue'
                                    ariaLabel={`Select venue for unit group ${groupIndex + 1}`}
                                    onChange={value =>
                                      setForm(current => ({
                                        ...current,
                                        unit_groups: current.unit_groups.map(
                                          item =>
                                            item.id === group.id
                                              ? {
                                                  ...item,
                                                  venue_allocations:
                                                    item.venue_allocations.map(
                                                      (venueItem, venueIndex) =>
                                                        venueIndex === index
                                                          ? {
                                                              ...venueItem,
                                                              venueId: value,
                                                              allocatedCapacity:
                                                                venues.find(
                                                                  venue =>
                                                                    String(
                                                                      venue.id
                                                                    ) ===
                                                                    String(
                                                                      value
                                                                    )
                                                                )?.capacity ||
                                                                ''
                                                            }
                                                          : venueItem
                                                    )
                                                }
                                              : item
                                        )
                                      }))
                                    }
                                  />
                                  {group.venue_allocations.length > 1 && (
                                    <button
                                      type='button'
                                      className='table-action danger'
                                      onClick={() =>
                                        setForm(current => ({
                                          ...current,
                                          unit_groups: current.unit_groups.map(
                                            item =>
                                              item.id === group.id
                                                ? {
                                                    ...item,
                                                    venue_allocations:
                                                      item.venue_allocations.filter(
                                                        (_, venueIndex) =>
                                                          venueIndex !== index
                                                      )
                                                  }
                                                : item
                                          )
                                        }))
                                      }
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              )
                            )}
                            <button
                              type='button'
                              className='secondary-button'
                              onClick={() =>
                                setForm(current => ({
                                  ...current,
                                  unit_groups: current.unit_groups.map(item =>
                                    item.id === group.id
                                      ? {
                                          ...item,
                                          venue_allocations: [
                                            ...item.venue_allocations,
                                            {
                                              venueId: '',
                                              allocatedCapacity: ''
                                            }
                                          ]
                                        }
                                      : item
                                  )
                                }))
                              }
                            >
                              Add venue for this group
                            </button>
                          </div>
                        </fieldset>
                        {form.unit_groups.length > 1 && (
                          <button
                            type='button'
                            className='table-action danger'
                            onClick={() =>
                              setForm(current => ({
                                ...current,
                                unit_groups: current.unit_groups.filter(
                                  item => item.id !== group.id
                                )
                              }))
                            }
                          >
                            Remove unit group
                          </button>
                        )}
                      </fieldset>
                    )
                  })}
                  {(!editingExam ||
                    (editingExam.pendingDraftId &&
                      editingExam.pendingDraftKind === 'exam')) && (
                    <button
                      type='button'
                      className='secondary-button'
                      onClick={() =>
                        setForm(current => ({
                          ...current,
                          unit_groups: [
                            ...current.unit_groups,
                            emptyUnitGroup()
                          ]
                        }))
                      }
                    >
                      Add another unit/year group
                    </button>
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
          {canManageExams && (
            <div className='toolbar-actions'>
              <button
                type='button'
                className='secondary-button'
                onClick={() => {
                  const eligibleIds = visibleRows
                    .filter(
                      item =>
                        (item.status || 'SCHEDULED') === 'SCHEDULED' &&
                        item.exam_date >= today
                    )
                    .map(item => Number(item.id))
                  setSelectedRollbackExamIds(current =>
                    current.length === eligibleIds.length ? [] : eligibleIds
                  )
                }}
              >
                Select visible exams
              </button>
              <button
                type='button'
                className='primary-button'
                disabled={
                  !selectedRollbackExamIds.length ||
                  rollbackExamsMutation.isPending
                }
                onClick={() => {
                  if (
                    window.confirm(
                      `Roll ${selectedRollbackExamIds.length} selected exam(s) back to staging? They will be removed from the published exams list.`
                    )
                  ) {
                    rollbackExamsMutation.mutate(selectedRollbackExamIds)
                  }
                }}
              >
                {rollbackExamsMutation.isPending
                  ? 'Rolling back…'
                  : `Rollback to staging (${selectedRollbackExamIds.length})`}
              </button>
            </div>
          )}
        </div>
      </section>

      {rollbackExamsMutation.error && (
        <div className='schedule-conflict-alert' role='alert'>
          <strong>Could not roll exams back</strong>
          <span>{rollbackExamsMutation.error.message}</span>
        </div>
      )}

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
                  {canManageExams && <th>Select</th>}
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
                    {canManageExams && (
                      <td>
                        {(item.status || 'SCHEDULED') === 'SCHEDULED' &&
                        item.exam_date >= today ? (
                          <input
                            type='checkbox'
                            aria-label={`Select exam ${item.unitCode || item.unit_code || item.course_id}`}
                            checked={selectedRollbackExamIds.includes(
                              Number(item.id)
                            )}
                            onChange={event =>
                              setSelectedRollbackExamIds(current =>
                                event.target.checked
                                  ? [...current, Number(item.id)]
                                  : current.filter(
                                      id => id !== Number(item.id)
                                    )
                              )
                            }
                          />
                        ) : null}
                      </td>
                    )}
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
                      <td>
                        {item.exam_date && item.exam_date < today ? (
                          <span className='status-badge muted'>Ended</span>
                        ) : (
                          item.status || 'SCHEDULED'
                        )}
                      </td>
                      <td>{item.start_time || 'TBA'}</td>
                      <td>{item.end_time || 'TBA'}</td>
                      <td>
                        {item.duration_minutes
                          ? `${item.duration_minutes} min`
                          : 'N/A'}
                      </td>
                      <td>
                        {(item.venueDetails || [])
                          .map(
                            venue =>
                              `${examVenueLabel(venue)} (${venue.capacity})`
                          )
                          .join(', ') || 'N/A'}
                      </td>
                      {canManageExams &&
                        (!item.exam_date || item.exam_date >= today) && (
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
                      {canManageExams &&
                        item.exam_date &&
                        item.exam_date < today && <td />}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canManageExams ? 12 : 10}>No exams found.</td>
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

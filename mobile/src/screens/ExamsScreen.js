import React, { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import useAutoClear from '../hooks/useAutoClear'
import usePendingScheduleDrafts from '../hooks/usePendingScheduleDrafts'
import { formatDateOnly, weekdayFromDateOnly } from '../utils/dateOnly'
import { toArray } from '../utils/data'
import ConfirmActionModal from '../components/ConfirmActionModal'
import DataTable from '../components/DataTable'
import PaginationControls from '../components/PaginationControls'
import Select from '../components/Select'
import Sheet from '../components/Sheet'
import { DateField, TimeField } from '../components/DateTime'
import {
  BoxedField, Checkbox, CheckboxList, ConflictAlert, DangerAction, Eyebrow, Field, Fieldset, FilterRow, FormGrid, H2,
  Muted, P, FormError, PageHeader, Panel, PrimaryButton, Screen, SecondaryButton, Small, StackForm, StagingCard,
  TableAction, TextField, ToolbarActions
} from '../components/ui'

const pad = n => String(n).padStart(2, '0')
const todayInputDate = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const formatExamDate = v => (v ? formatDateOnly(v) : 'TBA')
const examDay = v => (v ? weekdayFromDateOnly(v) : 'TBA')

const emptyExam = {
  academic_year_id: '', semester_id: '', faculty_ids: [], unit_year_level: '', department_ids: [], programme_ids: [],
  course_id: '', exam_date: '', start_time: '09:00', end_time: '11:00', duration_minutes: '120', instructions: '',
  cohort_allocations: {}, venue_allocations: [{ venueId: '', allocatedCapacity: '' }]
}

export default function ExamsScreen () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const pending = usePendingScheduleDrafts()
  const canManage = (user?.roles || []).includes('ADMIN')
  const pendingExamDrafts = pending.drafts.filter(d => ['exam', 'exam_update'].includes(d.kind))
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingExam, setEditingExam] = useState(null)
  const [form, setForm] = useState(emptyExam)
  const [formError, setFormError] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [examToDelete, setExamToDelete] = useState(null)
  useAutoClear(formError, useCallback(() => setFormError(''), []), 10000)

  const q = (key, path) => useQuery({ queryKey: [key], queryFn: async () => toArray(await api.get(path)) })
  const { data = [], isLoading, error, refetch, isRefetching } = q('exams', '/api/exams')
  const { data: courses = [] } = q('exam-course-options', '/api/academic/courses')
  const { data: departments = [] } = q('exam-department-options', '/api/academic/departments')
  const { data: faculties = [] } = q('exam-faculty-options', '/api/academic/faculties')
  const { data: programmes = [] } = q('exam-programme-options', '/api/academic/programmes')
  const { data: cohorts = [] } = q('exam-cohort-options', '/api/academic/cohorts')
  const { data: venues = [] } = q('exam-venue-options', '/api/academic/venues')
  const { data: academicYears = [] } = q('exam-academic-year-options', '/api/academic/academic-years')
  const { data: semesters = [] } = q('exam-semester-options', '/api/academic/semesters')

  const eligibleUnits = useMemo(() => courses.filter(unit => {
    const year = !form.unit_year_level || String(unit.year_level ?? unit.yearLevel) === String(form.unit_year_level)
    const sem = !form.semester_id || String(unit.semester_id ?? unit.semesterId) === String(form.semester_id)
    const dep = !form.department_ids.length ||
      (unit.departmentIds || [unit.department_id ?? unit.departmentId]).some(id => form.department_ids.includes(String(id)))
    const progIds = unit.programmeIds || unit.programme_ids || []
    const prog = !form.programme_ids.length || progIds.some(id => form.programme_ids.includes(String(id)))
    return year && sem && dep && prog
  }), [courses, form.department_ids, form.programme_ids, form.semester_id, form.unit_year_level])

  const eligibleDepartments = useMemo(
    () => departments.filter(d => form.faculty_ids.includes(String(d.faculty_id ?? d.facultyId))),
    [departments, form.faculty_ids])
  const eligibleProgrammes = useMemo(
    () => programmes.filter(p => form.department_ids.includes(String(p.department_id ?? p.departmentId))),
    [form.department_ids, programmes])
  const eligibleSemesters = useMemo(
    () => (form.academic_year_id ? semesters.filter(s => String(s.academic_year_id ?? s.academicYearId) === String(form.academic_year_id)) : []),
    [form.academic_year_id, semesters])
  const eligibleCohorts = useMemo(() => cohorts.filter(c => {
    const year = !form.academic_year_id || String(c.academic_year_id ?? c.academicYearId) === String(form.academic_year_id)
    const prog = programmes.find(p => String(p.id) === String(c.programme_id ?? c.programmeId))
    const dep = !form.department_ids.length ||
      form.department_ids.includes(String(c.department_id ?? c.departmentId ?? prog?.department_id ?? prog?.departmentId))
    const pr = !form.programme_ids.length || form.programme_ids.includes(String(c.programme_id ?? c.programmeId))
    return year && dep && pr
  }), [cohorts, form.academic_year_id, form.department_ids, form.programme_ids, programmes])

  const onDone = () => { setShowForm(false); setEditingExam(null); setForm(emptyExam); setFormError('') }

  const createExam = useMutation({
    mutationFn: payload => pending.stageDraft('exam', payload, user?.id),
    onSuccess: onDone, onError: e => setFormError(e.message || 'Unable to stage exam.')
  })
  const stageEdit = useMutation({
    mutationFn: ({ id, payload }) => pending.stageDraft('exam_update', { ...payload, exam_id: Number(id) }, user?.id),
    onSuccess: onDone, onError: e => setFormError(e.message || 'Unable to stage exam changes.')
  })
  const updateStaged = useMutation({
    mutationFn: ({ id, payload }) => pending.updateDraft(id, payload),
    onSuccess: onDone, onError: e => setFormError(e.message || 'Unable to update draft.')
  })
  const deleteExam = useMutation({
    mutationFn: id => api.del(`/api/exams/${id}`),
    onSuccess: async () => {
      await Promise.all(['exams', 'timetable-exams', 'dashboard-summary', 'audit-logs'].map(k => queryClient.invalidateQueries({ queryKey: [k] })))
      setExamToDelete(null)
    }
  })
  const saving = createExam.isPending || stageEdit.isPending || updateStaged.isPending

  const editExam = (exam, pendingDraftId = null, pendingDraftKind = 'exam') => {
    const values = pendingDraftId ? exam.payload : exam
    const unit = courses.find(i => String(i.id) === String(values.course_id ?? values.courseId))
    const departmentIds = (unit?.departmentIds || unit?.department_ids || [unit?.department_id ?? unit?.departmentId])
      .filter(v => v !== undefined && v !== null).map(String)
    const programmeIds = (unit?.programmeIds || unit?.programme_ids || []).map(String)
    const facultyIds = departments.filter(i => departmentIds.includes(String(i.id))).map(i => String(i.faculty_id ?? i.facultyId))
    const cohortRows = values.cohort_allocations || exam.cohortDetails || []
    const venueRows = values.venue_allocations || exam.venueDetails || []
    const venueAllocations = venueRows.map(i => ({
      venueId: String(i.venueId ?? i.venue_id ?? i.id),
      allocatedCapacity: String(i.allocatedCapacity ?? i.allocated_capacity ?? i.capacity ?? '')
    }))
    setForm({
      academic_year_id: String(values.academic_year_id ?? values.academicYearId ?? ''),
      semester_id: String(values.semester_id ?? values.semesterId ?? ''),
      faculty_ids: [...new Set(facultyIds)],
      unit_year_level: String(unit?.year_level ?? unit?.yearLevel ?? ''),
      department_ids: departmentIds, programme_ids: programmeIds,
      course_id: String(values.course_id ?? values.courseId ?? ''),
      exam_date: String(values.exam_date ?? values.examDate ?? '').slice(0, 10),
      start_time: String(values.start_time ?? values.startTime ?? '09:00').slice(0, 5),
      end_time: String(values.end_time ?? values.endTime ?? '11:00').slice(0, 5),
      duration_minutes: String(values.duration_minutes ?? values.durationMinutes ?? 120),
      instructions: values.instructions || '',
      cohort_allocations: Object.fromEntries(cohortRows.map(i => [String(i.cohortId ?? i.cohort_id ?? i.id), String(i.studentCount ?? i.student_count ?? '')])),
      venue_allocations: venueAllocations.length ? venueAllocations : [{ venueId: '', allocatedCapacity: '' }]
    })
    setEditingExam(pendingDraftId ? { pendingDraftId, pendingDraftKind, examId: values.exam_id ?? values.examId } : exam)
    setFormError('')
    setShowForm(true)
  }

  const stagedDescription = draft => {
    const p = draft.payload || {}
    const unit = courses.find(i => String(i.id) === String(p.course_id ?? p.courseId ?? ''))
    const cohortNames = (p.cohort_allocations || []).map(a => {
      const id = a.cohortId ?? a.cohort_id
      return cohorts.find(i => String(i.id) === String(id))?.name || a.cohortName || `Cohort ${id}`
    }).join(', ')
    const venueNames = (p.venue_allocations || []).map(a => {
      const id = a.venueId ?? a.venue_id
      const v = venues.find(i => String(i.id) === String(id))
      return v ? `${v.code ? `${v.code} · ` : ''}${v.name}` : `Venue ${id}`
    }).join(', ')
    const unitLabel = unit ? `${unit.code ? `${unit.code} · ` : ''}${unit.name || ''}`.trim() : `Unit ${p.course_id ?? p.courseId ?? '?'}`
    const yearName = academicYears.find(i => String(i.id) === String(p.academic_year_id ?? p.academicYearId ?? ''))?.name
    const semName = semesters.find(i => String(i.id) === String(p.semester_id ?? p.semesterId ?? ''))?.name
    const date = p.exam_date ?? p.examDate
    return `${p.exam_id ? `Exam #${p.exam_id} changes · ` : ''}${unitLabel} · ${yearName || 'Year'} / ${semName || 'Semester'} · ${cohortNames || 'No cohorts'} · ${venueNames || 'No venues'} · ${examDay(date)}, ${formatExamDate(date)} (${p.start_time ?? p.startTime}–${p.end_time ?? p.endTime})`
  }

  /* Cascading checkbox handlers: same pruning rules as the web page */
  const cohortIdsFor = programmeIds => new Set(cohorts.filter(c => programmeIds.includes(String(c.programme_id ?? c.programmeId))).map(c => String(c.id)))
  const keepCohorts = (current, programmeIds) => {
    const allowed = cohortIdsFor(programmeIds)
    return Object.fromEntries(Object.entries(current.cohort_allocations).filter(([id]) => allowed.has(id)))
  }
  const unitStillValid = (current, programmeIds) => {
    const unit = courses.find(i => String(i.id) === String(current.course_id))
    return (unit?.programmeIds || unit?.programme_ids || []).map(String).some(id => programmeIds.includes(id))
  }
  const toggleList = (list, id, on) => (on ? [...new Set([...list, String(id)])] : list.filter(v => v !== String(id)))

  const toggleFaculty = (id, on) => setForm(c => {
    const faculty_ids = toggleList(c.faculty_ids, id, on)
    const department_ids = c.department_ids.filter(d => {
      const dep = departments.find(i => String(i.id) === d)
      return dep && faculty_ids.includes(String(dep.faculty_id ?? dep.facultyId))
    })
    const programme_ids = c.programme_ids.filter(p => {
      const prog = programmes.find(i => String(i.id) === p)
      return prog && department_ids.includes(String(prog.department_id ?? prog.departmentId))
    })
    const ok = unitStillValid(c, programme_ids)
    return { ...c, faculty_ids, department_ids, programme_ids, cohort_allocations: keepCohorts(c, programme_ids),
      course_id: ok ? c.course_id : '', unit_year_level: ok ? c.unit_year_level : '' }
  })
  const toggleDepartment = (id, on) => setForm(c => {
    const department_ids = toggleList(c.department_ids, id, on)
    const programme_ids = c.programme_ids.filter(p => {
      const prog = programmes.find(i => String(i.id) === p)
      return prog && department_ids.includes(String(prog.department_id ?? prog.departmentId))
    })
    const ok = unitStillValid(c, programme_ids)
    return { ...c, department_ids, programme_ids, cohort_allocations: keepCohorts(c, programme_ids),
      course_id: ok ? c.course_id : '', unit_year_level: ok ? c.unit_year_level : '' }
  })
  const toggleProgramme = (id, on) => setForm(c => {
    const programme_ids = toggleList(c.programme_ids, id, on)
    const ok = unitStillValid(c, programme_ids)
    return { ...c, programme_ids, cohort_allocations: keepCohorts(c, programme_ids),
      course_id: ok ? c.course_id : '', unit_year_level: ok ? c.unit_year_level : '' }
  })

  const filteredRows = useMemo(() => [...(data || [])].filter(item => {
    const text = `${item.unitCode || item.unit_code || ''} ${item.unitName || item.unit_name || ''} ${item.programmes || ''} ${(item.cohortDetails || []).map(c => c.name).join(' ')} ${(item.venueDetails || []).map(v => v.name).join(' ')} ${item.course_id || item.courseId || ''} ${item.venue_id || item.venueId || ''}`.toLowerCase()
    return text.includes(search.toLowerCase()) && (statusFilter === 'all' || (item.status || 'SCHEDULED') === statusFilter)
  }).sort((a, b) => {
    if (sortBy === 'time') return String(a.start_time || '').localeCompare(String(b.start_time || ''))
    if (sortBy === 'unit') return String(a.unitCode || a.unit_code || '').localeCompare(String(b.unitCode || b.unit_code || ''))
    if (sortBy === 'status') return String(a.status || '').localeCompare(String(b.status || ''))
    return String(a.exam_date || '').localeCompare(String(b.exam_date || ''))
  }), [data, search, sortBy, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const handleSubmit = () => {
    if (!form.academic_year_id || !form.semester_id || !form.course_id || !form.faculty_ids.length ||
        !form.department_ids.length || !form.programme_ids.length || !form.exam_date) {
      return setFormError('Academic year, semester, faculty, department, programme, unit year, unit, and date are required.')
    }
    const today = todayInputDate()
    if (form.exam_date < today) return setFormError('Exam date cannot be in the past.')
    if (form.start_time >= form.end_time) return setFormError('Exam end time must be later than its start time.')
    if (form.exam_date === today && form.start_time <= nowTime()) return setFormError('Exam start time must be later than the current time.')

    const cohortAllocations = Object.keys(form.cohort_allocations).map(cohortId => {
      const c = cohorts.find(i => String(i.id) === String(cohortId))
      return { cohortId, studentCount: Number(c?.student_count ?? c?.studentCount ?? 0), cohortName: c?.name || `Cohort ${cohortId}` }
    }).filter(a => a.studentCount > 0)
    if (!cohortAllocations.length) return setFormError('Select at least one cohort with students.')
    if (new Set(cohortAllocations.map(i => String(i.cohortId))).size !== cohortAllocations.length) return setFormError('Each cohort can only be added once to an exam.')
    const totalStudents = cohortAllocations.reduce((t, a) => t + Number(a.studentCount), 0)

    if (form.venue_allocations.find(a => Number(a.allocatedCapacity) > 0 && !a.venueId)) return setFormError('Select a venue for every allocation with a capacity.')
    const venueAllocations = form.venue_allocations.map(a => ({ ...a }))
      .filter(a => Number(a.allocatedCapacity) > 0 && a.venueId)
      .map(a => ({ ...a, studentCount: Number(a.allocatedCapacity) }))
    if (!venueAllocations.length) return setFormError('Select at least one venue and enter its allocation capacity.')
    if (new Set(venueAllocations.map(i => String(i.venueId))).size !== venueAllocations.length) return setFormError('Each venue can only be added once to an exam.')
    const allocated = venueAllocations.reduce((t, a) => t + a.studentCount, 0)
    if (allocated < totalStudents) return setFormError(`Venue allocations cover ${allocated} students, but the selected cohorts contain ${totalStudents}.`)
    const over = venueAllocations.find(a => Number(a.allocatedCapacity) > Number(venues.find(v => String(v.id) === String(a.venueId))?.capacity || 0))
    if (over) {
      const v = venues.find(i => String(i.id) === String(over.venueId))
      return setFormError(`${v?.name || 'Selected venue'} cannot be allocated more than ${v?.capacity || 0} students.`)
    }

    const payload = {
      academic_year_id: Number(form.academic_year_id), semester_id: Number(form.semester_id), course_id: Number(form.course_id),
      unit_name: courses.find(i => String(i.id) === String(form.course_id))?.name || `Unit ${form.course_id}`,
      cohort_names: cohortAllocations.map(a => ({ id: Number(a.cohortId), name: a.cohortName })),
      venue_names: venueAllocations.map(a => {
        const v = venues.find(i => String(i.id) === String(a.venueId))
        return { id: Number(a.venueId), name: v?.name || v?.venue_name || `Venue ${a.venueId}` }
      }),
      exam_date: form.exam_date, start_time: form.start_time, end_time: form.end_time,
      duration_minutes: Number(form.duration_minutes) || 120, instructions: form.instructions,
      cohort_allocations: cohortAllocations, venue_allocations: venueAllocations
    }
    if (editingExam?.pendingDraftId) {
      updateStaged.mutate({
        id: editingExam.pendingDraftId,
        payload: editingExam.pendingDraftKind === 'exam_update' ? { ...payload, exam_id: Number(editingExam.examId) } : payload
      })
    } else if (editingExam) stageEdit.mutate({ id: editingExam.id, payload })
    else createExam.mutate(payload)
  }

  const setVenueRow = (index, patch) =>
    setForm(c => ({ ...c, venue_allocations: c.venue_allocations.map((it, i) => (i === index ? { ...it, ...patch } : it)) }))

  const columns = [
    { key: 'date', label: 'Date', width: 130, value: i => formatExamDate(i.exam_date) },
    { key: 'day', label: 'Day', width: 70, value: i => examDay(i.exam_date) },
    { key: 'unit', label: 'Unit', width: 220, value: i => `${i.unitCode || i.unit_code || i.course_id || 'Unit'} - ${i.unitName || i.unit_name || ''}` },
    { key: 'cohorts', label: 'Cohorts', width: 200, value: i => (i.cohortDetails || []).map(c => `${c.name} (${c.studentCount})`).join(', ') || 'N/A' },
    { key: 'programmes', label: 'Programmes', width: 200, value: i => i.programmes || 'All assigned' },
    { key: 'status', label: 'Status', width: 110, value: i => i.status || 'SCHEDULED' },
    { key: 'start', label: 'Start', width: 80, value: i => i.start_time || 'TBA' },
    { key: 'end', label: 'End', width: 80, value: i => i.end_time || 'TBA' },
    { key: 'duration', label: 'Duration', width: 100, value: i => (i.duration_minutes ? `${i.duration_minutes} min` : 'N/A') },
    { key: 'venues', label: 'Venues', width: 220, value: i => (i.venueDetails || []).map(v => `${v.name} (${v.capacity})`).join(', ') || 'N/A' },
    ...(canManage ? [{
      key: 'actions', label: 'Actions', width: 190,
      render: item => (
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <TableAction title='Edit exam' onPress={() => editExam(item)} />
          <DangerAction title='Delete' onPress={() => { deleteExam.reset(); setExamToDelete(item) }} />
        </View>
      )
    }] : [])
  ]

  const needsSemester = !form.semester_id
  const unitReady = form.unit_year_level && form.semester_id && form.department_ids.length && form.programme_ids.length
  const filter = setter => v => { setter(v); setPage(1) }

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader eyebrow='Assessment' title='Exams'>
        <ToolbarActions>
          {canManage && pendingExamDrafts.length > 0 && (
            <PrimaryButton
              disabled={pending.isPublishing}
              title={pending.isPublishing ? 'Publishing…' : `Publish ${pendingExamDrafts.length} pending exam${pendingExamDrafts.length === 1 ? '' : 's'}`}
              onPress={() => pending.publishDrafts(pendingExamDrafts).catch(() => {})}
            />
          )}
          {canManage && (
            <PrimaryButton title={showForm ? 'Close form' : 'Add exam'}
              onPress={() => { setShowForm(!showForm); setEditingExam(null); setForm(emptyExam) }} />
          )}
        </ToolbarActions>
      </PageHeader>

      {canManage && pendingExamDrafts.length > 0 && (
        <Panel style={{ gap: 14 }}>
          <View>
            <Eyebrow>Draft schedule</Eyebrow>
            <H2>{pendingExamDrafts.length} staged exam{pendingExamDrafts.length === 1 ? '' : 's'}</H2>
            <P>Review each exam and publish it individually, or publish the full exam batch. Drafts remain private until published.</P>
          </View>
          <View style={{ gap: 10 }}>
            {pendingExamDrafts.map(draft => (
              <StagingCard key={draft.id}
                type={draft.kind === 'exam_update' ? 'Pending exam changes' : 'Staged exam'}
                description={stagedDescription(draft)} note={draft.payload?.instructions}>
                <TableAction title='Edit draft' onPress={() => editExam(draft, draft.id, draft.kind)} />
                <PrimaryButton disabled={pending.isPublishing}
                  title={draft.kind === 'exam_update' ? 'Publish changes' : 'Publish this exam'}
                  onPress={() => pending.publishDrafts([draft]).catch(() => {})} />
                <DangerAction title='Remove' onPress={() => pending.removeDraft(draft.id)} />
              </StagingCard>
            ))}
          </View>
          <ConflictAlert message={pending.publishError} />
          <PrimaryButton disabled={pending.isPublishing}
            title={pending.isPublishing ? 'Publishing batch…' : 'Publish all staged exams'}
            onPress={() => pending.publishDrafts(pendingExamDrafts).catch(() => {})} />
        </Panel>
      )}

      {showForm && canManage && (
        <Sheet visible onClose={() => setShowForm(false)}>
          <View>
            <Eyebrow>{editingExam ? 'Update assessment' : 'New assessment'}</Eyebrow>
            <H2>{editingExam ? 'Edit exam' : 'Stage exam'}</H2>
            {editingExam && !editingExam.pendingDraftId && (
              <Muted style={{ marginTop: 16 }}>Changes will remain pending and will not affect the published exam until an administrator publishes them.</Muted>
            )}
          </View>
          <StackForm>
            <FormGrid>
              <BoxedField label='Academic year'>
                <Select value={String(form.academic_year_id)} emptyLabel='Select year'
                  options={academicYears.map(i => ({ value: String(i.id ?? i.name), label: i.name }))}
                  searchable={false}
                  onChange={v => setForm(c => ({ ...c, academic_year_id: v, semester_id: '', faculty_ids: [], department_ids: [], programme_ids: [], unit_year_level: '', course_id: '', cohort_allocations: {} }))} />
              </BoxedField>
              <BoxedField label='Semester'>
                <Select value={String(form.semester_id)} disabled={!form.academic_year_id}
                  emptyLabel={form.academic_year_id ? 'Select semester' : 'Select academic year first'}
                  options={eligibleSemesters.map(i => ({ value: String(i.id ?? i.name), label: i.name }))} searchable={false}
                  onChange={v => setForm(c => ({ ...c, semester_id: v, course_id: '', unit_year_level: '' }))} />
              </BoxedField>

              <Fieldset legend='Faculties'>
                <CheckboxList>
                  {faculties.map(f => (
                    <Checkbox key={f.id} label={f.name || f.code} disabled={needsSemester}
                      checked={form.faculty_ids.includes(String(f.id))} onChange={on => toggleFaculty(f.id, on)} />
                  ))}
                  {needsSemester && <Small>Select a semester first.</Small>}
                </CheckboxList>
              </Fieldset>
              <Fieldset legend='Departments'>
                <CheckboxList>
                  {eligibleDepartments.map(d => (
                    <Checkbox key={d.id} label={d.name || d.code} disabled={!form.faculty_ids.length}
                      checked={form.department_ids.includes(String(d.id))} onChange={on => toggleDepartment(d.id, on)} />
                  ))}
                  {!form.faculty_ids.length && <Small>Select a faculty first.</Small>}
                </CheckboxList>
              </Fieldset>
              <Fieldset legend='Programmes'>
                <CheckboxList>
                  {eligibleProgrammes.map(p => (
                    <Checkbox key={p.id} label={p.name || p.code}
                      checked={form.programme_ids.includes(String(p.id))} onChange={on => toggleProgramme(p.id, on)} />
                  ))}
                  {!form.department_ids.length && <Small>Select a department first.</Small>}
                </CheckboxList>
              </Fieldset>

              <BoxedField label='Unit year'>
                <Select value={String(form.unit_year_level)} disabled={needsSemester}
                  emptyLabel={form.semester_id ? 'Select year' : 'Select semester first'} searchable={false}
                  options={[1, 2, 3, 4, 5, 6].map(y => ({ value: String(y), label: `Year ${y}` }))}
                  onChange={v => setForm(c => ({ ...c, unit_year_level: v, course_id: '' }))} />
              </BoxedField>
              <BoxedField label='Unit'>
                <Select value={String(form.course_id)} disabled={!unitReady}
                  emptyLabel={unitReady ? 'Select unit' : 'Complete filters first'}
                  options={eligibleUnits.map(u => ({ value: String(u.id ?? u.code), label: `${u.code ? `${u.code} - ` : ''}${u.name || 'Unnamed unit'}` }))}
                  onChange={v => setForm(c => ({ ...c, course_id: v }))} />
              </BoxedField>

              <Field label='Exam date'><DateField value={form.exam_date} onChange={v => setForm(c => ({ ...c, exam_date: v }))} /></Field>
              <Field label='Start time'><TimeField value={form.start_time} onChange={v => setForm(c => ({ ...c, start_time: v }))} /></Field>
              <Field label='End time'><TimeField value={form.end_time} onChange={v => setForm(c => ({ ...c, end_time: v }))} /></Field>
              <Field label='Duration (minutes)'>
                <TextField value={String(form.duration_minutes)} keyboardType='number-pad' onChangeText={v => setForm(c => ({ ...c, duration_minutes: v }))} />
              </Field>

              <Fieldset legend='Venues and allocation capacity'>
                <View style={{ gap: 10 }}>
                  {form.venue_allocations.map((a, index) => (
                    <View key={`venue-allocation-${index}`} style={{ gap: 10 }}>
                      <Select value={String(a.venueId)} variant='scrollable' placeholder='Select venue' title='Select exam venue'
                        searchPlaceholder='Search options'
                        options={(venues || []).map(v => ({ value: String(v.id ?? v.name), label: `${v.code ? `${v.code} · ` : ''}${v.name || v.venue_name} (${v.capacity || 0} seats)`, searchText: v.name || v.venue_name }))}
                        onChange={v => setVenueRow(index, { venueId: v })} />
                      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <TextField style={{ flex: 1 }} placeholder='Allocation' keyboardType='number-pad'
                          value={String(a.allocatedCapacity)} onChangeText={v => setVenueRow(index, { allocatedCapacity: v })} />
                        {form.venue_allocations.length > 1 && (
                          <DangerAction title='Remove' onPress={() => setForm(c => ({ ...c, venue_allocations: c.venue_allocations.filter((_, i) => i !== index) }))} />
                        )}
                      </View>
                    </View>
                  ))}
                  <View style={{ alignSelf: 'flex-start' }}>
                    <SecondaryButton title='Add another venue'
                      onPress={() => setForm(c => ({ ...c, venue_allocations: [...c.venue_allocations, { venueId: '', allocatedCapacity: '' }] }))} />
                  </View>
                  {!venues.length && <Small>No venues available</Small>}
                </View>
              </Fieldset>

              <Fieldset legend='Cohorts'>
                <CheckboxList>
                  {eligibleCohorts.map(c => {
                    const id = String(c.id ?? c.name)
                    return (
                      <Checkbox key={id} label={`${c.name} (${c.student_count ?? c.studentCount ?? 0} students)`}
                        checked={Object.prototype.hasOwnProperty.call(form.cohort_allocations, id)}
                        onChange={on => setForm(cur => {
                          const next = { ...cur.cohort_allocations }
                          if (on) next[id] = ''
                          else delete next[id]
                          return { ...cur, cohort_allocations: next }
                        })} />
                    )
                  })}
                  {!eligibleCohorts.length && <Small>Select an academic year and department with available cohorts.</Small>}
                </CheckboxList>
              </Fieldset>

              <Field label='Instructions'>
                <TextField multiline value={form.instructions} autoCapitalize='sentences'
                  placeholder='Optional instructions for invigilators or students'
                  onChangeText={v => setForm(c => ({ ...c, instructions: v }))} />
              </Field>
            </FormGrid>

            <ConflictAlert message={formError} />
            <ToolbarActions>
              <PrimaryButton disabled={saving}
                title={saving ? 'Saving...' : editingExam ? (editingExam.pendingDraftId ? 'Save staged exam' : 'Stage exam changes') : 'Stage exam'}
                onPress={handleSubmit} />
              <SecondaryButton title='Cancel' onPress={() => setShowForm(false)} />
            </ToolbarActions>
          </StackForm>
        </Sheet>
      )}

      <Panel>
        <FilterRow>
          <TextField value={search} onChangeText={filter(setSearch)} placeholder='Search exam or unit' />
          <Select value={statusFilter} onChange={filter(setStatusFilter)} searchable={false}
            options={[{ value: 'all', label: 'All statuses' }, { value: 'SCHEDULED', label: 'Scheduled' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: 'COMPLETED', label: 'Completed' }]} />
          <Select value={sortBy} onChange={setSortBy} searchable={false}
            options={[{ value: 'date', label: 'Sort by date' }, { value: 'time', label: 'Sort by time' }, { value: 'unit', label: 'Sort by unit' }, { value: 'status', label: 'Sort by status' }]} />
        </FilterRow>
      </Panel>

      <Panel>
        {isLoading ? <P>Loading exams...</P> : error ? <FormError style={{ marginVertical: 16 }}>Unable to load exams.</FormError> : (
          <DataTable columns={columns} rows={visibleRows} rowKey={i => i.id ?? `${i.exam_date}-${i.course_id}`}
            minWidth={1300} emptyText='No exams found.' maxHeight={520} />
        )}
        {!isLoading && !error && (
          <PaginationControls page={currentPage} pageSize={pageSize} totalItems={filteredRows.length} totalPages={totalPages}
            onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1) }} />
        )}
      </Panel>

      {examToDelete && (
        <ConfirmActionModal title='Delete exam?' eyebrow='This will be recorded in Reports'
          message={`Delete ${examToDelete.unitCode || examToDelete.unit_code || 'this exam'} on ${formatExamDate(examToDelete.exam_date)}? Its cohort and venue allocations will also be removed.`}
          errorMessage={deleteExam.error?.message || ''} isPending={deleteExam.isPending}
          onConfirm={() => deleteExam.mutate(examToDelete.id)}
          onCancel={() => { if (!deleteExam.isPending) setExamToDelete(null) }} />
      )}
    </Screen>
  )
}

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { API_URL } from '../config'
import { api } from '../api/client'
import useAutoClear from '../hooks/useAutoClear'
import { toArray } from '../utils/data'
import AcademicRecordsTable from '../components/AcademicRecordsTable'
import ConfirmActionModal from '../components/ConfirmActionModal'
import DataTable from '../components/DataTable'
import Select from '../components/Select'
import Sheet from '../components/Sheet'
import { DateField } from '../components/DateTime'
import { toast } from '../components/Toast'
import {
  BoxedField, DangerAction, Field, FilterRow, FormError, FormGrid, H2, P, PageHeader, Panel, PrimaryButton, Screen,
  SecondaryButton, StackForm, StatCard, StatsGrid, TableAction, TextField, ToolbarActions
} from '../components/ui'

const toInputDate = v => (v ? String(v).slice(0, 10) : '')

const sectionConfig = [
  { key: 'faculty', label: 'Faculty' }, { key: 'department', label: 'Department' }, { key: 'programme', label: 'Programme' },
  { key: 'academicYear', label: 'Academic year' }, { key: 'semester', label: 'Semester' }, { key: 'cohort', label: 'Cohort' }
]
const initialForms = {
  faculty: { name: '', code: '' },
  department: { name: '', code: '', faculty_id: '' },
  programme: { name: '', code: '', department_id: '', duration_years: '4' },
  academicYear: { name: '', start_date: '', end_date: '' },
  semester: { name: '', number: '', academic_year_id: '', start_date: '', end_date: '' },
  cohort: { name: '', programme_id: '', student_count: '', academic_year_id: '' }
}
const recordEndpoints = {
  faculty: '/api/academic/faculties', department: '/api/academic/departments', programme: '/api/academic/programmes',
  academicYear: '/api/academic/academic-years', semester: '/api/academic/semesters', cohort: '/api/academic/cohorts'
}
const queryKeys = ['academic-faculties', 'academic-departments', 'academic-programmes', 'academic-years', 'academic-semesters',
  'academic-cohorts', 'cohorts', 'academic-courses', 'courses', 'exam-course-options']

const payloadBuilders = {
  faculty: f => ({ name: f.name, code: f.code }),
  department: f => ({ name: f.name, code: f.code, faculty_id: Number(f.faculty_id) || null }),
  programme: f => ({ name: f.name, code: f.code, department_id: Number(f.department_id) || null, duration_years: Number(f.duration_years) || 4 }),
  academicYear: f => ({ name: f.name || `${f.start_date || 'YYYY-MM-DD'} - ${f.end_date || 'YYYY-MM-DD'}`, start_date: f.start_date, end_date: f.end_date }),
  semester: f => ({ name: f.name || `Semester ${f.number || 1}`, number: Number(f.number) || 1, academic_year_id: Number(f.academic_year_id) || null, start_date: f.start_date, end_date: f.end_date }),
  cohort: f => ({ name: f.name, programme_id: Number(f.programme_id) || null, academic_year_id: Number(f.academic_year_id) || null, student_count: Number(f.student_count) || 0 })
}

const emptyUnitForm = { code: '', name: '', description: '', department_ids: [], programme_ids: [], semester_id: '', year_level: '1' }

export default function AcademicSetupScreen () {
  const queryClient = useQueryClient()
  const [showBuilder, setShowBuilder] = useState(false)
  const [activeSection, setActiveSection] = useState('faculty')
  const [formError, setFormError] = useState('')
  const [forms, setForms] = useState(initialForms)
  const [unitSearch, setUnitSearch] = useState('')
  const [unitProgrammeFilter, setUnitProgrammeFilter] = useState('all')
  const [unitSort, setUnitSort] = useState('name')
  const [editingRecord, setEditingRecord] = useState(null)
  const [recordToDelete, setRecordToDelete] = useState(null)
  const [unitToEdit, setUnitToEdit] = useState(null)
  const [unitForm, setUnitForm] = useState(emptyUnitForm)
  useAutoClear(formError, useCallback(() => setFormError(''), []))

  const invalidate = () => Promise.all(queryKeys.map(k => queryClient.invalidateQueries({ queryKey: [k] })))

  useEffect(() => {
    const socket = io(API_URL, { transports: ['websocket'] })
    socket.on('academic:updated', ({ entity, id } = {}) => {
      queryKeys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }))
      if (String(entity) === 'unit' || String(entity) === 'academic_unit') toast.info('Academic records updated live.')
      if (id) toast.info(`${entity || 'Academic'} record updated.`)
    })
    socket.on('academic:deleted', ({ entity, id } = {}) => {
      queryKeys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }))
      if (id) toast.info(`${entity || 'Academic'} record deleted.`)
    })
    return () => { socket.disconnect() }
  }, [queryClient])

  const q = (key, path) => useQuery({ queryKey: [key], queryFn: async () => toArray(await api.get(path)) })
  const f1 = q('academic-faculties', '/api/academic/faculties')
  const f2 = q('academic-departments', '/api/academic/departments')
  const f3 = q('academic-programmes', '/api/academic/programmes')
  const f4 = q('academic-years', '/api/academic/academic-years')
  const f5 = q('academic-semesters', '/api/academic/semesters')
  const f6 = q('academic-cohorts', '/api/academic/cohorts')
  const f7 = q('academic-courses', '/api/academic/courses')
  const faculties = f1.data || [], departments = f2.data || [], programmes = f3.data || [], academicYears = f4.data || []
  const semesters = f5.data || [], cohorts = f6.data || [], courses = f7.data || []
  const isLoading = [f1, f2, f3, f4, f5, f6, f7].some(x => x.isLoading)
  const refetchAll = () => Promise.all([f1, f2, f3, f4, f5, f6, f7].map(x => x.refetch()))

  const updateRecord = useMutation({
    mutationFn: ({ entity, id, payload }) => api.put(`${recordEndpoints[entity]}/${id}`, payload),
    onSuccess: async (_, v) => { await invalidate(); setEditingRecord(null); setShowBuilder(false); setForms(initialForms); toast.success(`${v.entity} updated.`) },
    onError: e => toast.error(e.message || 'Unable to update record.')
  })
  const deleteRecord = useMutation({
    mutationFn: ({ entity, id }) => api.del(entity === 'unit' ? `/api/academic/courses/${id}` : `${recordEndpoints[entity]}/${id}`),
    onSuccess: async (_, v) => { await invalidate(); setRecordToDelete(null); toast.success(`${v.entity} deleted.`) },
    onError: e => toast.error(e.message || 'Unable to delete record.')
  })
  const updateUnit = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/api/academic/courses/${id}`, payload),
    onSuccess: async () => { await invalidate(); setUnitToEdit(null); toast.success('Unit updated.') },
    onError: e => toast.error(e.message || 'Unable to update unit.')
  })
  const createRecord = useMutation({
    mutationFn: ({ section, payload }) => api.post(recordEndpoints[section], payload),
    onSuccess: async (_, v) => { await invalidate(); setForms(c => ({ ...c, [v.section]: initialForms[v.section] })); setEditingRecord(null); setFormError(''); toast.success(`${v.section} created.`) },
    onError: e => toast.error(e.message || 'Unable to create record.')
  })

  const openRecordEditor = (entity, r) => {
    const values = {
      faculty: { name: r.name || '', code: r.code || '' },
      department: { name: r.name || '', code: r.code || '', faculty_id: String(r.faculty_id ?? r.facultyId ?? '') },
      programme: { name: r.name || '', code: r.code || '', department_id: String(r.department_id ?? r.departmentId ?? ''), duration_years: String(r.duration_years ?? r.durationYears ?? 4) },
      academicYear: { name: r.name || '', start_date: toInputDate(r.start_date ?? r.startDate), end_date: toInputDate(r.end_date ?? r.endDate) },
      semester: { name: r.name || '', number: String(r.number ?? r.semester_number ?? ''), academic_year_id: String(r.academic_year_id ?? r.academicYearId ?? ''), start_date: toInputDate(r.start_date ?? r.startDate), end_date: toInputDate(r.end_date ?? r.endDate) },
      cohort: { name: r.name || '', programme_id: String(r.programme_id ?? r.programmeId ?? ''), student_count: String(r.student_count ?? r.studentCount ?? ''), academic_year_id: String(r.academic_year_id ?? r.academicYearId ?? '') }
    }
    setEditingRecord({ entity, id: r.id })
    setActiveSection(entity)
    setForms(c => ({ ...c, [entity]: values[entity] }))
    setShowBuilder(true)
    setFormError('')
  }

  const openUnitEditor = unit => {
    setUnitToEdit(unit)
    setUnitForm({
      code: unit.code || '', name: unit.name || '', description: unit.description || '',
      department_ids: (unit.departmentIds || unit.department_ids || []).map(String),
      programme_ids: (unit.programmeIds || unit.programme_ids || []).map(String),
      semester_id: String(unit.semester_id ?? unit.semesterId ?? ''),
      year_level: String(unit.year_level ?? unit.yearLevel ?? 1)
    })
  }

  const programmeUnits = useMemo(() => {
    const rows = courses
      .filter(u => unitProgrammeFilter === 'all' || (u.programmeIds || []).some(id => String(id) === String(unitProgrammeFilter)))
      .filter(u => `${u.code || ''} ${u.name || ''}`.toLowerCase().includes(unitSearch.toLowerCase()))
      .map(u => ({
        ...u,
        programmeName: (u.programmeIds || []).map(id => programmes.find(p => String(p.id) === String(id))?.name).filter(Boolean).join(', ') || 'Unassigned'
      }))
    const val = (u) => String(unitSort === 'code' ? u.code : unitSort === 'year' ? u.year_level ?? u.yearLevel : u.name).toLowerCase()
    return rows.sort((a, b) => val(a).localeCompare(val(b), undefined, { numeric: true }))
  }, [courses, programmes, unitProgrammeFilter, unitSearch, unitSort])

  const duplicateError = (section, payload, currentId = null) => {
    const map = { faculty: faculties, department: departments, programme: programmes, academicYear: academicYears, semester: semesters, cohort: cohorts }
    const rows = map[section] || []
    const compare = field => rows.some(item => {
      if (currentId && Number(item.id) === Number(currentId)) return false
      const value = String(item[field] ?? item[field.replace(/_id$/, 'Id')] ?? '').trim().toLowerCase()
      return value && value === String(payload[field] ?? '').trim().toLowerCase()
    })
    if (section === 'faculty' && (compare('name') || compare('code'))) return 'A faculty with that name or code already exists.'
    if (section === 'department' && (compare('name') || compare('code'))) return 'A department with that name or code already exists.'
    if (section === 'programme' && (compare('name') || compare('code'))) return 'A programme with that name or code already exists.'
    if (section === 'academicYear' && compare('name')) return 'An academic year with that name already exists.'
    if (section === 'semester') {
      const sameYear = Number(payload.academic_year_id || 0)
      const dup = semesters.some(item => {
        if (currentId && Number(item.id) === Number(currentId)) return false
        return Number(item.academic_year_id ?? item.academicYearId ?? 0) === sameYear &&
          (String(item.name ?? '').trim().toLowerCase() === String(payload.name ?? '').trim().toLowerCase() ||
           Number(item.number ?? item.semester_number ?? item.semesterNumber ?? 0) === Number(payload.number || 0))
      })
      if (dup) return 'A semester with that academic year, name, or number already exists.'
    }
    if (section === 'cohort') {
      const dup = cohorts.some(item => {
        if (currentId && Number(item.id) === Number(currentId)) return false
        return Number(item.programme_id ?? item.programmeId ?? 0) === Number(payload.programme_id || 0) &&
          Number(item.academic_year_id ?? item.academicYearId ?? 0) === Number(payload.academic_year_id || 0) &&
          String(item.name ?? '').trim().toLowerCase() === String(payload.name ?? '').trim().toLowerCase()
      })
      if (dup) return 'A cohort with that programme, academic year, and name already exists.'
    }
    return ''
  }

  const handleSubmit = () => {
    const section = activeSection
    const payload = payloadBuilders[section](forms[section])
    const fail = m => toast.error(m)
    if (section === 'faculty' && (!payload.name || !payload.code)) return fail('Faculty name and code are required.')
    if (section === 'department' && (!payload.name || !payload.code || !payload.faculty_id)) return fail('Department name, code, and faculty are required.')
    if (section === 'programme' && (!payload.name || !payload.code || !payload.department_id)) return fail('Programme name, code, and department are required.')
    if (section === 'academicYear' && (!payload.start_date || !payload.end_date || payload.start_date > payload.end_date))
      return fail('Academic year start and end dates are required, and the start must come first.')
    if (section === 'semester' && (!payload.name || !payload.academic_year_id || !payload.start_date || !payload.end_date || payload.start_date > payload.end_date))
      return fail('Semester name, academic year, start date, and end date are required, and the start must come first.')
    if (section === 'cohort' && (!payload.name || !payload.programme_id || !payload.academic_year_id)) return fail('Cohort name, programme, and academic year are required.')
    const dup = duplicateError(section, payload, editingRecord?.id)
    if (dup) { setFormError(dup); return fail(dup) }
    if (editingRecord) updateRecord.mutate({ entity: section, id: editingRecord.id, payload })
    else createRecord.mutate({ section, payload })
  }

  const submitUnit = () => {
    const payload = {
      code: unitForm.code, name: unitForm.name, description: unitForm.description,
      department_ids: unitForm.department_ids.map(Number).filter(Boolean),
      programme_ids: unitForm.programme_ids.map(Number).filter(Boolean),
      semester_id: Number(unitForm.semester_id) || null, year_level: Number(unitForm.year_level) || 1
    }
    if (!payload.code || !payload.name || !payload.semester_id) return toast.error('Unit code, name, and semester are required.')
    const dup = courses.some(item => {
      if (Number(item.id) === Number(unitToEdit.id)) return false
      return String(item.code ?? '').trim().toLowerCase() === payload.code.trim().toLowerCase() ||
             String(item.name ?? '').trim().toLowerCase() === payload.name.trim().toLowerCase()
    })
    if (dup) return toast.error('A unit with that name or code already exists.')
    updateUnit.mutate({ id: unitToEdit.id, payload })
  }

  const setField = (section, field) => value => setForms(c => ({ ...c, [section]: { ...c[section], [field]: value } }))
  const yearOptions = academicYears.map(y => ({ value: String(y.id ?? y.name), label: y.name }))
  const progOptions = programmes.map(p => ({ value: String(p.id ?? p.code), label: p.name || p.code, searchText: `${p.name || ''} ${p.code || ''}` }))
  const nameOf = (list, id, fb = 'Unassigned') => list.find(i => String(i.id) === String(id))?.name || fb

  const renderSection = () => {
    const f = forms[activeSection]
    switch (activeSection) {
      case 'faculty': return (<>
        <Field label='Faculty name'><TextField value={f.name} onChangeText={setField('faculty', 'name')} placeholder='Science' autoCapitalize='words' /></Field>
        <Field label='Faculty code'><TextField value={f.code} onChangeText={setField('faculty', 'code')} placeholder='SCI' autoCapitalize='characters' /></Field>
      </>)
      case 'department': return (<>
        <Field label='Department name'><TextField value={f.name} onChangeText={setField('department', 'name')} placeholder='Computer Science' autoCapitalize='words' /></Field>
        <Field label='Department code'><TextField value={f.code} onChangeText={setField('department', 'code')} placeholder='CS' autoCapitalize='characters' /></Field>
        <BoxedField label='Faculty'>
          <Select value={String(f.faculty_id)} emptyLabel='Select faculty' onChange={setField('department', 'faculty_id')}
            options={faculties.map(x => ({ value: String(x.id ?? x.code), label: x.name || x.code }))} />
        </BoxedField>
      </>)
      case 'programme': return (<>
        <Field label='Programme name'><TextField value={f.name} onChangeText={setField('programme', 'name')} placeholder='B.Sc. Computer Science' autoCapitalize='words' /></Field>
        <Field label='Programme code'><TextField value={f.code} onChangeText={setField('programme', 'code')} placeholder='BCS' autoCapitalize='characters' /></Field>
        <Field label='Department'>
          <Select variant='scrollable' value={String(f.department_id)} placeholder='Select department' searchPlaceholder='Search departments'
            options={departments.map(d => ({ value: String(d.id ?? d.code), label: d.name || d.code, searchText: `${d.name || ''} ${d.code || ''}` }))}
            onChange={setField('programme', 'department_id')} />
        </Field>
        <Field label='Duration (years)'><TextField value={String(f.duration_years)} keyboardType='number-pad' onChangeText={setField('programme', 'duration_years')} /></Field>
      </>)
      case 'academicYear': return (<>
        <Field label='Name'><TextField value={f.name} onChangeText={setField('academicYear', 'name')} placeholder='2025/2026' /></Field>
        <Field label='Start date'><DateField value={f.start_date} onChange={setField('academicYear', 'start_date')} /></Field>
        <Field label='End date'><DateField value={f.end_date} onChange={setField('academicYear', 'end_date')} /></Field>
      </>)
      case 'semester': return (<>
        <Field label='Semester name'><TextField value={f.name} onChangeText={setField('semester', 'name')} placeholder='Semester 1' /></Field>
        <Field label='Semester number'><TextField value={String(f.number)} keyboardType='number-pad' onChangeText={setField('semester', 'number')} /></Field>
        <BoxedField label='Academic year'>
          <Select value={String(f.academic_year_id)} emptyLabel='Select academic year' options={yearOptions} searchable={false} onChange={setField('semester', 'academic_year_id')} />
        </BoxedField>
        <Field label='Start date'><DateField value={f.start_date} onChange={setField('semester', 'start_date')} /></Field>
        <Field label='End date'><DateField value={f.end_date} onChange={setField('semester', 'end_date')} /></Field>
      </>)
      default: return (<>
        <Field label='Cohort name'><TextField value={f.name} onChangeText={setField('cohort', 'name')} placeholder='BCS 3.1' /></Field>
        <Field label='Programme'>
          <Select variant='scrollable' value={String(f.programme_id)} placeholder='Select programme' searchPlaceholder='Search programmes' options={progOptions} onChange={setField('cohort', 'programme_id')} />
        </Field>
        <BoxedField label='Academic year'>
          <Select value={String(f.academic_year_id)} emptyLabel='Select academic year' options={yearOptions} searchable={false} onChange={setField('cohort', 'academic_year_id')} />
        </BoxedField>
        <Field label='Student count'><TextField value={String(f.student_count)} keyboardType='number-pad' onChangeText={setField('cohort', 'student_count')} /></Field>
      </>)
    }
  }

  const unitColumns = [
    { key: 'code', label: 'Unit', width: 110, value: u => u.code || 'N/A' },
    { key: 'name', label: 'Name', width: 200, value: u => u.name || 'Unnamed unit' },
    { key: 'prog', label: 'Programme', width: 220, value: u => u.programmeName },
    { key: 'year', label: 'Year', width: 80, value: u => u.year_level ?? u.yearLevel ?? 'N/A' },
    { key: 'sem', label: 'Semester', width: 140, value: u => semesters.find(s => String(s.id) === String(u.semester_id ?? u.semesterId))?.name || 'Unassigned' },
    {
      key: 'actions', label: 'Actions', width: 170,
      render: unit => (
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <TableAction title='Edit' onPress={() => openUnitEditor(unit)} />
          <DangerAction title='Delete' onPress={() => setRecordToDelete({ entity: 'unit', record: unit })} />
        </View>
      )
    }
  ]

  const stats = [
    ['Faculties', faculties.length], ['Departments', departments.length], ['Programmes', programmes.length], ['Cohorts', cohorts.length]
  ]

  return (
    <Screen onRefresh={refetchAll}>
      <PageHeader eyebrow='Academic structure' title='Academic setup'>
        <ToolbarActions>
          <SecondaryButton title='Export' onPress={() => {}} />
          <PrimaryButton title={showBuilder ? 'Close builder' : 'Add record'} onPress={() => { setShowBuilder(v => !v); setFormError('') }} />
        </ToolbarActions>
      </PageHeader>

      {showBuilder && (
        <Sheet visible onClose={() => setShowBuilder(false)}>
          <ToolbarActions>
            {sectionConfig.map(s => (
              activeSection === s.key
                ? <PrimaryButton key={s.key} title={s.label} onPress={() => setActiveSection(s.key)} />
                : <SecondaryButton key={s.key} title={s.label} onPress={() => setActiveSection(s.key)} />
            ))}
          </ToolbarActions>
          <StackForm>
            <FormGrid>{renderSection()}</FormGrid>
            <FormError>{formError}</FormError>
            <ToolbarActions>
              <PrimaryButton title={createRecord.isPending ? 'Saving...' : 'Save record'} onPress={handleSubmit} disabled={createRecord.isPending} />
              <SecondaryButton title='Cancel' onPress={() => setShowBuilder(false)} />
            </ToolbarActions>
          </StackForm>
        </Sheet>
      )}

      {unitToEdit && (
        <Sheet visible onClose={() => setUnitToEdit(null)}>
          <H2>Edit unit</H2>
          <StackForm>
            <FormGrid>
              <Field label='Unit code'><TextField value={unitForm.code} onChangeText={code => setUnitForm(c => ({ ...c, code }))} autoCapitalize='characters' /></Field>
              <Field label='Unit name'><TextField value={unitForm.name} onChangeText={name => setUnitForm(c => ({ ...c, name }))} autoCapitalize='words' /></Field>
              <BoxedField label='Semester'>
                <Select value={String(unitForm.semester_id)} emptyLabel='Select semester' searchable={false}
                  options={semesters.map(s => ({ value: String(s.id), label: s.name }))} onChange={semester_id => setUnitForm(c => ({ ...c, semester_id }))} />
              </BoxedField>
              <Field label='Year level'><TextField value={String(unitForm.year_level)} keyboardType='number-pad' onChangeText={year_level => setUnitForm(c => ({ ...c, year_level }))} /></Field>
              <Field label='Programmes'>
                <Select multiple variant='scrollable' value={unitForm.programme_ids} placeholder='Select programmes' searchPlaceholder='Search programmes'
                  options={[{ value: 'all', label: 'All programmes' }, ...progOptions]}
                  onChange={programme_ids => setUnitForm(c => ({ ...c, programme_ids }))} />
              </Field>
              <Field label='Departments'>
                <Select multiple variant='scrollable' value={unitForm.department_ids} placeholder='Select departments' searchPlaceholder='Search departments'
                  options={departments.map(d => ({ value: String(d.id), label: d.name || d.code }))}
                  onChange={department_ids => setUnitForm(c => ({ ...c, department_ids }))} />
              </Field>
              <Field label='Description'><TextField multiline value={unitForm.description} autoCapitalize='sentences' onChangeText={description => setUnitForm(c => ({ ...c, description }))} /></Field>
            </FormGrid>
            <ToolbarActions>
              <PrimaryButton title='Save unit' onPress={submitUnit} disabled={updateUnit.isPending} />
              <SecondaryButton title='Cancel' onPress={() => setUnitToEdit(null)} />
            </ToolbarActions>
          </StackForm>
        </Sheet>
      )}

      {isLoading ? (
        <Panel><P>Loading academic setup...</P></Panel>
      ) : (
        <>
          <StatsGrid>{stats.map(([label, value]) => <StatCard key={label} label={label} value={String(value)} />)}</StatsGrid>

          <View style={{ gap: 12 }}>
            <AcademicRecordsTable title='Faculties' records={faculties}
              columns={[{ key: 'name', label: 'Name', width: 180 }, { key: 'code', label: 'Code', width: 110 }]}
              filters={[{ key: 'faculty-code', label: 'faculty codes', value: i => i.code || '', options: faculties.map(i => ({ value: i.code, label: i.code })).filter(i => i.value) }]}
              onEdit={r => openRecordEditor('faculty', r)} onDelete={r => setRecordToDelete({ entity: 'faculty', record: r })} />
            <AcademicRecordsTable title='Departments' records={departments}
              columns={[{ key: 'name', label: 'Name', width: 180 }, { key: 'code', label: 'Code', width: 100 },
                { key: 'faculty', label: 'Faculty', width: 160, value: i => nameOf(faculties, i.faculty_id ?? i.facultyId) }]}
              filters={[{ key: 'faculty', label: 'faculties', value: i => i.faculty_id ?? i.facultyId ?? '', options: faculties.map(i => ({ value: i.id, label: i.name || i.code })) }]}
              onEdit={r => openRecordEditor('department', r)} onDelete={r => setRecordToDelete({ entity: 'department', record: r })} />
            <AcademicRecordsTable title='Programmes' records={programmes}
              columns={[{ key: 'name', label: 'Name', width: 200 }, { key: 'code', label: 'Code', width: 100 },
                { key: 'department', label: 'Department', width: 170, value: i => nameOf(departments, i.department_id ?? i.departmentId),
                  searchValue: i => { const d = departments.find(v => String(v.id) === String(i.department_id ?? i.departmentId)); return `${d?.name || ''} ${d?.code || ''}` } },
                { key: 'duration', label: 'Duration (years)', width: 140, value: i => i.duration_years ?? i.durationYears ?? '—' }]}
              filters={[{ key: 'department', label: 'departments', searchable: true, value: i => i.department_id ?? i.departmentId ?? '',
                options: departments.map(i => ({ value: i.id, label: i.name || i.code, searchText: `${i.name || ''} ${i.code || ''}` })) }]}
              onEdit={r => openRecordEditor('programme', r)} onDelete={r => setRecordToDelete({ entity: 'programme', record: r })} />
            <AcademicRecordsTable title='Academic years' records={academicYears}
              columns={[{ key: 'name', label: 'Name', width: 150 },
                { key: 'start', label: 'Start date', width: 120, value: i => toInputDate(i.start_date ?? i.startDate) },
                { key: 'end', label: 'End date', width: 120, value: i => toInputDate(i.end_date ?? i.endDate) },
                { key: 'status', label: 'Status', width: 100, value: i => (i.is_current || i.isCurrent ? 'Current' : 'Archived') }]}
              filters={[{ key: 'status', label: 'statuses', value: i => (i.is_current || i.isCurrent ? 'current' : 'archived'),
                options: [{ value: 'current', label: 'Current' }, { value: 'archived', label: 'Archived' }] }]}
              onEdit={r => openRecordEditor('academicYear', r)} onDelete={r => setRecordToDelete({ entity: 'academicYear', record: r })} />
            <AcademicRecordsTable title='Semesters' records={semesters}
              columns={[{ key: 'name', label: 'Name', width: 150 },
                { key: 'number', label: 'Number', width: 90, value: i => i.number ?? i.semester_number ?? i.semesterNumber },
                { key: 'academic-year', label: 'Academic year', width: 150, value: i => nameOf(academicYears, i.academic_year_id ?? i.academicYearId) },
                { key: 'dates', label: 'Date range', width: 230, value: i => `${toInputDate(i.start_date ?? i.startDate)} – ${toInputDate(i.end_date ?? i.endDate)}` }]}
              filters={[{ key: 'year', label: 'academic years', value: i => i.academic_year_id ?? i.academicYearId ?? '', options: academicYears.map(i => ({ value: i.id, label: i.name })) }]}
              onEdit={r => openRecordEditor('semester', r)} onDelete={r => setRecordToDelete({ entity: 'semester', record: r })} />
            <AcademicRecordsTable title='Cohorts' records={cohorts}
              columns={[{ key: 'name', label: 'Name', width: 160 },
                { key: 'programme', label: 'Programme', width: 220, value: i => nameOf(programmes, i.programme_id ?? i.programmeId),
                  searchValue: i => { const p = programmes.find(v => String(v.id) === String(i.programme_id ?? i.programmeId)); return `${p?.name || ''} ${p?.code || ''}` } },
                { key: 'year', label: 'Academic year', width: 140, value: i => nameOf(academicYears, i.academic_year_id ?? i.academicYearId) },
                { key: 'students', label: 'Students', width: 100, value: i => i.student_count ?? i.studentCount ?? 0 }]}
              filters={[{ key: 'programme', label: 'programmes', searchable: true, value: i => i.programme_id ?? i.programmeId ?? '',
                options: programmes.map(i => ({ value: i.id, label: i.name || i.code, searchText: `${i.name || ''} ${i.code || ''}` })) }]}
              onEdit={r => openRecordEditor('cohort', r)} onDelete={r => setRecordToDelete({ entity: 'cohort', record: r })} />
          </View>

          <Panel style={{ gap: 14 }}>
            <H2>Programme units</H2>
            <FilterRow>
              <TextField value={unitSearch} onChangeText={setUnitSearch} placeholder='Search units by name or code' />
              <Select value={String(unitProgrammeFilter)} onChange={v => setUnitProgrammeFilter(v || 'all')} placeholder='All programmes' searchPlaceholder='Search programmes'
                emptyLabel='All programmes' options={progOptions} />
              <Select value={unitSort} onChange={setUnitSort} searchable={false}
                options={[{ value: 'name', label: 'Sort by name' }, { value: 'code', label: 'Sort by code' }, { value: 'year', label: 'Sort by year' }]} />
            </FilterRow>
            <DataTable columns={unitColumns} rows={programmeUnits} rowKey={u => u.id ?? u.code} maxHeight={390}
              emptyText='No units match the selected filters.' showsHorizontalScrollIndicator={false} />
          </Panel>
        </>
      )}

      {recordToDelete && (
        <ConfirmActionModal
          title={`Delete ${recordToDelete.entity === 'academicYear' ? 'Academic year' : recordToDelete.entity}`}
          message={`This will permanently remove ${recordToDelete.record.name || recordToDelete.record.code || 'this record'}. This action is audited.`}
          confirmLabel='Delete record'
          isPending={deleteRecord.isPending}
          onCancel={() => setRecordToDelete(null)}
          onConfirm={() => deleteRecord.mutate({ entity: recordToDelete.entity, id: recordToDelete.record.id })}
        />
      )}
    </Screen>
  )
}

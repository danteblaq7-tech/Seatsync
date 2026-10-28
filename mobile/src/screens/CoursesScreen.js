import React, { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import useAutoClear from '../hooks/useAutoClear'
import { qs, toArray } from '../utils/data'
import ConfirmActionModal from '../components/ConfirmActionModal'
import DataTable from '../components/DataTable'
import PaginationControls from '../components/PaginationControls'
import Select from '../components/Select'
import Sheet from '../components/Sheet'
import {
  BoxedField, Checkbox, CheckboxList, DangerAction, Eyebrow, Field, Fieldset, FilterRow, FormError,
  FormGrid, H2, P, PageHeader, Panel, PrimaryButton, Screen, SecondaryButton, Small, StackForm,
  TableAction, TextField, ToolbarActions
} from '../components/ui'
import { colors, radius, type } from '../theme'
import { Text } from '../components/Typography'

const emptyUnit = { code: '', name: '', department_ids: [], programme_ids: [], semester_id: '', year_level: 1, description: '' }

const toggleDepartment = (current, departmentId, checked, programmes) => {
  const id = String(departmentId)
  const departmentIds = checked
    ? Array.from(new Set([...current.department_ids, id]))
    : current.department_ids.filter(v => v !== id)
  const allowed = new Set(departmentIds)
  const programmeIds = current.programme_ids.filter(pid => {
    const p = programmes.find(i => String(i.id) === String(pid))
    return p && allowed.has(String(p.department_id ?? p.departmentId))
  })
  return { ...current, department_ids: departmentIds, programme_ids: programmeIds, semester_id: '', year_level: 1 }
}

const toggleProgramme = (current, programmeId, checked) => ({
  ...current,
  programme_ids: checked
    ? Array.from(new Set([...current.programme_ids, String(programmeId)]))
    : current.programme_ids.filter(id => id !== String(programmeId)),
  semester_id: checked ? current.semester_id : '',
  year_level: checked ? current.year_level : 1
})

const yearOptions = [1, 2, 3, 4, 5, 6].map(y => ({ value: String(y), label: `Year ${y}` }))
const match = (item, needle) => `${item.name || ''} ${item.code || ''}`.toLowerCase().includes(needle.trim().toLowerCase())

export default function CoursesScreen () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManage = (user?.roles || []).includes('ADMIN')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyUnit)
  const [formError, setFormError] = useState('')
  const [deptSearch, setDeptSearch] = useState('')
  const [progSearch, setProgSearch] = useState('')
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [programmeFilter, setProgrammeFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [editingUnit, setEditingUnit] = useState(null)
  const [editForm, setEditForm] = useState(emptyUnit)
  const [unitToDelete, setUnitToDelete] = useState(null)
  useAutoClear(formError, useCallback(() => setFormError(''), []))

  const { data: coursePage = { items: [], pagination: {} }, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['courses', search, departmentFilter, programmeFilter, yearFilter, sortBy, sortDirection, page, pageSize],
    queryFn: async () => {
      const response = await api.get(
        `/api/academic/courses?${qs({
          search,
          department: departmentFilter === 'all' ? '' : departmentFilter,
          programme: programmeFilter === 'all' ? '' : programmeFilter,
          year: yearFilter === 'all' ? '' : yearFilter,
          sort: sortBy, direction: sortDirection, page, limit: pageSize
        })}`
      )
      return { items: toArray(response), pagination: response?.pagination || {} }
    }
  })
  const data = coursePage.items
  const pagination = coursePage.pagination

  const { data: departments = [] } = useQuery({ queryKey: ['course-departments'], queryFn: async () => toArray(await api.get('/api/academic/departments')) })
  const { data: programmes = [] } = useQuery({ queryKey: ['unit-programmes'], queryFn: async () => toArray(await api.get('/api/academic/programmes')) })
  const { data: semesters = [] } = useQuery({ queryKey: ['unit-semesters'], queryFn: async () => toArray(await api.get('/api/academic/semesters')) })

  const departmentNameMap = Object.fromEntries(departments.map(d => [String(d.id), d.name || d.code]))
  const programmeNameMap = Object.fromEntries(programmes.map(p => [String(p.id), p.name || p.code]))

  const getUnitDepartmentNames = unit => {
    const direct = unit.departmentIds ?? unit.department_ids ?? [unit.department_id ?? unit.departmentId].filter(Boolean)
    const unitProgrammes = unit.programmeIds ?? unit.programme_ids ?? []
    const ids = [
      ...(Array.isArray(direct) ? direct : []),
      ...(Array.isArray(unitProgrammes) ? unitProgrammes : []).map(pid => {
        const p = programmes.find(i => String(i.id) === String(pid))
        return p?.department_id ?? p?.departmentId
      })
    ]
    const names = [...new Set(ids.filter(Boolean).map(String))].map(id => departmentNameMap[id]).filter(Boolean)
    return names.length ? names.join(', ') : 'General'
  }

  const invalidate = keys => Promise.all(keys.map(k => queryClient.invalidateQueries({ queryKey: [k] })))

  const createMutation = useMutation({
    mutationFn: async payload => {
      const r = await api.post('/api/academic/courses', payload)
      return r?.data ?? r
    },
    onSuccess: async () => {
      await invalidate(['courses', 'academic-courses', 'unit-programmes', 'exam-course-options'])
      setForm(emptyUnit); setDeptSearch(''); setProgSearch(''); setFormError('')
    },
    onError: err => setFormError(err.message || 'Unable to create course.')
  })
  const deleteMutation = useMutation({
    mutationFn: async id => { await api.del(`/api/academic/courses/${id}`) },
    onSuccess: () => invalidate(['courses', 'academic-courses', 'unit-programmes', 'exam-course-options', 'dashboard-summary'])
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/api/academic/courses/${id}`, payload),
    onSuccess: async () => {
      await invalidate(['courses', 'academic-courses', 'unit-programmes', 'exam-course-options', 'timetable', 'dashboard-summary'])
      setEditingUnit(null); setFormError('')
    },
    onError: err => setFormError(err.message || 'Unable to update unit.')
  })

  const submitCreate = () => {
    if (!form.code || !form.name || !form.department_ids.length || !form.programme_ids.length || !form.semester_id || !form.year_level) {
      setFormError('Unit code, name, department, programme, semester, and year are required.')
      return
    }
    createMutation.mutate({
      ...form,
      department_ids: form.department_ids.map(Number),
      programme_ids: form.programme_ids.map(Number),
      semester_id: Number(form.semester_id) || null,
      year_level: Number(form.year_level) || 1,
      is_active: true
    })
  }

  const submitEdit = () => {
    const selected = new Set(editForm.department_ids.map(String))
    const valid = editForm.programme_ids.filter(pid => {
      const p = programmes.find(i => String(i.id) === String(pid))
      return p && selected.has(String(p.department_id ?? p.departmentId))
    })
    if (!editForm.code || !editForm.name || !editForm.department_ids.length || !editForm.programme_ids.length || !editForm.semester_id) {
      setFormError('Unit code, name, at least one department, at least one programme, and semester are required.')
      return
    }
    if (valid.length !== editForm.programme_ids.length) {
      setFormError('Every selected programme must belong to a selected department. Review the grouped programme selections.')
      return
    }
    updateMutation.mutate({
      id: editingUnit.id,
      payload: {
        ...editForm,
        department_ids: editForm.department_ids.map(Number),
        programme_ids: editForm.programme_ids.map(Number),
        semester_id: Number(editForm.semester_id),
        year_level: Number(editForm.year_level) || 1
      }
    })
  }

  const filter = setter => value => { setter(value); setPage(1) }
  const semesterOptions = semesters.map(s => ({ value: String(s.id), label: s.name }))
  const deptOptions = departments.map(d => ({ value: String(d.id), label: d.name || d.code, searchText: `${d.name || ''} ${d.code || ''}` }))
  const progOptions = programmes.map(p => ({ value: String(p.id), label: p.name || p.code, searchText: `${p.name || ''} ${p.code || ''}` }))

  const columns = [
    { key: 'code', label: 'Code', width: 110, value: i => i.code || 'N/A' },
    { key: 'name', label: 'Name', width: 200, value: i => i.name || i.course_name || 'Unnamed unit' },
    { key: 'dept', label: 'Department', width: 190, value: getUnitDepartmentNames },
    { key: 'prog', label: 'Programme', width: 220, value: i => (i.programmeIds || []).map(id => programmeNameMap[String(id)]).filter(Boolean).join(', ') || 'Unassigned' },
    { key: 'year', label: 'Year', width: 80, value: i => i.year_level ?? i.yearLevel ?? 'N/A' },
    { key: 'status', label: 'Status', width: 100, value: i => ((i.is_active ?? i.isActive) ? 'Active' : 'Inactive') },
    ...(canManage ? [{
      key: 'actions', label: 'Actions', width: 190,
      render: item => (
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <TableAction title='Edit' onPress={() => {
            setEditingUnit(item)
            setEditForm({
              ...emptyUnit,
              code: item.code || '', name: item.name || '', description: item.description || '',
              department_ids: (item.departmentIds?.length ? item.departmentIds : [item.department_id ?? item.departmentId].filter(Boolean)).map(String),
              programme_ids: (item.programmeIds?.length ? item.programmeIds : [item.programme_id ?? item.programmeId].filter(Boolean)).map(String),
              semester_id: String(item.semester_id ?? item.semesterId ?? ''),
              year_level: item.year_level ?? item.yearLevel ?? 1
            })
          }} />
          <DangerAction title='Delete' disabled={deleteMutation.isPending} onPress={() => setUnitToDelete(item)} />
        </View>
      )
    }] : [])
  ]

  const filteredDepts = departments.filter(d => match(d, deptSearch))
  const filteredProgs = programmes
    .filter(p => form.department_ids.includes(String(p.department_id ?? p.departmentId)))
    .filter(p => match(p, progSearch))

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader eyebrow='Academic catalog' title='Units'>
        <ToolbarActions>
          {canManage && <PrimaryButton title={showForm ? 'Close form' : 'Add unit'} onPress={() => setShowForm(v => !v)} />}
        </ToolbarActions>
      </PageHeader>

      {showForm && canManage && (
        <Panel>
          <StackForm>
            <FormGrid>
              <Fieldset legend='Departments'>
                <TextField value={deptSearch} onChangeText={setDeptSearch} placeholder='Search departments' />
                <CheckboxList>
                  {filteredDepts.map(d => (
                    <Checkbox key={d.id ?? d.code} label={d.name || d.code}
                      checked={form.department_ids.includes(String(d.id ?? d.code))}
                      onChange={c => setForm(cur => toggleDepartment(cur, d.id ?? d.code, c, programmes))} />
                  ))}
                  {!filteredDepts.length && <Small>No departments match your search.</Small>}
                </CheckboxList>
              </Fieldset>
              <Fieldset legend='Programmes'>
                <TextField value={progSearch} onChangeText={setProgSearch} placeholder='Search programmes by name or code' editable={!!form.department_ids.length} />
                <CheckboxList>
                  {filteredProgs.map(p => (
                    <Checkbox key={p.id} label={p.name || p.code} checked={form.programme_ids.includes(String(p.id))}
                      onChange={c => setForm(cur => toggleProgramme(cur, p.id, c))} />
                  ))}
                  {!form.department_ids.length && <Small>Select one or more departments first.</Small>}
                  {form.department_ids.length > 0 && !filteredProgs.length && <Small>No programmes match your search.</Small>}
                </CheckboxList>
              </Fieldset>
              <BoxedField label='Semester offered'>
                <Select value={String(form.semester_id)} disabled={!form.programme_ids.length}
                  onChange={semester_id => setForm(c => ({ ...c, semester_id }))}
                  emptyLabel={form.programme_ids.length ? 'Select semester' : 'Select programme first'}
                  options={semesterOptions} searchable={false} />
              </BoxedField>
              <BoxedField label='Year offered'>
                <Select value={String(form.year_level)} disabled={!form.semester_id}
                  onChange={year_level => setForm(c => ({ ...c, year_level }))} options={yearOptions} searchable={false} />
              </BoxedField>
              <Field label='Unit code'><TextField value={form.code} onChangeText={code => setForm(c => ({ ...c, code }))} placeholder='CS201' autoCapitalize='characters' /></Field>
              <Field label='Unit name'><TextField value={form.name} onChangeText={name => setForm(c => ({ ...c, name }))} placeholder='Intro to Programming' autoCapitalize='words' /></Field>
              <Field label='Description'>
                <TextField multiline value={form.description} onChangeText={description => setForm(c => ({ ...c, description }))} placeholder='Optional description' autoCapitalize='sentences' />
              </Field>
            </FormGrid>
            <FormError>{formError}</FormError>
            <ToolbarActions>
              <PrimaryButton title={createMutation.isPending ? 'Saving...' : 'Save unit'} onPress={submitCreate} disabled={createMutation.isPending} />
              <SecondaryButton title='Cancel' onPress={() => setShowForm(false)} />
            </ToolbarActions>
          </StackForm>
        </Panel>
      )}

      <Panel>
        <FilterRow style={{ marginBottom: 16 }}>
          <TextField value={search} onChangeText={filter(setSearch)} placeholder='Search units by code or name' />
          <Select value={String(departmentFilter)} onChange={filter(setDepartmentFilter)} options={[{ value: 'all', label: 'All departments' }, ...deptOptions]} searchPlaceholder='Search departments' />
          <Select value={String(programmeFilter)} onChange={filter(setProgrammeFilter)} options={[{ value: 'all', label: 'All programmes' }, ...progOptions]} searchPlaceholder='Search programmes' />
          <Select value={String(yearFilter)} onChange={filter(setYearFilter)} searchable={false} options={[{ value: 'all', label: 'All years' }, ...yearOptions]} />
          <Select value={sortBy} onChange={filter(setSortBy)} searchable={false}
            options={[{ value: 'name', label: 'Sort by name' }, { value: 'code', label: 'Sort by code' }, { value: 'year', label: 'Sort by year' }]} />
          <SecondaryButton title={sortDirection === 'asc' ? 'Ascending' : 'Descending'} onPress={() => { setSortDirection(v => (v === 'asc' ? 'desc' : 'asc')); setPage(1) }} />
        </FilterRow>
        {isLoading ? <P>Loading units...</P> : error ? <FormError style={{ marginVertical: 16 }}>Unable to load units.</FormError> : (
          <DataTable columns={columns} rows={data} rowKey={i => i.id ?? i.code} emptyText='No unit records found.' maxHeight={390} showsHorizontalScrollIndicator={false} />
        )}
        <PaginationControls page={pagination.page || page} pageSize={pagination.limit || pageSize}
          totalItems={pagination.totalItems || 0} totalPages={pagination.totalPages || 1}
          onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1) }} />
      </Panel>

      {unitToDelete && canManage && (
        <ConfirmActionModal title='Delete unit?'
          message={`Delete ${unitToDelete.code || unitToDelete.name}? This record may be referenced by schedules or exams.`}
          isPending={deleteMutation.isPending} onCancel={() => setUnitToDelete(null)}
          onConfirm={() => deleteMutation.mutate(unitToDelete.id, { onSuccess: () => setUnitToDelete(null) })} />
      )}

      {editingUnit && canManage && (
        <Sheet visible onClose={() => setEditingUnit(null)}>
          <View style={{ gap: 12 }}>
            <View><Eyebrow>Unit details</Eyebrow><H2>Edit unit</H2></View>
            <View style={{ alignSelf: 'flex-start' }}><SecondaryButton title='Close' onPress={() => setEditingUnit(null)} /></View>
          </View>
          <StackForm>
            <FormGrid>
              <Field label='Unit code'><TextField value={editForm.code} onChangeText={code => setEditForm(c => ({ ...c, code }))} autoCapitalize='characters' /></Field>
              <Field label='Unit name'><TextField value={editForm.name} onChangeText={name => setEditForm(c => ({ ...c, name }))} autoCapitalize='words' /></Field>
              <Fieldset legend='Departments'>
                <CheckboxList>
                  {departments.map(d => (
                    <Checkbox key={d.id} label={d.name || d.code} checked={editForm.department_ids.includes(String(d.id))}
                      onChange={c => setEditForm(cur => toggleDepartment(cur, d.id, c, programmes))} />
                  ))}
                </CheckboxList>
                <Small>Removing a department also removes its programmes from this unit when saved.</Small>
              </Fieldset>
              <Fieldset legend='Programmes by selected department'>
                <CheckboxList maxHeight={260}>
                  {editForm.department_ids.length ? editForm.department_ids.map(depId => {
                    const dep = departments.find(i => String(i.id) === depId)
                    const list = programmes.filter(i => String(i.department_id ?? i.departmentId) === depId)
                    return (
                      <View key={depId} style={{ gap: 8, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radius.input }}>
                        <Text style={[type.body, { fontWeight: '700' }]}>{dep?.name || dep?.code || 'Department'}</Text>
                        {list.length ? list.map(p => (
                          <Checkbox key={p.id} style={{ paddingLeft: 10 }} label={p.name || p.code}
                            checked={editForm.programme_ids.includes(String(p.id))}
                            onChange={c => setEditForm(cur => toggleProgramme(cur, p.id, c))} />
                        )) : <Small>No programmes belong to this department.</Small>}
                      </View>
                    )
                  }) : <Small>Select at least one department first.</Small>}
                </CheckboxList>
              </Fieldset>
              <Field label='Semester'>
                <Select value={String(editForm.semester_id)} onChange={semester_id => setEditForm(c => ({ ...c, semester_id }))} emptyLabel='Select semester' options={semesterOptions} searchable={false} />
              </Field>
              <Field label='Year offered'>
                <Select value={String(editForm.year_level)} onChange={year_level => setEditForm(c => ({ ...c, year_level }))} options={yearOptions} searchable={false} />
              </Field>
              <Field label='Description'>
                <TextField multiline value={editForm.description} onChangeText={description => setEditForm(c => ({ ...c, description }))} autoCapitalize='sentences' />
              </Field>
            </FormGrid>
            <FormError>{formError}</FormError>
            <ToolbarActions>
              <PrimaryButton title={updateMutation.isPending ? 'Saving...' : 'Save changes'} onPress={submitEdit} disabled={updateMutation.isPending} />
              <SecondaryButton title='Cancel' onPress={() => setEditingUnit(null)} />
            </ToolbarActions>
          </StackForm>
        </Sheet>
      )}
    </Screen>
  )
}

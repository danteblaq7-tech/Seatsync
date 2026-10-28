import React, { useMemo, useState } from 'react'
import { View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { colors, radius, type } from '../theme'
import { asStrings, toArray } from '../utils/data'
import { Text } from '../components/Typography'
import { toggleDepartment, toggleFaculty, toggleProgramme, toggleUnit } from '../utils/academicCascade'
import ConfirmActionModal from '../components/ConfirmActionModal'
import DataTable from '../components/DataTable'
import PaginationControls from '../components/PaginationControls'
import Select from '../components/Select'
import Sheet from '../components/Sheet'
import {
  Checkbox,
  CheckboxList,
  DangerAction,
  Eyebrow,
  Field,
  Fieldset,
  FilterRow,
  FormError,
  H2,
  Muted,
  P,
  PageHeader,
  Panel,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Small,
  StackForm,
  TableAction,
  TextField,
  ToolbarActions
} from '../components/ui'

const emptyAcademicInfo = { title: '', facultyIds: [], departmentIds: [], programmeIds: [], unitIds: [] }

export default function LecturersScreen () {
  const queryClient = useQueryClient()
  const [lecturerToDelete, setLecturerToDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [editingLecturer, setEditingLecturer] = useState(null)
  const [academicInfo, setAcademicInfo] = useState(emptyAcademicInfo)
  const [editError, setEditError] = useState('')

  const { data = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['lecturers'],
    queryFn: async () => toArray(await api.get('/api/academic/lecturers'))
  })
  const { data: departments = [] } = useQuery({
    queryKey: ['lecturer-departments'],
    queryFn: async () => toArray(await api.get('/api/academic/departments'))
  })
  const { data: optionsResponse, isLoading: optionsLoading } = useQuery({
    queryKey: ['lecturer-academic-edit-options'],
    queryFn: () => api.get('/api/auth/registration-options')
  })
  const options = optionsResponse?.data || {}
  const faculties = Array.isArray(options.faculties) ? options.faculties : []
  const programmes = Array.isArray(options.programmes) ? options.programmes : []
  const units = Array.isArray(options.units) ? options.units : []
  const cascadeData = { departments, programmes, units }

  const departmentNameMap = Object.fromEntries((departments || []).map(d => [String(d.id), d.name || d.code]))

  const statusOf = i => i.employment_status || i.employmentStatus || i.status || 'ACTIVE'

  const visibleLecturers = useMemo(() => {
    const keyOf = (i, by) =>
      String(by === 'status' ? i.employment_status || i.status || '' : by === 'email' ? i.email || '' : i.name || '').toLowerCase()
    return [...data]
      .filter(item => {
        const name = item.name || `${item.first_name || ''} ${item.last_name || ''}`
        const text = `${name} ${item.email || ''} ${item.phoneNumber || item.phone_number || ''} ${item.staff_number || ''}`.toLowerCase()
        return text.includes(search.toLowerCase()) && (statusFilter === 'all' || statusOf(item) === statusFilter)
      })
      .sort((a, b) => keyOf(a, sortBy).localeCompare(keyOf(b, sortBy)))
  }, [data, search, sortBy, statusFilter])

  const totalPages = Math.max(1, Math.ceil(visibleLecturers.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginated = visibleLecturers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const availableDepartments = departments.filter(i => academicInfo.facultyIds.includes(String(i.faculty_id ?? i.facultyId)))
  const availableProgrammes = programmes.filter(i => academicInfo.departmentIds.includes(String(i.department_id ?? i.departmentId)))
  const availableUnits = units.filter(u =>
    (u.programmeIds || u.programme_ids || []).some(id => academicInfo.programmeIds.includes(String(id)))
  )

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/api/academic/lecturers/${id}/academic-details`, payload),
    onSuccess: async () => {
      await Promise.all(['lecturers', 'timetable', 'courses'].map(k => queryClient.invalidateQueries({ queryKey: [k] })))
      setEditingLecturer(null)
      setEditError('')
    },
    onError: err => setEditError(err.message || 'Unable to update lecturer academic information.')
  })

  const deleteMutation = useMutation({
    mutationFn: async id => {
      await api.del(`/api/academic/lecturers/${id}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lecturers'] })
  })

  const openEditor = async lecturer => {
    setEditError('')
    setEditingLecturer(lecturer)
    setAcademicInfo(emptyAcademicInfo)
    try {
      const response = await api.get(`/api/academic/lecturers/${lecturer.id}/academic-details`)
      const profile = response?.data || {}
      setAcademicInfo({
        title: profile.title || '',
        facultyIds: asStrings(profile.facultyIds),
        departmentIds: asStrings(profile.departmentIds),
        programmeIds: asStrings(profile.programmeIds),
        unitIds: asStrings(profile.unitIds)
      })
    } catch (err) {
      setEditError(err.message || 'Unable to load lecturer academic information.')
    }
  }

  const submit = () => {
    setEditError('')
    if (!academicInfo.facultyIds.length || !academicInfo.departmentIds.length || !academicInfo.programmeIds.length || !academicInfo.unitIds.length) {
      setEditError('Select at least one faculty, department, programme, and unit.')
      return
    }
    updateMutation.mutate({
      id: editingLecturer.id,
      payload: {
        ...academicInfo,
        facultyIds: academicInfo.facultyIds.map(Number),
        departmentIds: academicInfo.departmentIds.map(Number),
        programmeIds: academicInfo.programmeIds.map(Number),
        unitIds: academicInfo.unitIds.map(Number)
      }
    })
  }

  const group = (title, rows, field, toggle, emptyMessage) => (
    <Fieldset legend={title}>
      <CheckboxList maxHeight={210}>
        {rows.map(item => (
          <Checkbox
            key={item.id}
            checked={academicInfo[field].includes(String(item.id))}
            onChange={checked => toggle(item.id, checked)}
            label={`${item.code ? `${item.code} · ` : ''}${item.name || item.code}`}
          />
        ))}
        {!rows.length && <Small>{emptyMessage}</Small>}
      </CheckboxList>
    </Fieldset>
  )

  const filter = setter => value => {
    setter(value)
    setPage(1)
  }

  const nameOf = i => i.name || `${i.first_name || ''} ${i.last_name || ''}`.trim() || i.title || 'Lecturer'

  const columns = [
    { key: 'name', label: 'Name', width: 170, value: nameOf },
    { key: 'email', label: 'Email', width: 210, value: i => i.email || 'N/A' },
    { key: 'phone', label: 'Phone', width: 130, value: i => i.phoneNumber || i.phone_number || 'N/A' },
    {
      key: 'department',
      label: 'Department',
      width: 170,
      value: i => departmentNameMap[String(i.department_id ?? i.departmentId)] || i.department || 'General'
    },
    { key: 'units', label: 'Units', width: 200, value: i => (i.units?.length ? i.units.join(', ') : 'N/A') },
    { key: 'status', label: 'Status', width: 100, value: statusOf },
    {
      key: 'actions',
      label: 'Actions',
      width: 250,
      render: item => (
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <TableAction title='Edit academic info' onPress={() => openEditor(item)} />
          <DangerAction title='Delete' disabled={deleteMutation.isPending} onPress={() => setLecturerToDelete(item)} />
        </View>
      )
    }
  ]

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader eyebrow='Academic staff' title='Lecturers'>
        <FilterRow style={{ alignSelf: 'stretch' }}>
          <TextField value={search} onChangeText={filter(setSearch)} placeholder='Search lecturers' />
          <Select
            value={statusFilter}
            onChange={filter(setStatusFilter)}
            searchable={false}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' }
            ]}
          />
          <Select
            value={sortBy}
            onChange={filter(setSortBy)}
            searchable={false}
            options={[
              { value: 'name', label: 'Sort by name' },
              { value: 'email', label: 'Sort by email' },
              { value: 'status', label: 'Sort by status' }
            ]}
          />
        </FilterRow>
        <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.chip, paddingVertical: 8, paddingHorizontal: 12 }}>
          <Text style={[type.body, { color: colors.muted, fontSize: 13.6, fontWeight: '700' }]}>
            {visibleLecturers.length} lecturers
          </Text>
        </View>
      </PageHeader>

      <Panel>
        {isLoading ? (
          <P>Loading lecturers...</P>
        ) : error ? (
          <FormError style={{ marginVertical: 16 }}>Unable to load lecturers.</FormError>
        ) : (
          <DataTable
            columns={columns}
            rows={paginated}
            rowKey={i => i.id ?? i.staff_number}
            minWidth={960}
            headVariant='caps'
            maxHeight={520}
            emptyText='No lecturers found.'
            showsHorizontalScrollIndicator={false}
          />
        )}
        {!isLoading && !error && (
          <PaginationControls
            page={currentPage}
            pageSize={pageSize}
            totalItems={visibleLecturers.length}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={size => {
              setPageSize(size)
              setPage(1)
            }}
          />
        )}
      </Panel>

      {editingLecturer && (
        <Sheet visible dismissable={false} maxWidth={940}>
          <View>
            <Eyebrow>Lecturer registration details</Eyebrow>
            <H2>Edit academic information</H2>
          </View>
          <Muted>
            Update academic selections captured during registration. Removing a parent automatically clears its dependent selections.
          </Muted>
          {optionsLoading ? (
            <P>Loading academic options…</P>
          ) : (
            <StackForm>
              <Field label='Academic title'>
                <TextField
                  value={academicInfo.title}
                  onChangeText={title => setAcademicInfo(c => ({ ...c, title }))}
                  placeholder='e.g. Dr, Professor'
                  autoCapitalize='words'
                />
              </Field>
              <View style={{ gap: 14 }}>
                {group('Faculties', faculties, 'facultyIds', (id, c) => setAcademicInfo(s => ({ ...s, ...toggleFaculty(s, cascadeData, id, c) })), 'No faculties configured.')}
                {group('Departments', availableDepartments, 'departmentIds', (id, c) => setAcademicInfo(s => ({ ...s, ...toggleDepartment(s, cascadeData, id, c) })), 'Select a faculty first.')}
                {group('Programmes', availableProgrammes, 'programmeIds', (id, c) => setAcademicInfo(s => ({ ...s, ...toggleProgramme(s, cascadeData, id, c) })), 'Select a department first.')}
                {group('Units', availableUnits, 'unitIds', (id, c) => setAcademicInfo(s => toggleUnit(s, id, c)), 'Select a programme first.')}
              </View>
              <FormError>{editError}</FormError>
              <ToolbarActions>
                <PrimaryButton
                  title={updateMutation.isPending ? 'Saving…' : 'Save academic info'}
                  onPress={submit}
                  disabled={updateMutation.isPending || optionsLoading}
                />
                <SecondaryButton title='Cancel' onPress={() => setEditingLecturer(null)} />
              </ToolbarActions>
            </StackForm>
          )}
        </Sheet>
      )}

      {lecturerToDelete && (
        <ConfirmActionModal
          title='Delete lecturer?'
          message={`Delete ${lecturerToDelete.name || `${lecturerToDelete.first_name || ''} ${lecturerToDelete.last_name || ''}`.trim()}? This deletion will be recorded in the audit history.`}
          isPending={deleteMutation.isPending}
          onCancel={() => setLecturerToDelete(null)}
          onConfirm={() => deleteMutation.mutate(lecturerToDelete.id, { onSuccess: () => setLecturerToDelete(null) })}
        />
      )}
    </Screen>
  )
}

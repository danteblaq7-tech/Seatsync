import React, { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import useAutoClear from '../hooks/useAutoClear'
import { toArray } from '../utils/data'
import ConfirmActionModal from '../components/ConfirmActionModal'
import DataTable from '../components/DataTable'
import Select from '../components/Select'
import {
  BoxedField,
  Field,
  FilterRow,
  FormError,
  FormGrid,
  P,
  PageHeader,
  Panel,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StackForm,
  TextField,
  ToolbarActions,
  DangerAction
} from '../components/ui'

const emptyStudent = { first_name: '', last_name: '', student_number: '', cohort_id: '', status: 'ACTIVE' }

const statusOptions = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' }
]

export default function StudentsScreen () {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyStudent)
  const [formError, setFormError] = useState('')
  const [studentToDelete, setStudentToDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  useAutoClear(formError, useCallback(() => setFormError(''), []))

  const { data = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['students'],
    queryFn: async () => toArray(await api.get('/api/academic/students'))
  })
  const { data: cohorts = [] } = useQuery({
    queryKey: ['student-cohorts'],
    queryFn: async () => toArray(await api.get('/api/academic/cohorts'))
  })

  const cohortNameMap = Object.fromEntries((cohorts || []).map(c => [String(c.id), c.name]))

  const visibleStudents = useMemo(() => {
    const valueOf = (item, key) =>
      String(key === 'status' ? item.status || '' : key === 'email' ? item.email || '' : item.name || '').toLowerCase()
    return [...data]
      .filter(item => {
        const name = item.name || `${item.first_name || ''} ${item.last_name || ''}`
        const text = `${name} ${item.email || ''} ${item.phoneNumber || item.phone_number || ''} ${item.student_number || ''}`.toLowerCase()
        return text.includes(search.toLowerCase()) && (statusFilter === 'all' || (item.status || 'ACTIVE') === statusFilter)
      })
      .sort((a, b) => valueOf(a, sortBy).localeCompare(valueOf(b, sortBy)))
  }, [data, search, sortBy, statusFilter])

  const createStudent = useMutation({
    mutationFn: async payload => {
      const response = await api.post('/api/academic/students', payload)
      return response?.data ?? response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setShowForm(false)
      setForm(emptyStudent)
      setFormError('')
    },
    onError: err => setFormError(err.message || 'Unable to create student.')
  })

  const deleteStudent = useMutation({
    mutationFn: async id => {
      await api.del(`/api/academic/students/${id}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['students'] })
  })

  const handleSubmit = () => {
    if (!form.first_name || !form.last_name || !form.student_number || !form.cohort_id) {
      setFormError('First name, last name, student number, and cohort are required.')
      return
    }
    createStudent.mutate({ ...form, cohort_id: Number(form.cohort_id) || null, is_active: true })
  }

  const set = key => value => setForm(current => ({ ...current, [key]: value }))

  const displayName = item =>
    item.name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Student'

  const columns = [
    { key: 'name', label: 'Name', width: 160, value: displayName },
    { key: 'email', label: 'Email', width: 200, value: item => item.email || 'N/A' },
    { key: 'phone', label: 'Phone', width: 130, value: item => item.phoneNumber || item.phone_number || 'N/A' },
    { key: 'number', label: 'Student ID', width: 120, value: item => item.student_number || item.studentNumber || 'N/A' },
    { key: 'cohort', label: 'Cohort', width: 150, value: item => cohortNameMap[String(item.cohort_id ?? item.cohortId)] || item.cohort || 'Unassigned' },
    { key: 'status', label: 'Status', width: 100, value: item => item.status || 'ACTIVE' },
    {
      key: 'actions',
      label: 'Actions',
      width: 110,
      render: item => (
        <DangerAction title='Delete' onPress={() => setStudentToDelete(item)} disabled={deleteStudent.isPending} />
      )
    }
  ]

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader eyebrow='Student records' title='Students'>
        <FilterRow style={{ alignSelf: 'stretch' }}>
          <TextField value={search} onChangeText={setSearch} placeholder='Search students' />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            searchable={false}
            options={[{ value: 'all', label: 'All statuses' }, ...statusOptions]}
          />
          <Select
            value={sortBy}
            onChange={setSortBy}
            searchable={false}
            options={[
              { value: 'name', label: 'Sort by name' },
              { value: 'email', label: 'Sort by email' },
              { value: 'status', label: 'Sort by status' }
            ]}
          />
        </FilterRow>
        <ToolbarActions>
          <PrimaryButton title={showForm ? 'Close form' : 'Add student'} onPress={() => setShowForm(v => !v)} />
        </ToolbarActions>
      </PageHeader>

      {showForm && (
        <Panel>
          <StackForm>
            <FormGrid>
              <Field label='First name'>
                <TextField value={form.first_name} onChangeText={set('first_name')} autoCapitalize='words' />
              </Field>
              <Field label='Last name'>
                <TextField value={form.last_name} onChangeText={set('last_name')} autoCapitalize='words' />
              </Field>
              <Field label='Student number'>
                <TextField value={form.student_number} onChangeText={set('student_number')} />
              </Field>
              <BoxedField label='Cohort'>
                <Select
                  value={String(form.cohort_id ?? '')}
                  onChange={set('cohort_id')}
                  emptyLabel='Select cohort'
                  options={(cohorts || []).map(c => ({ value: String(c.id ?? c.name), label: c.name }))}
                />
              </BoxedField>
              <BoxedField label='Status'>
                <Select value={form.status} onChange={set('status')} searchable={false} options={statusOptions} />
              </BoxedField>
            </FormGrid>
            <FormError>{formError}</FormError>
            <ToolbarActions>
              <PrimaryButton
                title={createStudent.isPending ? 'Saving...' : 'Save student'}
                onPress={handleSubmit}
                disabled={createStudent.isPending}
              />
              <SecondaryButton title='Cancel' onPress={() => setShowForm(false)} />
            </ToolbarActions>
          </StackForm>
        </Panel>
      )}

      <Panel>
        {isLoading ? (
          <P>Loading students...</P>
        ) : error ? (
          <FormError style={{ marginVertical: 16 }}>Unable to load students.</FormError>
        ) : (
          <DataTable columns={columns} rows={visibleStudents} rowKey={item => item.id ?? item.student_number} emptyText='No students found.' />
        )}
      </Panel>

      {studentToDelete && (
        <ConfirmActionModal
          title='Delete student?'
          message={`Delete ${displayName(studentToDelete)}? This deletion will be recorded in the audit history.`}
          isPending={deleteStudent.isPending}
          onCancel={() => setStudentToDelete(null)}
          onConfirm={() => deleteStudent.mutate(studentToDelete.id, { onSuccess: () => setStudentToDelete(null) })}
        />
      )}
    </Screen>
  )
}

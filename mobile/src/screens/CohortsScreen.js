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
  BoxedField,
  DangerAction,
  Eyebrow,
  Field,
  FilterRow,
  FormError,
  FormGrid,
  H2,
  P,
  PageHeader,
  Panel,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StackForm,
  SuccessMessage,
  TableAction,
  TextField,
  ToolbarActions
} from '../components/ui'

const emptyCohort = { name: '', programme_id: '', academic_year_id: '', student_count: 0 }

export default function CohortsScreen () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManage = (user?.roles || []).includes('ADMIN')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyCohort)
  const [formError, setFormError] = useState('')
  const [search, setSearch] = useState('')
  const [programmeFilter, setProgrammeFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [editingCohort, setEditingCohort] = useState(null)
  const [editForm, setEditForm] = useState(emptyCohort)
  const [cohortToDelete, setCohortToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteNotice, setDeleteNotice] = useState('')
  useAutoClear(formError, useCallback(() => setFormError(''), []))

  const { data: cohortPage = { items: [], pagination: {} }, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['cohorts', search, programmeFilter, yearFilter, sortBy, sortDirection, page, pageSize],
    queryFn: async () => {
      const response = await api.get(
        `/api/academic/cohorts?${qs({
          search,
          programme: programmeFilter === 'all' ? '' : programmeFilter,
          academicYear: yearFilter === 'all' ? '' : yearFilter,
          sort: sortBy,
          direction: sortDirection,
          page,
          limit: pageSize
        })}`
      )
      return { items: toArray(response), pagination: response?.pagination || {} }
    }
  })
  const data = cohortPage.items
  const pagination = cohortPage.pagination

  const { data: programmes = [] } = useQuery({
    queryKey: ['cohort-programmes'],
    queryFn: async () => toArray(await api.get('/api/academic/programmes'))
  })
  const { data: academicYears = [] } = useQuery({
    queryKey: ['cohort-academic-years'],
    queryFn: async () => toArray(await api.get('/api/academic/academic-years'))
  })

  const invalidate = keys => Promise.all(keys.map(k => queryClient.invalidateQueries({ queryKey: [k] })))

  const createMutation = useMutation({
    mutationFn: async payload => {
      const response = await api.post('/api/academic/cohorts', payload)
      return response?.data ?? response
    },
    onSuccess: async () => {
      await invalidate(['cohorts', 'academic-cohorts', 'timetable'])
      setShowForm(false)
      setForm(emptyCohort)
      setFormError('')
    },
    onError: err => setFormError(err.message || 'Unable to create cohort.')
  })

  const deleteMutation = useMutation({
    mutationFn: async id => {
      await api.del(`/api/academic/cohorts/${id}`)
    },
    onSuccess: async result => {
      await invalidate(['cohorts', 'academic-cohorts', 'timetable', 'dashboard-summary'])
      if (result?.archived) setDeleteNotice(result.message)
    },
    onError: err => setDeleteError(err.message || 'Unable to delete cohort.')
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => api.put(`/api/academic/cohorts/${id}`, payload),
    onSuccess: async () => {
      await invalidate(['cohorts', 'academic-cohorts', 'timetable', 'dashboard-summary'])
      setEditingCohort(null)
      setFormError('')
    },
    onError: err => setFormError(err.message || 'Unable to update cohort.')
  })

  const programmeOptions = programmes.map(p => ({
    value: String(p.id ?? p.code),
    label: p.name || p.code,
    searchText: `${p.name || ''} ${p.code || ''}`
  }))
  const yearOptions = academicYears.map(y => ({ value: String(y.id ?? y.name), label: y.name }))

  const submitCreate = () => {
    if (!form.name || !form.programme_id || !form.academic_year_id) {
      setFormError('Cohort name, programme, and academic year are required.')
      return
    }
    createMutation.mutate({
      ...form,
      programme_id: Number(form.programme_id) || null,
      academic_year_id: Number(form.academic_year_id) || null,
      student_count: Number(form.student_count) || 0
    })
  }

  const submitEdit = () => {
    if (!editForm.name || !editForm.programme_id || !editForm.academic_year_id) {
      setFormError('Cohort name, programme, and academic year are required.')
      return
    }
    updateMutation.mutate({
      id: editingCohort.id,
      payload: {
        ...editForm,
        programme_id: Number(editForm.programme_id),
        academic_year_id: Number(editForm.academic_year_id),
        student_count: Number(editForm.student_count) || 0
      }
    })
  }

  const filter = setter => value => {
    setter(value)
    setPage(1)
  }

  const columns = [
    { key: 'name', label: 'Cohort', width: 170, value: i => i.name || i.cohort_name || 'Untitled cohort' },
    {
      key: 'programme',
      label: 'Programme',
      width: 220,
      value: i => programmes.find(v => String(v.id) === String(i.programme_id ?? i.programmeId))?.name || '—'
    },
    {
      key: 'year',
      label: 'Academic year',
      width: 150,
      value: i => academicYears.find(v => String(v.id) === String(i.academic_year_id ?? i.academicYearId))?.name || '—'
    },
    { key: 'students', label: 'Students', width: 100, value: i => i.student_count ?? i.studentCount ?? 0 },
    ...(canManage
      ? [
          {
            key: 'actions',
            label: 'Actions',
            width: 190,
            render: item => (
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <TableAction
                  title='Edit'
                  onPress={() => {
                    setEditingCohort(item)
                    setEditForm({
                      name: item.name || item.cohort_name || '',
                      programme_id: String(item.programme_id ?? item.programmeId ?? ''),
                      academic_year_id: String(item.academic_year_id ?? item.academicYearId ?? ''),
                      student_count: item.student_count ?? item.studentCount ?? 0
                    })
                  }}
                />
                <DangerAction
                  title='Delete'
                  disabled={deleteMutation.isPending}
                  onPress={() => {
                    setDeleteError('')
                    setDeleteNotice('')
                    setCohortToDelete(item)
                  }}
                />
              </View>
            )
          }
        ]
      : [])
  ]

  const formFields = (state, setState, { yearEmpty }) => (
    <FormGrid>
      <Field label='Cohort name'>
        <TextField value={state.name} onChangeText={name => setState(c => ({ ...c, name }))} />
      </Field>
      <Field label='Programme'>
        <Select
          value={String(state.programme_id ?? '')}
          onChange={programme_id => setState(c => ({ ...c, programme_id }))}
          emptyLabel='Select programme'
          options={programmeOptions}
          searchPlaceholder='Search programmes'
          variant='scrollable'
        />
      </Field>
      <BoxedField label='Academic year'>
        <Select
          value={String(state.academic_year_id ?? '')}
          onChange={academic_year_id => setState(c => ({ ...c, academic_year_id }))}
          emptyLabel={yearEmpty}
          options={yearOptions}
        />
      </BoxedField>
      <Field label='Student count'>
        <TextField
          value={String(state.student_count ?? '')}
          onChangeText={student_count => setState(c => ({ ...c, student_count }))}
          keyboardType='number-pad'
        />
      </Field>
    </FormGrid>
  )

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader eyebrow='Student groups' title='Cohorts'>
        {canManage && (
          <ToolbarActions>
            <PrimaryButton title={showForm ? 'Close form' : 'Add cohort'} onPress={() => setShowForm(v => !v)} />
          </ToolbarActions>
        )}
      </PageHeader>

      {showForm && canManage && (
        <Panel>
          <StackForm>
            {formFields(form, setForm, { yearEmpty: 'Select academic year' })}
            <FormError>{formError}</FormError>
            <ToolbarActions>
              <PrimaryButton title={createMutation.isPending ? 'Saving...' : 'Save cohort'} onPress={submitCreate} disabled={createMutation.isPending} />
              <SecondaryButton title='Cancel' onPress={() => setShowForm(false)} />
            </ToolbarActions>
          </StackForm>
        </Panel>
      )}

      <Panel>
        <SuccessMessage style={{ marginVertical: deleteNotice ? 16 : 0 }}>{deleteNotice}</SuccessMessage>
        <FilterRow style={{ marginBottom: 16 }}>
          <TextField value={search} onChangeText={filter(setSearch)} placeholder='Search cohorts, programme names or codes' />
          <Select
            value={String(programmeFilter)}
            onChange={filter(setProgrammeFilter)}
            options={[{ value: 'all', label: 'All programmes' }, ...programmeOptions]}
            placeholder='All programmes'
            searchPlaceholder='Search programmes'
          />
          <Select
            value={String(yearFilter)}
            onChange={filter(setYearFilter)}
            searchable={false}
            options={[{ value: 'all', label: 'All academic years' }, ...yearOptions]}
          />
          <Select
            value={sortBy}
            onChange={filter(setSortBy)}
            searchable={false}
            options={[
              { value: 'name', label: 'Sort by name' },
              { value: 'students', label: 'Sort by student count' }
            ]}
          />
          <SecondaryButton
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            onPress={() => {
              setSortDirection(v => (v === 'asc' ? 'desc' : 'asc'))
              setPage(1)
            }}
          />
        </FilterRow>

        {isLoading ? (
          <P>Loading cohorts...</P>
        ) : error ? (
          <FormError style={{ marginVertical: 16 }}>Unable to load cohorts.</FormError>
        ) : (
          <DataTable columns={columns} rows={data} rowKey={i => i.id ?? i.name} emptyText='No cohorts match the selected filters.' maxHeight={390} showsHorizontalScrollIndicator={false} />
        )}

        <PaginationControls
          page={pagination.page || page}
          pageSize={pagination.limit || pageSize}
          totalItems={pagination.totalItems || 0}
          totalPages={pagination.totalPages || 1}
          onPageChange={setPage}
          onPageSizeChange={size => {
            setPageSize(size)
            setPage(1)
          }}
        />
      </Panel>

      {cohortToDelete && canManage && (
        <ConfirmActionModal
          title='Delete cohort?'
          message={`Delete ${cohortToDelete.name || cohortToDelete.cohort_name}? This record may be referenced by students or schedules.`}
          isPending={deleteMutation.isPending}
          onCancel={() => setCohortToDelete(null)}
          errorMessage={deleteError}
          onConfirm={() => {
            setDeleteError('')
            deleteMutation.mutate(cohortToDelete.id, { onSuccess: () => setCohortToDelete(null) })
          }}
        />
      )}

      {editingCohort && canManage && (
        <Sheet visible onClose={() => setEditingCohort(null)}>
          <View style={{ gap: 12 }}>
            <View>
              <Eyebrow>Cohort details</Eyebrow>
              <H2>Edit cohort</H2>
            </View>
            <View style={{ alignSelf: 'flex-start' }}>
              <SecondaryButton title='Close' onPress={() => setEditingCohort(null)} />
            </View>
          </View>
          <StackForm>
            {formFields(editForm, setEditForm, { yearEmpty: 'Select year' })}
            <FormError>{formError}</FormError>
            <ToolbarActions>
              <PrimaryButton title={updateMutation.isPending ? 'Saving...' : 'Save changes'} onPress={submitEdit} disabled={updateMutation.isPending} />
              <SecondaryButton title='Cancel' onPress={() => setEditingCohort(null)} />
            </ToolbarActions>
          </StackForm>
        </Sheet>
      )}
    </Screen>
  )
}

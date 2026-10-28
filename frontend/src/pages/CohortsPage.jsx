import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import ConfirmActionModal from '../components/ConfirmActionModal'
import PaginationControls from '../components/PaginationControls'
import SearchableSelect from '../components/SearchableSelect'
import { useAuth } from '../context/AuthContext'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

const emptyCohort = {
  name: '',
  programme_id: '',
  academic_year_id: '',
  student_count: 0
}

export default function CohortsPage () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManageCohorts = (user?.roles || []).includes('ADMIN')
  const [showForm, setShowForm] = useState(false)
  const builderRef = useRef(null)
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

  useEffect(() => {
    if (!formError) return undefined
    const timeout = setTimeout(() => setFormError(''), 5000)
    return () => clearTimeout(timeout)
  }, [formError])

  const {
    data: cohortPage = { items: [], pagination: {} },
    isLoading,
    error
  } = useQuery({
    queryKey: [
      'cohorts',
      search,
      programmeFilter,
      yearFilter,
      sortBy,
      sortDirection,
      page,
      pageSize
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        search,
        programme: programmeFilter === 'all' ? '' : programmeFilter,
        academicYear: yearFilter === 'all' ? '' : yearFilter,
        sort: sortBy,
        direction: sortDirection,
        page: String(page),
        limit: String(pageSize)
      })
      const response = await api.get(`/api/academic/cohorts?${params}`)
      return {
        items: toArray(response),
        pagination: response?.pagination || {}
      }
    }
  })
  const data = cohortPage.items
  const pagination = cohortPage.pagination

  const { data: programmes = [] } = useQuery({
    queryKey: ['cohort-programmes'],
    queryFn: async () => {
      const response = await api.get('/api/academic/programmes')
      return toArray(response)
    }
  })

  const { data: academicYears = [] } = useQuery({
    queryKey: ['cohort-academic-years'],
    queryFn: async () => {
      const response = await api.get('/api/academic/academic-years')
      return toArray(response)
    }
  })

  const createCohortMutation = useMutation({
    mutationFn: async payload => {
      const response = await api.post('/api/academic/cohorts', payload)
      return response?.data ?? response
    },
    onSuccess: async () => {
      await Promise.all(
        ['cohorts', 'academic-cohorts', 'timetable'].map(queryKey =>
          queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      )
      setForm(emptyCohort)
      setFormError('')
      requestAnimationFrame(() => {
        builderRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      })
    },
    onError: err => setFormError(err.message || 'Unable to create cohort.')
  })

  const deleteCohortMutation = useMutation({
    mutationFn: async id => {
      await api.del(`/api/academic/cohorts/${id}`)
    },
    onSuccess: async result => {
      await Promise.all(
        ['cohorts', 'academic-cohorts', 'timetable', 'dashboard-summary'].map(
          queryKey => queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      )
      if (result?.archived) setDeleteNotice(result.message)
    },
    onError: error =>
      setDeleteError(error.message || 'Unable to delete cohort.')
  })

  const updateCohortMutation = useMutation({
    mutationFn: async ({ id, payload }) =>
      api.put(`/api/academic/cohorts/${id}`, payload),
    onSuccess: async () => {
      await Promise.all(
        ['cohorts', 'academic-cohorts', 'timetable', 'dashboard-summary'].map(
          queryKey => queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      )
      setEditingCohort(null)
      setFormError('')
    },
    onError: err => setFormError(err.message || 'Unable to update cohort.')
  })

  const visibleCohorts = data

  const handleSubmit = event => {
    event.preventDefault()

    if (!form.name || !form.programme_id || !form.academic_year_id) {
      setFormError('Cohort name, programme, and academic year are required.')
      return
    }

    createCohortMutation.mutate({
      ...form,
      programme_id: Number(form.programme_id) || null,
      academic_year_id: Number(form.academic_year_id) || null,
      student_count: Number(form.student_count) || 0
    })
  }

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Student groups</p>
          <h1>Cohorts</h1>
        </div>

        {canManageCohorts && (
          <div className='toolbar-actions'>
            <button
              type='button'
              className='primary-button'
              onClick={() => setShowForm(value => !value)}
            >
              {showForm ? 'Close form' : 'Add cohort'}
            </button>
          </div>
        )}
      </div>

      {showForm && canManageCohorts && (
        <section ref={builderRef} className='content-panel'>
          <form
            className='stack-form academic-mobile-single-column-form'
            onSubmit={handleSubmit}
          >
            <div className='form-grid'>
              <label>
                Cohort name
                <input
                  value={form.name}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Programme
                <SearchableSelect
                  options={[
                    { value: '', label: 'Select programme' },
                    ...(programmes || []).map(programme => ({
                      value: programme.id ?? programme.code,
                      label: programme.name || programme.code,
                      searchText: `${programme.name || ''} ${
                        programme.code || ''
                      }`
                    }))
                  ]}
                  value={form.programme_id}
                  onChange={value =>
                    setForm(current => ({
                      ...current,
                      programme_id: value
                    }))
                  }
                  placeholder='Select programme'
                  searchPlaceholder='Search programmes'
                  ariaLabel='Search cohort programmes'
                />
              </label>
              <label>
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
                  <option value=''>Select academic year</option>
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
              <label>
                Student count
                <input
                  type='number'
                  value={form.student_count}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      student_count: event.target.value
                    }))
                  }
                />
              </label>
            </div>

            {formError && <p className='form-error'>{formError}</p>}

            <div className='toolbar-actions'>
              <button
                type='submit'
                className='primary-button'
                disabled={createCohortMutation.isPending}
              >
                {createCohortMutation.isPending ? 'Saving...' : 'Save cohort'}
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

      <section className='content-panel table-panel'>
        {deleteNotice && <p className='success-message'>{deleteNotice}</p>}
        <div className='filter-row academic-list-filters'>
          <input
            type='search'
            value={search}
            onChange={event => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder='Search cohorts, programme names or codes'
          />
          <SearchableSelect
            options={[
              { value: 'all', label: 'All programmes' },
              ...programmes.map(item => ({
                value: item.id,
                label: item.name || item.code,
                searchText: `${item.name || ''} ${item.code || ''}`
              }))
            ]}
            value={programmeFilter}
            onChange={value => {
              setProgrammeFilter(value)
              setPage(1)
            }}
            placeholder='All programmes'
            searchPlaceholder='Search programmes'
            ariaLabel='Search cohort programme filters'
          />
          <select
            value={yearFilter}
            onChange={event => {
              setYearFilter(event.target.value)
              setPage(1)
            }}
          >
            <option value='all'>All academic years</option>
            {academicYears.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={event => {
              setSortBy(event.target.value)
              setPage(1)
            }}
          >
            <option value='name'>Sort by name</option>
            <option value='students'>Sort by student count</option>
          </select>
          <button
            type='button'
            className='secondary-button'
            onClick={() => {
              setSortDirection(value => (value === 'asc' ? 'desc' : 'asc'))
              setPage(1)
            }}
          >
            {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          </button>
        </div>
        {isLoading ? (
          <p>Loading cohorts...</p>
        ) : error ? (
          <p className='form-error'>Unable to load cohorts.</p>
        ) : (
          <div className='academic-records-scroll'>
            <table>
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th>Programme</th>
                  <th>Academic year</th>
                  <th>Students</th>
                  {canManageCohorts && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visibleCohorts.length ? (
                  visibleCohorts.map(item => (
                    <tr key={item.id ?? item.name}>
                      {canManageCohorts && (
                        <td>
                          {item.name || item.cohort_name || 'Untitled cohort'}
                        </td>
                      )}
                      <td>
                        {programmes.find(
                          value =>
                            String(value.id) ===
                            String(item.programme_id ?? item.programmeId)
                        )?.name || '—'}
                      </td>
                      <td>
                        {academicYears.find(
                          value =>
                            String(value.id) ===
                            String(item.academic_year_id ?? item.academicYearId)
                        )?.name || '—'}
                      </td>
                      <td>{item.student_count ?? item.studentCount ?? 0}</td>
                      <td>
                        <button
                          type='button'
                          className='table-action'
                          onClick={() => {
                            setEditingCohort(item)
                            setEditForm({
                              name: item.name || item.cohort_name || '',
                              programme_id: String(
                                item.programme_id ?? item.programmeId ?? ''
                              ),
                              academic_year_id: String(
                                item.academic_year_id ??
                                  item.academicYearId ??
                                  ''
                              ),
                              student_count:
                                item.student_count ?? item.studentCount ?? 0
                            })
                          }}
                        >
                          Edit
                        </button>{' '}
                        <button
                          type='button'
                          className='table-action danger'
                          onClick={() => {
                            setDeleteError('')
                            setDeleteNotice('')
                            setCohortToDelete(item)
                          }}
                          disabled={deleteCohortMutation.isPending}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canManageCohorts ? 5 : 4}>
                      No cohorts match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
      </section>

      {cohortToDelete && canManageCohorts && (
        <ConfirmActionModal
          title='Delete cohort?'
          message={`Delete ${
            cohortToDelete.name || cohortToDelete.cohort_name
          }? This record may be referenced by students or schedules.`}
          isPending={deleteCohortMutation.isPending}
          onCancel={() => setCohortToDelete(null)}
          errorMessage={deleteError}
          onConfirm={() => {
            setDeleteError('')
            deleteCohortMutation.mutate(cohortToDelete.id, {
              onSuccess: () => setCohortToDelete(null)
            })
          }}
        />
      )}

      {editingCohort && canManageCohorts && (
        <div
          className='profile-modal-backdrop'
          onClick={() => setEditingCohort(null)}
        >
          <section
            className='profile-modal content-panel'
            onClick={event => event.stopPropagation()}
          >
            <div className='page-header'>
              <div>
                <p className='eyebrow'>Cohort details</p>
                <h2>Edit cohort</h2>
              </div>
              <button
                type='button'
                className='secondary-button'
                onClick={() => setEditingCohort(null)}
              >
                Close
              </button>
            </div>
            <form
              className='stack-form academic-mobile-single-column-form'
              onSubmit={event => {
                event.preventDefault()
                if (
                  !editForm.name ||
                  !editForm.programme_id ||
                  !editForm.academic_year_id
                ) {
                  setFormError(
                    'Cohort name, programme, and academic year are required.'
                  )
                  return
                }
                updateCohortMutation.mutate({
                  id: editingCohort.id,
                  payload: {
                    ...editForm,
                    programme_id: Number(editForm.programme_id),
                    academic_year_id: Number(editForm.academic_year_id),
                    student_count: Number(editForm.student_count) || 0
                  }
                })
              }}
            >
              <div className='form-grid'>
                <label>
                  Cohort name
                  <input
                    value={editForm.name}
                    onChange={event =>
                      setEditForm(current => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Programme
                  <SearchableSelect
                    options={[
                      { value: '', label: 'Select programme' },
                      ...programmes.map(item => ({
                        value: item.id,
                        label: item.name || item.code,
                        searchText: `${item.name || ''} ${item.code || ''}`
                      }))
                    ]}
                    value={editForm.programme_id}
                    onChange={value =>
                      setEditForm(current => ({
                        ...current,
                        programme_id: value
                      }))
                    }
                    placeholder='Select programme'
                    searchPlaceholder='Search programmes'
                    ariaLabel='Search cohort programmes'
                  />
                </label>
                <label>
                  Academic year
                  <select
                    value={editForm.academic_year_id}
                    onChange={event =>
                      setEditForm(current => ({
                        ...current,
                        academic_year_id: event.target.value
                      }))
                    }
                  >
                    <option value=''>Select year</option>
                    {academicYears.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Student count
                  <input
                    type='number'
                    min='0'
                    value={editForm.student_count}
                    onChange={event =>
                      setEditForm(current => ({
                        ...current,
                        student_count: event.target.value
                      }))
                    }
                  />
                </label>
              </div>
              {formError && <p className='form-error'>{formError}</p>}
              <div className='toolbar-actions'>
                <button
                  type='submit'
                  className='primary-button'
                  disabled={updateCohortMutation.isPending}
                >
                  {updateCohortMutation.isPending
                    ? 'Saving...'
                    : 'Save changes'}
                </button>
                <button
                  type='button'
                  className='secondary-button'
                  onClick={() => setEditingCohort(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { api } from '../api/client'
import ConfirmActionModal from '../components/ConfirmActionModal'
import PaginationControls from '../components/PaginationControls'
import SearchableSelect from '../components/SearchableSelect'
import { useAuth } from '../context/AuthContext'
import { SOCKET_BASE_URL } from '../config.js'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

const emptyCohort = {
  programme_id: '',
  cohort_type_id: '',
  academic_year_id: '',
  semester_id: '',
  intake_year: '',
  student_count: 0
}

export default function CohortsPage () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManageCohorts = (user?.roles || []).includes('ADMIN')
  const canManageProgression = (user?.roles || []).some(role =>
    ['ADMIN', 'CLASS_REP'].includes(role)
  )
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
  const [selectedCohort, setSelectedCohort] = useState(null)
  const [intakeYear, setIntakeYear] = useState('')
  const [progressionForm, setProgressionForm] = useState({
    academic_year_id: '',
    semester_id: '',
    cohort_type_id: '',
    student_count: ''
  })
  const [cohortToDelete, setCohortToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteNotice, setDeleteNotice] = useState('')

  useEffect(() => {
    const socket = io(SOCKET_BASE_URL, { transports: ['websocket'] })
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['cohorts'] })
      queryClient.invalidateQueries({ queryKey: ['cohort-profile-requests'] })
      queryClient.invalidateQueries({ queryKey: ['cohort-membership-requests'] })
      queryClient.invalidateQueries({ queryKey: ['cohort-progressions'] })
    }
    socket.on('academic:updated', refresh)
    socket.on('timetable:changed', refresh)
    return () => socket.disconnect()
  }, [queryClient])

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

  const { data: cohortProfileRequests = [] } = useQuery({
    queryKey: ['cohort-profile-requests'],
    queryFn: async () =>
      toArray(await api.get('/api/academic/cohort-profile-requests')),
    enabled: canManageCohorts
  })

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

  const { data: semesters = [] } = useQuery({
    queryKey: ['cohort-semesters'],
    queryFn: async () => toArray(await api.get('/api/academic/semesters'))
  })

  const { data: cohortTypes = [] } = useQuery({
    queryKey: ['cohort-types', form.programme_id],
    queryFn: async () => {
      const params = new URLSearchParams({ programmeId: form.programme_id })
      return toArray(await api.get(`/api/academic/cohort-types?${params}`))
    },
    enabled: Boolean(form.programme_id)
  })

  const { data: progressionTypes = [] } = useQuery({
    queryKey: ['cohort-types', selectedCohort?.programme_id],
    queryFn: async () => {
      const params = new URLSearchParams({
        programmeId: String(selectedCohort.programme_id)
      })
      return toArray(await api.get(`/api/academic/cohort-types?${params}`))
    },
    enabled: Boolean(selectedCohort?.programme_id)
  })

  const {
    data: progressions = [],
    isLoading: progressionsLoading,
    error: progressionsError
  } = useQuery({
    queryKey: ['cohort-progressions', selectedCohort?.id],
    queryFn: async () =>
      toArray(
        await api.get(
          `/api/academic/cohorts/${selectedCohort.id}/progressions`
        )
      ),
    enabled: Boolean(selectedCohort?.id)
  })

  const { data: membershipRequests = [] } = useQuery({
    queryKey: ['cohort-membership-requests', selectedCohort?.id],
    queryFn: async () =>
      toArray(
        await api.get(
          `/api/academic/cohorts/${selectedCohort.id}/membership-requests`
        )
      ),
    enabled: Boolean(selectedCohort?.id && canManageProgression)
  })

  const createCohortMutation = useMutation({
    mutationFn: async payload => {
      const response = await api.post('/api/academic/cohorts', payload)
      return response?.data ?? response
    },
    onSuccess: async () => {
      await Promise.all(
        [
          'cohorts',
          'academic-cohorts',
          'timetable',
          'eligible-cohorts'
        ].map(queryKey =>
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

  const reviewProfileRequestMutation = useMutation({
    mutationFn: async ({ requestId, decision }) =>
      api.post(`/api/academic/cohort-profile-requests/${requestId}/review`, {
        decision
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          'cohort-profile-requests',
          'cohorts',
          'academic-cohorts',
          'profile-status',
          'students',
          'timetable',
          'eligible-cohorts'
        ].map(queryKey =>
          queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      )
    }
  })

  const reviewMembershipMutation = useMutation({
    mutationFn: async ({ requestId, decision }) =>
      api.post(
        `/api/academic/cohorts/${selectedCohort.id}/membership-requests/${requestId}/review`,
        { decision }
      ),
    onSuccess: async () => {
      await Promise.all(
        [
          'cohort-membership-requests',
          'cohorts',
          'academic-cohorts',
          'cohort-progressions',
          'profile-status',
          'students',
          'timetable',
          'exams',
          'dashboard-summary'
        ].map(queryKey =>
          queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      )
    }
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

  const createProgressionMutation = useMutation({
    mutationFn: async ({ cohortId, payload }) =>
      api.post(`/api/academic/cohorts/${cohortId}/progressions`, payload),
    onSuccess: async () => {
      await Promise.all(
        [
          'cohorts',
          'academic-cohorts',
          'cohort-progressions',
          'eligible-cohorts',
          'timetable',
          'exams'
        ].map(queryKey =>
          queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      )
      setProgressionForm(current => ({
        ...current,
        semester_id: '',
        cohort_type_id: ''
      }))
      setFormError('')
    },
    onError: err =>
      setFormError(err.message || 'Unable to add cohort progression.')
  })

  const reconcileIntakeMutation = useMutation({
    mutationFn: async ({ cohortId, year }) =>
      api.put(`/api/academic/cohorts/${cohortId}`, { intake_year: year }),
    onSuccess: async (_, variables) => {
      await Promise.all(
        ['cohorts', 'academic-cohorts'].map(queryKey =>
          queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      )
      setSelectedCohort(current =>
        current?.id === variables.cohortId
          ? { ...current, intake_year: variables.year }
          : current
      )
      setFormError('')
    },
    onError: err =>
      setFormError(err.message || 'Unable to reconcile cohort intake.')
  })

  const visibleCohorts = data

  const handleSubmit = event => {
    event.preventDefault()

    if (
      !form.programme_id ||
      !form.cohort_type_id ||
      !form.academic_year_id ||
      !form.semester_id ||
      !form.intake_year
    ) {
      setFormError(
        'Programme, cohort type, academic year, semester, and intake year are required.'
      )
      return
    }

    createCohortMutation.mutate({
      programme_id: Number(form.programme_id) || null,
      cohort_type_id: Number(form.cohort_type_id) || null,
      academic_year_id: Number(form.academic_year_id) || null,
      semester_id: Number(form.semester_id) || null,
      intake_year: Number(form.intake_year),
      student_count: Number(form.student_count) || 0
    })
  }

  const handleProgressionSubmit = event => {
    event.preventDefault()
    if (
      !selectedCohort ||
      !progressionForm.academic_year_id ||
      !progressionForm.semester_id ||
      !progressionForm.cohort_type_id ||
      progressionForm.student_count === ''
    ) {
      setFormError(
        'Academic year, semester, cohort type, and student count are required.'
      )
      return
    }
    const studentCount = Number(progressionForm.student_count)
    if (!Number.isInteger(studentCount) || studentCount < 0) {
      setFormError('Student count must be a non-negative whole number.')
      return
    }
    createProgressionMutation.mutate({
      cohortId: selectedCohort.id,
      payload: {
        academic_year_id: Number(progressionForm.academic_year_id),
        semester_id: Number(progressionForm.semester_id),
        cohort_type_id: Number(progressionForm.cohort_type_id),
        student_count: studentCount
      }
    })
  }

  const handleIntakeReconciliation = () => {
    const year = Number(intakeYear)
    if (!selectedCohort || !Number.isInteger(year) || year < 1900) {
      setFormError('Enter a valid intake year.')
      return
    }
    reconcileIntakeMutation.mutate({
      cohortId: selectedCohort.id,
      year
    })
  }

  const selectedCreateSemester = semesters.find(
    semester => String(semester.id) === String(form.semester_id)
  )
  const selectedProgressionSemester = semesters.find(
    semester => String(semester.id) === String(progressionForm.semester_id)
  )

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

      {canManageCohorts && cohortProfileRequests.length > 0 && (
        <section className='content-panel'>
          <h2>Class representative cohort requests</h2>
          <div className='academic-records-scroll'>
            <table>
              <thead>
                <tr>
                  <th>Representative</th>
                  <th>Programme</th>
                  <th>Intake</th>
                  <th>Initial stage</th>
                  <th>Academic period</th>
                  <th>Reported students</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cohortProfileRequests.map(request => (
                  <tr key={request.id}>
                    <td>
                      {request.first_name} {request.last_name}
                      <br />
                      {request.email}
                    </td>
                    <td>
                      {request.programme_code} · {request.programme_name}
                    </td>
                    <td>{request.intake_year}</td>
                    <td>
                      {request.cohort_type_name} (Year {request.study_year},
                      Semester {request.semester_number})
                    </td>
                    <td>
                      {request.semester_name}, {request.academic_year_name}
                    </td>
                    <td>{request.student_count}</td>
                    <td>
                      <button
                        type='button'
                        className='table-action'
                        disabled={reviewProfileRequestMutation.isPending}
                        onClick={() =>
                          reviewProfileRequestMutation.mutate({
                            requestId: request.id,
                            decision: 'APPROVED'
                          })
                        }
                      >
                        Approve
                      </button>{' '}
                      <button
                        type='button'
                        className='table-action danger'
                        disabled={reviewProfileRequestMutation.isPending}
                        onClick={() =>
                          reviewProfileRequestMutation.mutate({
                            requestId: request.id,
                            decision: 'REJECTED'
                          })
                        }
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reviewProfileRequestMutation.error && (
            <p className='form-error'>
              {reviewProfileRequestMutation.error.message}
            </p>
          )}
        </section>
      )}

      {showForm && canManageCohorts && (
        <section ref={builderRef} className='content-panel'>
          <form
            className='stack-form academic-mobile-single-column-form'
            onSubmit={handleSubmit}
          >
            <div className='form-grid'>
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
                      programme_id: value,
                      cohort_type_id: ''
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
                      academic_year_id: event.target.value,
                      semester_id: '',
                      cohort_type_id: ''
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
                Semester
                <select
                  value={form.semester_id}
                  disabled={!form.academic_year_id}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      semester_id: event.target.value,
                      cohort_type_id: ''
                    }))
                  }
                >
                  <option value=''>Select semester</option>
                  {semesters
                    .filter(
                      semester =>
                        String(
                          semester.academic_year_id ??
                            semester.academicYearId
                        ) === String(form.academic_year_id)
                    )
                    .map(semester => (
                      <option key={semester.id} value={semester.id}>
                        {semester.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Cohort type
                <select
                  value={form.cohort_type_id}
                  disabled={!form.programme_id || !form.semester_id}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      cohort_type_id: event.target.value
                    }))
                  }
                >
                  <option value=''>Select cohort type</option>
                  {cohortTypes
                    .filter(
                      type =>
                        !selectedCreateSemester ||
                        Number(type.semester_number) ===
                          Number(selectedCreateSemester.number)
                    )
                    .map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name} (Year {type.study_year}, Semester{' '}
                        {type.semester_number})
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Intake year
                <input
                  type='number'
                  min='1900'
                  step='1'
                  value={form.intake_year}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      intake_year: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Student count
                <input
                  type='number'
                  min='0'
                  step='1'
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
                  <th>Intake</th>
                  <th>Current stage</th>
                  <th>Current period</th>
                  <th>Students</th>
                  <th>Profiles submitted</th>
                  {canManageProgression && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visibleCohorts.length ? (
                  visibleCohorts.map(item => (
                    <tr key={item.id ?? item.name}>
                      <td>
                        {item.name || item.cohort_name || 'Untitled cohort'}
                      </td>
                      <td>
                        {programmes.find(
                          value =>
                            String(value.id) ===
                            String(item.programme_id ?? item.programmeId)
                        )?.name || '—'}
                      </td>
                      <td>{item.intake_year || 'Needs reconciliation'}</td>
                      <td>{item.current_cohort_type_name || 'Needs setup'}</td>
                      <td>
                        {item.current_semester_name &&
                        item.current_academic_year_name
                          ? `${item.current_semester_name}, ${item.current_academic_year_name}`
                          : 'Needs setup'}
                      </td>
                      <td>{item.student_count ?? item.studentCount ?? 0}</td>
                      <td>
                        {item.submitted_profile_count ?? 0}
                        {Number(item.pending_profile_count) > 0 &&
                          ` (${item.pending_profile_count} pending)`}
                      </td>
                      {canManageProgression && (
                        <td>
                          <button
                            type='button'
                            className='table-action'
                            onClick={() => {
                              setSelectedCohort(item)
                              setIntakeYear(String(item.intake_year || ''))
                              setProgressionForm({
                                academic_year_id: '',
                                semester_id: '',
                                cohort_type_id: '',
                                student_count: String(
                                  item.student_count ?? item.studentCount ?? 0
                                )
                              })
                              setFormError('')
                            }}
                          >
                            Progression history
                          </button>
                          {canManageCohorts && (
                            <>
                              {' '}
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
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canManageProgression ? 8 : 7}>
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

      {selectedCohort && canManageProgression && (
        <div
          className='profile-modal-backdrop'
          onClick={() => setSelectedCohort(null)}
        >
          <section
            className='profile-modal content-panel'
            onClick={event => event.stopPropagation()}
          >
            <div className='page-header'>
              <div>
                <p className='eyebrow'>Cohort progression</p>
                <h2>{selectedCohort.name}</h2>
              </div>
              <button
                type='button'
                className='secondary-button'
                onClick={() => setSelectedCohort(null)}
              >
                Close
              </button>
            </div>
            <section>
              <h3>Student profile submissions</h3>
              {membershipRequests.length ? (
                <div className='academic-records-scroll'>
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Student number</th>
                        <th>Academic period</th>
                        <th>Cohort type</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {membershipRequests.map(request => (
                        <tr key={request.id}>
                          <td>
                            {request.first_name} {request.last_name}
                            <br />
                            {request.email}
                          </td>
                          <td>{request.student_number || '—'}</td>
                          <td>
                            {request.semester_name}, {request.academic_year_name}
                          </td>
                          <td>{request.cohort_type_name}</td>
                          <td>
                            <button
                              type='button'
                              className='table-action'
                              disabled={reviewMembershipMutation.isPending}
                              onClick={() =>
                                reviewMembershipMutation.mutate({
                                  requestId: request.id,
                                  decision: 'APPROVED'
                                })
                              }
                            >
                              Approve
                            </button>{' '}
                            <button
                              type='button'
                              className='table-action danger'
                              disabled={reviewMembershipMutation.isPending}
                              onClick={() =>
                                reviewMembershipMutation.mutate({
                                  requestId: request.id,
                                  decision: 'REJECTED'
                                })
                              }
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className='muted'>No student profiles are awaiting review.</p>
              )}
              {reviewMembershipMutation.error && (
                <p className='form-error'>
                  {reviewMembershipMutation.error.message}
                </p>
              )}
            </section>
            <form
              className='stack-form academic-mobile-single-column-form'
              onSubmit={handleProgressionSubmit}
            >
              <h3>Progression history</h3>
              {progressionsLoading ? (
                <p>Loading progression history...</p>
              ) : progressionsError ? (
                <p className='form-error'>
                  Unable to load this cohort's progression history.
                </p>
              ) : progressions.length ? (
                <div className='academic-records-scroll'>
                  <table>
                    <thead>
                      <tr>
                        <th>Academic year</th>
                        <th>Semester</th>
                        <th>Stage</th>
                        <th>Students</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progressions.map(item => (
                        <tr key={item.id}>
                          <td>{item.academic_year_name}</td>
                          <td>{item.semester_name}</td>
                          <td>{item.cohort_type_name}</td>
                          <td>{item.student_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className='muted'>
                  No progression records are available. Add a verified period
                  below; legacy records are not automatically inferred.
                </p>
              )}
              <h3>Add academic period</h3>
              {canManageCohorts && !selectedCohort.intake_year && (
                <div className='stack-form'>
                  <label>
                    Reconcile intake year
                    <input
                      type='number'
                      min='1900'
                      step='1'
                      value={intakeYear}
                      onChange={event => setIntakeYear(event.target.value)}
                    />
                  </label>
                  <button
                    type='button'
                    className='secondary-button'
                    onClick={handleIntakeReconciliation}
                    disabled={reconcileIntakeMutation.isPending}
                  >
                    {reconcileIntakeMutation.isPending
                      ? 'Saving...'
                      : 'Save intake identity'}
                  </button>
                </div>
              )}
              <div className='form-grid'>
                <label>
                  Academic year
                  <select
                    value={progressionForm.academic_year_id}
                    onChange={event =>
                      setProgressionForm(current => ({
                        ...current,
                        academic_year_id: event.target.value,
                        semester_id: '',
                        cohort_type_id: ''
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
                  Semester
                  <select
                    value={progressionForm.semester_id}
                    disabled={!progressionForm.academic_year_id}
                    onChange={event =>
                      setProgressionForm(current => ({
                        ...current,
                        semester_id: event.target.value,
                        cohort_type_id: ''
                      }))
                    }
                  >
                    <option value=''>Select semester</option>
                    {semesters
                      .filter(
                        semester =>
                          String(
                            semester.academic_year_id ??
                              semester.academicYearId
                          ) === String(progressionForm.academic_year_id)
                      )
                      .map(semester => (
                        <option key={semester.id} value={semester.id}>
                          {semester.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Cohort type
                  <select
                    value={progressionForm.cohort_type_id}
                    disabled={!progressionForm.semester_id}
                    onChange={event =>
                      setProgressionForm(current => ({
                        ...current,
                        cohort_type_id: event.target.value
                      }))
                    }
                  >
                    <option value=''>Select cohort type</option>
                    {progressionTypes
                      .filter(
                        type =>
                          !selectedProgressionSemester ||
                          Number(type.semester_number) ===
                            Number(selectedProgressionSemester.number)
                      )
                      .map(type => (
                        <option key={type.id} value={type.id}>
                          {type.name} (Year {type.study_year}, Semester{' '}
                          {type.semester_number})
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Student count
                  <input
                    type='number'
                    min='0'
                    step='1'
                    value={progressionForm.student_count}
                    onChange={event =>
                      setProgressionForm(current => ({
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
                  disabled={createProgressionMutation.isPending}
                >
                  {createProgressionMutation.isPending
                    ? 'Saving...'
                    : 'Add progression'}
                </button>
                <button
                  type='button'
                  className='secondary-button'
                  onClick={() => setSelectedCohort(null)}
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

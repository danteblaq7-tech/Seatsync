import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import ConfirmActionModal from '../components/ConfirmActionModal'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

const emptyStudent = {
  first_name: '',
  last_name: '',
  student_number: '',
  cohort_id: '',
  status: 'ACTIVE'
}

export default function StudentsPage () {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyStudent)
  const [formError, setFormError] = useState('')
  const [studentToDelete, setStudentToDelete] = useState(null)

  useEffect(() => {
    if (!formError) return undefined
    const timeout = setTimeout(() => setFormError(''), 5000)
    return () => clearTimeout(timeout)
  }, [formError])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')

  const {
    data = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const response = await api.get('/api/academic/students')
      return toArray(response)
    }
  })

  const { data: cohorts = [] } = useQuery({
    queryKey: ['student-cohorts'],
    queryFn: async () => {
      const response = await api.get('/api/academic/cohorts')
      return toArray(response)
    }
  })

  const cohortNameMap = Object.fromEntries(
    (cohorts || []).map(cohort => [String(cohort.id), cohort.name])
  )

  const visibleStudents = useMemo(() => {
    return [...data]
      .filter(item => {
        const name =
          item.name || `${item.first_name || ''} ${item.last_name || ''}`
        const text = `${name} ${item.email || ''} ${
          item.phoneNumber || item.phone_number || ''
        } ${item.student_number || ''}`.toLowerCase()
        return (
          text.includes(search.toLowerCase()) &&
          (statusFilter === 'all' || (item.status || 'ACTIVE') === statusFilter)
        )
      })
      .sort((first, second) => {
        const firstValue = String(
          sortBy === 'status'
            ? first.status || ''
            : sortBy === 'email'
            ? first.email || ''
            : first.name || ''
        ).toLowerCase()
        const secondValue = String(
          sortBy === 'status'
            ? second.status || ''
            : sortBy === 'email'
            ? second.email || ''
            : second.name || ''
        ).toLowerCase()
        return firstValue.localeCompare(secondValue)
      })
  }, [data, search, sortBy, statusFilter])

  const createStudentMutation = useMutation({
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

  const deleteStudentMutation = useMutation({
    mutationFn: async id => {
      await api.del(`/api/academic/students/${id}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['students'] })
  })

  const handleSubmit = event => {
    event.preventDefault()

    if (
      !form.first_name ||
      !form.last_name ||
      !form.student_number ||
      !form.cohort_id
    ) {
      setFormError(
        'First name, last name, student number, and cohort are required.'
      )
      return
    }

    createStudentMutation.mutate({
      ...form,
      cohort_id: Number(form.cohort_id) || null,
      is_active: true
    })
  }

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Student records</p>
          <h1>Students</h1>
        </div>

        <div className='toolbar-actions'>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder='Search students'
          />
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
          >
            <option value='all'>All statuses</option>
            <option value='ACTIVE'>Active</option>
            <option value='INACTIVE'>Inactive</option>
          </select>
          <select
            value={sortBy}
            onChange={event => setSortBy(event.target.value)}
          >
            <option value='name'>Sort by name</option>
            <option value='email'>Sort by email</option>
            <option value='status'>Sort by status</option>
          </select>
          <button
            type='button'
            className='primary-button'
            onClick={() => setShowForm(value => !value)}
          >
            {showForm ? 'Close form' : 'Add student'}
          </button>
        </div>
      </div>

      {showForm && (
        <section className='content-panel'>
          <form className='stack-form' onSubmit={handleSubmit}>
            <div className='form-grid'>
              <label>
                First name
                <input
                  value={form.first_name}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      first_name: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Last name
                <input
                  value={form.last_name}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      last_name: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Student number
                <input
                  value={form.student_number}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      student_number: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Cohort
                <select
                  value={form.cohort_id}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      cohort_id: event.target.value
                    }))
                  }
                >
                  <option value=''>Select cohort</option>
                  {(cohorts || []).map(cohort => (
                    <option
                      key={cohort.id ?? cohort.name}
                      value={cohort.id ?? cohort.name}
                    >
                      {cohort.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={form.status}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      status: event.target.value
                    }))
                  }
                >
                  <option value='ACTIVE'>Active</option>
                  <option value='INACTIVE'>Inactive</option>
                </select>
              </label>
            </div>

            {formError && <p className='form-error'>{formError}</p>}

            <div className='toolbar-actions'>
              <button
                type='submit'
                className='primary-button'
                disabled={createStudentMutation.isPending}
              >
                {createStudentMutation.isPending ? 'Saving...' : 'Save student'}
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
        {isLoading ? (
          <p>Loading students...</p>
        ) : error ? (
          <p className='form-error'>Unable to load students.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Student ID</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Cohort</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.length ? (
                visibleStudents.map(item => (
                  <tr key={item.id ?? item.student_number}>
                    <td>
                      {item.name ||
                        `${item.first_name || ''} ${
                          item.last_name || ''
                        }`.trim() ||
                        'Student'}
                    </td>
                    <td>{item.email || 'N/A'}</td>
                    <td>{item.phoneNumber || item.phone_number || 'N/A'}</td>
                    <td>
                      {item.student_number || item.studentNumber || 'N/A'}
                    </td>
                    <td>
                      {cohortNameMap[String(item.cohort_id ?? item.cohortId)] ||
                        item.cohort ||
                        'Unassigned'}
                    </td>
                    <td>{item.status || 'ACTIVE'}</td>
                    <td>
                      <button
                        type='button'
                        className='table-action danger'
                        onClick={() => setStudentToDelete(item)}
                        disabled={deleteStudentMutation.isPending}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan='7'>No students found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
      {studentToDelete && (
        <ConfirmActionModal
          title='Delete student?'
          message={`Delete ${
            studentToDelete.name ||
            `${studentToDelete.first_name || ''} ${
              studentToDelete.last_name || ''
            }`.trim()
          }? This deletion will be recorded in the audit history.`}
          isPending={deleteStudentMutation.isPending}
          onCancel={() => setStudentToDelete(null)}
          onConfirm={() =>
            deleteStudentMutation.mutate(studentToDelete.id, {
              onSuccess: () => setStudentToDelete(null)
            })
          }
        />
      )}
    </div>
  )
}

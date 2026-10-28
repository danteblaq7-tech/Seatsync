import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import ConfirmActionModal from '../components/ConfirmActionModal'
import PaginationControls from '../components/PaginationControls'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

const emptyAcademicInfo = {
  title: '',
  facultyIds: [],
  departmentIds: [],
  programmeIds: [],
  unitIds: []
}

export default function LecturersPage () {
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

  const {
    data = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['lecturers'],
    queryFn: async () => {
      const response = await api.get('/api/academic/lecturers')
      return toArray(response)
    }
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['lecturer-departments'],
    queryFn: async () => {
      const response = await api.get('/api/academic/departments')
      return toArray(response)
    }
  })

  const { data: optionsResponse, isLoading: optionsLoading } = useQuery({
    queryKey: ['lecturer-academic-edit-options'],
    queryFn: () => api.get('/api/auth/registration-options')
  })
  const options = optionsResponse?.data || {}
  const faculties = Array.isArray(options.faculties) ? options.faculties : []
  const programmes = Array.isArray(options.programmes) ? options.programmes : []
  const units = Array.isArray(options.units) ? options.units : []

  const departmentNameMap = Object.fromEntries(
    (departments || []).map(department => [
      String(department.id),
      department.name || department.code
    ])
  )

  const visibleLecturers = useMemo(() => {
    return [...data]
      .filter(item => {
        const name =
          item.name || `${item.first_name || ''} ${item.last_name || ''}`
        const text = `${name} ${item.email || ''} ${
          item.phoneNumber || item.phone_number || ''
        } ${item.staff_number || ''}`.toLowerCase()
        const status =
          item.employment_status ||
          item.employmentStatus ||
          item.status ||
          'ACTIVE'
        return (
          text.includes(search.toLowerCase()) &&
          (statusFilter === 'all' || status === statusFilter)
        )
      })
      .sort((first, second) => {
        const firstValue = String(
          sortBy === 'status'
            ? first.employment_status || first.status || ''
            : sortBy === 'email'
            ? first.email || ''
            : first.name || ''
        ).toLowerCase()
        const secondValue = String(
          sortBy === 'status'
            ? second.employment_status || second.status || ''
            : sortBy === 'email'
            ? second.email || ''
            : second.name || ''
        ).toLowerCase()
        return firstValue.localeCompare(secondValue)
      })
  }, [data, search, sortBy, statusFilter])

  const totalPages = Math.max(1, Math.ceil(visibleLecturers.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedLecturers = visibleLecturers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const availableDepartments = departments.filter(item =>
    academicInfo.facultyIds.includes(String(item.faculty_id ?? item.facultyId))
  )
  const availableProgrammes = programmes.filter(item =>
    academicInfo.departmentIds.includes(
      String(item.department_id ?? item.departmentId)
    )
  )
  const availableUnits = units.filter(unit =>
    (unit.programmeIds || unit.programme_ids || []).some(id =>
      academicInfo.programmeIds.includes(String(id))
    )
  )

  const updateAcademicInfoMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      api.put(`/api/academic/lecturers/${id}/academic-details`, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lecturers'] }),
        queryClient.invalidateQueries({ queryKey: ['timetable'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] })
      ])
      setEditingLecturer(null)
      setEditError('')
    },
    onError: error =>
      setEditError(
        error.message || 'Unable to update lecturer academic information.'
      )
  })

  const deleteLecturerMutation = useMutation({
    mutationFn: async id => {
      await api.del(`/api/academic/lecturers/${id}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lecturers'] })
  })

  const openAcademicEditor = async lecturer => {
    setEditError('')
    setEditingLecturer(lecturer)
    setAcademicInfo(emptyAcademicInfo)
    try {
      const response = await api.get(
        `/api/academic/lecturers/${lecturer.id}/academic-details`
      )
      const profile = response?.data || {}
      setAcademicInfo({
        title: profile.title || '',
        facultyIds: (profile.facultyIds || []).map(String),
        departmentIds: (profile.departmentIds || []).map(String),
        programmeIds: (profile.programmeIds || []).map(String),
        unitIds: (profile.unitIds || []).map(String)
      })
    } catch (error) {
      setEditError(
        error.message || 'Unable to load lecturer academic information.'
      )
    }
  }

  const toggleFaculty = (id, checked) => {
    setAcademicInfo(current => {
      const facultyIds = checked
        ? [...new Set([...current.facultyIds, String(id)])]
        : current.facultyIds.filter(value => value !== String(id))
      const departmentIds = current.departmentIds.filter(departmentId => {
        const department = departments.find(
          item => String(item.id) === departmentId
        )
        return (
          department &&
          facultyIds.includes(
            String(department.faculty_id ?? department.facultyId)
          )
        )
      })
      const programmeIds = current.programmeIds.filter(programmeId => {
        const programme = programmes.find(
          item => String(item.id) === programmeId
        )
        return (
          programme &&
          departmentIds.includes(
            String(programme.department_id ?? programme.departmentId)
          )
        )
      })
      const unitIds = current.unitIds.filter(unitId => {
        const unit = units.find(item => String(item.id) === unitId)
        return (
          unit &&
          (unit.programmeIds || unit.programme_ids || []).some(id =>
            programmeIds.includes(String(id))
          )
        )
      })
      return { ...current, facultyIds, departmentIds, programmeIds, unitIds }
    })
  }

  const toggleDepartment = (id, checked) => {
    setAcademicInfo(current => {
      const departmentIds = checked
        ? [...new Set([...current.departmentIds, String(id)])]
        : current.departmentIds.filter(value => value !== String(id))
      const programmeIds = current.programmeIds.filter(programmeId => {
        const programme = programmes.find(
          item => String(item.id) === programmeId
        )
        return (
          programme &&
          departmentIds.includes(
            String(programme.department_id ?? programme.departmentId)
          )
        )
      })
      const unitIds = current.unitIds.filter(unitId => {
        const unit = units.find(item => String(item.id) === unitId)
        return (
          unit &&
          (unit.programmeIds || unit.programme_ids || []).some(id =>
            programmeIds.includes(String(id))
          )
        )
      })
      return { ...current, departmentIds, programmeIds, unitIds }
    })
  }

  const toggleProgramme = (id, checked) => {
    setAcademicInfo(current => {
      const programmeIds = checked
        ? [...new Set([...current.programmeIds, String(id)])]
        : current.programmeIds.filter(value => value !== String(id))
      const unitIds = current.unitIds.filter(unitId => {
        const unit = units.find(item => String(item.id) === unitId)
        return (
          unit &&
          (unit.programmeIds || unit.programme_ids || []).some(value =>
            programmeIds.includes(String(value))
          )
        )
      })
      return { ...current, programmeIds, unitIds }
    })
  }

  const submitAcademicInfo = event => {
    event.preventDefault()
    setEditError('')
    if (
      !academicInfo.facultyIds.length ||
      !academicInfo.departmentIds.length ||
      !academicInfo.programmeIds.length ||
      !academicInfo.unitIds.length
    ) {
      setEditError(
        'Select at least one faculty, department, programme, and unit.'
      )
      return
    }
    updateAcademicInfoMutation.mutate({
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

  const academicCheckboxGroup = (title, rows, field, toggle, emptyMessage) => (
    <fieldset className='selection-container lecturer-edit-group'>
      <legend>{title}</legend>
      <div className='checkbox-list lecturer-edit-checkboxes'>
        {rows.map(item => (
          <label key={item.id} className='checkbox-option'>
            <input
              type='checkbox'
              checked={academicInfo[field].includes(String(item.id))}
              onChange={event => toggle(item.id, event.target.checked)}
            />
            <span>
              {item.code ? `${item.code} · ` : ''}
              {item.name || item.code}
            </span>
          </label>
        ))}
        {!rows.length && <small>{emptyMessage}</small>}
      </div>
    </fieldset>
  )

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Academic staff</p>
          <h1>Lecturers</h1>
        </div>

        <div className='toolbar-actions'>
          <input
            value={search}
            onChange={event => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder='Search lecturers'
          />
          <select
            value={statusFilter}
            onChange={event => {
              setStatusFilter(event.target.value)
              setPage(1)
            }}
          >
            <option value='all'>All statuses</option>
            <option value='ACTIVE'>Active</option>
            <option value='INACTIVE'>Inactive</option>
          </select>
          <select
            value={sortBy}
            onChange={event => {
              setSortBy(event.target.value)
              setPage(1)
            }}
          >
            <option value='name'>Sort by name</option>
            <option value='email'>Sort by email</option>
            <option value='status'>Sort by status</option>
          </select>
          <span className='lecturer-count-chip'>
            {visibleLecturers.length} lecturers
          </span>
        </div>
      </div>

      <section className='content-panel table-panel lecturers-panel'>
        {isLoading ? (
          <p>Loading lecturers...</p>
        ) : error ? (
          <p className='form-error'>Unable to load lecturers.</p>
        ) : (
          <div className='lecturers-table-viewport'>
            <table className='lecturers-table'>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Department</th>
                  <th>Units</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLecturers.length ? (
                  paginatedLecturers.map(item => (
                    <tr key={item.id ?? item.staff_number}>
                      <td>
                        {item.name ||
                          `${item.first_name || ''} ${
                            item.last_name || ''
                          }`.trim() ||
                          item.title ||
                          'Lecturer'}
                      </td>
                      <td>{item.email || 'N/A'}</td>
                      <td>{item.phoneNumber || item.phone_number || 'N/A'}</td>
                      <td>
                        {departmentNameMap[
                          String(item.department_id ?? item.departmentId)
                        ] ||
                          item.department ||
                          'General'}
                      </td>
                      <td>
                        {item.units?.length ? item.units.join(', ') : 'N/A'}
                      </td>
                      <td>
                        {item.employment_status ||
                          item.employmentStatus ||
                          item.status ||
                          'ACTIVE'}
                      </td>
                      <td>
                        <button
                          type='button'
                          className='table-action'
                          onClick={() => openAcademicEditor(item)}
                        >
                          Edit academic info
                        </button>
                        <button
                          type='button'
                          className='table-action danger'
                          onClick={() => setLecturerToDelete(item)}
                          disabled={deleteLecturerMutation.isPending}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan='7'>No lecturers found.</td>
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
            totalItems={visibleLecturers.length}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={size => {
              setPageSize(size)
              setPage(1)
            }}
          />
        )}
      </section>
      {editingLecturer && (
        <div className='profile-modal-backdrop' role='presentation'>
          <section
            className='profile-modal content-panel lecturer-edit-modal'
            role='dialog'
            aria-modal='true'
            aria-labelledby='lecturer-edit-title'
          >
            <p className='eyebrow'>Lecturer registration details</p>
            <h2 id='lecturer-edit-title'>Edit academic information</h2>
            <p className='muted'>
              Update academic selections captured during registration. Removing
              a parent automatically clears its dependent selections.
            </p>
            {optionsLoading ? (
              <p>Loading academic options…</p>
            ) : (
              <form className='stack-form' onSubmit={submitAcademicInfo}>
                <label>
                  Academic title
                  <input
                    value={academicInfo.title}
                    onChange={event =>
                      setAcademicInfo(current => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                    placeholder='e.g. Dr, Professor'
                  />
                </label>
                <div className='lecturer-edit-selections'>
                  {academicCheckboxGroup(
                    'Faculties',
                    faculties,
                    'facultyIds',
                    toggleFaculty,
                    'No faculties configured.'
                  )}
                  {academicCheckboxGroup(
                    'Departments',
                    availableDepartments,
                    'departmentIds',
                    toggleDepartment,
                    'Select a faculty first.'
                  )}
                  {academicCheckboxGroup(
                    'Programmes',
                    availableProgrammes,
                    'programmeIds',
                    toggleProgramme,
                    'Select a department first.'
                  )}
                  {academicCheckboxGroup(
                    'Units',
                    availableUnits,
                    'unitIds',
                    (id, checked) =>
                      setAcademicInfo(current => ({
                        ...current,
                        unitIds: checked
                          ? [...new Set([...current.unitIds, String(id)])]
                          : current.unitIds.filter(
                              value => value !== String(id)
                            )
                      })),
                    'Select a programme first.'
                  )}
                </div>
                {editError && <p className='form-error'>{editError}</p>}
                <div className='toolbar-actions'>
                  <button
                    type='submit'
                    className='primary-button'
                    disabled={
                      updateAcademicInfoMutation.isPending || optionsLoading
                    }
                  >
                    {updateAcademicInfoMutation.isPending
                      ? 'Saving…'
                      : 'Save academic info'}
                  </button>
                  <button
                    type='button'
                    className='secondary-button'
                    onClick={() => setEditingLecturer(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      {lecturerToDelete && (
        <ConfirmActionModal
          title='Delete lecturer?'
          message={`Delete ${
            lecturerToDelete.name ||
            `${lecturerToDelete.first_name || ''} ${
              lecturerToDelete.last_name || ''
            }`.trim()
          }? This deletion will be recorded in the audit history.`}
          isPending={deleteLecturerMutation.isPending}
          onCancel={() => setLecturerToDelete(null)}
          onConfirm={() =>
            deleteLecturerMutation.mutate(lecturerToDelete.id, {
              onSuccess: () => setLecturerToDelete(null)
            })
          }
        />
      )}
    </div>
  )
}

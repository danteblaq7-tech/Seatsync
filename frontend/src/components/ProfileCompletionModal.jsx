import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function ProfileCompletionModal ({ role }) {
  const queryClient = useQueryClient()
  const { logout } = useAuth()
  const [departmentSearch, setDepartmentSearch] = useState('')
  const [programmeSearch, setProgrammeSearch] = useState('')
  const [form, setForm] = useState({
    facultyIds: [],
    departmentIds: [],
    programmeIds: [],
    unitIds: [],
    programmeId: '',
    academicYearId: '',
    currentYear: '1'
  })
  const [error, setError] = useState('')
  useEffect(() => {
    if (!error) return undefined
    const timeout = setTimeout(() => setError(''), 5000)
    return () => clearTimeout(timeout)
  }, [error])
  const { data: options = {} } = useQuery({
    queryKey: ['profile-options'],
    queryFn: async () =>
      (await api.get('/api/auth/registration-options')).data || {}
  })
  const departments = options.departments || []
  const programmes = options.programmes || []
  const units = options.units || []
  const facultyDepartments = useMemo(
    () =>
      departments.filter(item =>
        form.facultyIds.includes(String(item.faculty_id ?? item.facultyId))
      ),
    [departments, form.facultyIds]
  )
  const selectedProgrammes = useMemo(
    () =>
      programmes.filter(item =>
        form.departmentIds.includes(
          String(item.department_id ?? item.departmentId)
        )
      ),
    [programmes, form.departmentIds]
  )
  const visibleDepartments = useMemo(() => {
    const needle = departmentSearch.trim().toLowerCase()
    return facultyDepartments.filter(item =>
      `${item.name || ''} ${item.code || ''}`.toLowerCase().includes(needle)
    )
  }, [departmentSearch, facultyDepartments])
  const visibleProgrammes = useMemo(() => {
    const needle = programmeSearch.trim().toLowerCase()
    return selectedProgrammes.filter(item =>
      `${item.name || ''} ${item.code || ''}`.toLowerCase().includes(needle)
    )
  }, [programmeSearch, selectedProgrammes])
  const selectedUnits = useMemo(
    () =>
      units.filter(item =>
        (item.programmeIds || []).some(id =>
          form.programmeIds.includes(String(id))
        )
      ),
    [units, form.programmeIds]
  )

  const mutation = useMutation({
    mutationFn: payload => api.post('/api/auth/complete-profile', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-status'] })
      setError('')
    },
    onError: err => setError(err.message || 'Unable to save academic profile.')
  })

  const toggle = (field, value) =>
    setForm(current => ({
      ...current,
      [field]: current[field].includes(String(value))
        ? current[field].filter(item => item !== String(value))
        : [...current[field], String(value)]
    }))

  const toggleFaculty = (facultyId, checked) => {
    setForm(current => {
      const facultyIds = checked
        ? [...new Set([...current.facultyIds, String(facultyId)])]
        : current.facultyIds.filter(id => id !== String(facultyId))
      const departmentIds = current.departmentIds.filter(id => {
        const department = departments.find(item => String(item.id) === id)
        return (
          department &&
          facultyIds.includes(
            String(department.faculty_id ?? department.facultyId)
          )
        )
      })
      const programmeIds = current.programmeIds.filter(id => {
        const programme = programmes.find(item => String(item.id) === id)
        return (
          programme &&
          departmentIds.includes(
            String(programme.department_id ?? programme.departmentId)
          )
        )
      })
      const unitIds = current.unitIds.filter(id => {
        const unit = units.find(item => String(item.id) === id)
        return (
          unit &&
          (unit.programmeIds || []).some(programmeId =>
            programmeIds.includes(String(programmeId))
          )
        )
      })
      return { ...current, facultyIds, departmentIds, programmeIds, unitIds }
    })
  }

  const toggleDepartment = (departmentId, checked) => {
    setForm(current => {
      const departmentIds = checked
        ? [...new Set([...current.departmentIds, String(departmentId)])]
        : current.departmentIds.filter(id => id !== String(departmentId))
      const programmeIds = current.programmeIds.filter(id => {
        const programme = programmes.find(item => String(item.id) === id)
        return (
          programme &&
          departmentIds.includes(
            String(programme.department_id ?? programme.departmentId)
          )
        )
      })
      const unitIds = current.unitIds.filter(id => {
        const unit = units.find(item => String(item.id) === id)
        return (
          unit &&
          (unit.programmeIds || []).some(programmeId =>
            programmeIds.includes(String(programmeId))
          )
        )
      })
      return { ...current, departmentIds, programmeIds, unitIds }
    })
  }

  const toggleProgramme = (programmeId, checked) => {
    setForm(current => {
      const programmeIds = checked
        ? [...new Set([...current.programmeIds, String(programmeId)])]
        : current.programmeIds.filter(id => id !== String(programmeId))
      const unitIds = current.unitIds.filter(id => {
        const unit = units.find(item => String(item.id) === id)
        return (
          unit &&
          (unit.programmeIds || []).some(id =>
            programmeIds.includes(String(id))
          )
        )
      })
      return { ...current, programmeIds, unitIds }
    })
  }
  const isLecturer = role === 'LECTURER'
  const submit = event => {
    event.preventDefault()
    setError('')
    if (isLecturer) {
      if (
        !form.facultyIds.length ||
        !form.departmentIds.length ||
        !form.programmeIds.length ||
        !form.unitIds.length
      )
        return setError(
          'Select at least one faculty, department, programme, and unit.'
        )
      mutation.mutate(form)
    } else {
      if (!form.academicYearId || !form.programmeId || !form.currentYear)
        return setError(
          'Select your academic year, current year, and programme.'
        )
      mutation.mutate(form)
    }
  }

  return (
    <div className='profile-modal-backdrop'>
      <section className='profile-modal content-panel'>
        <p className='eyebrow'>Complete academic profile</p>
        <h2>{isLecturer ? 'Teaching assignments' : 'Student information'}</h2>
        <p className='muted'>
          Complete these details before using the academic workspace. Removing a
          faculty, department, or programme also clears its dependent
          selections.
        </p>
        <form className='stack-form profile-completion-form' onSubmit={submit}>
          {isLecturer ? (
            <>
              <fieldset className='selection-container'>
                <legend>Faculties</legend>
                <div className='checkbox-list lecturer-profile-checkboxes'>
                  {(options.faculties || []).map(item => (
                    <label key={item.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        checked={form.facultyIds.includes(String(item.id))}
                        onChange={event =>
                          toggleFaculty(item.id, event.target.checked)
                        }
                      />
                      <span>{item.name || item.code}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className='selection-container'>
                <legend>Departments</legend>
                <input
                  type='search'
                  value={departmentSearch}
                  onChange={event => setDepartmentSearch(event.target.value)}
                  placeholder='Search departments by name or code'
                  aria-label='Search departments by name or code'
                  disabled={!form.facultyIds.length}
                />
                <div className='checkbox-list lecturer-profile-checkboxes'>
                  {visibleDepartments.map(item => (
                    <label key={item.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        checked={form.departmentIds.includes(String(item.id))}
                        onChange={event =>
                          toggleDepartment(item.id, event.target.checked)
                        }
                      />
                      <span>{item.name || item.code}</span>
                    </label>
                  ))}
                  {!form.facultyIds.length && (
                    <small>Select a faculty first.</small>
                  )}
                  {form.facultyIds.length > 0 && !visibleDepartments.length && (
                    <small>No departments match that search.</small>
                  )}
                </div>
              </fieldset>
              <fieldset className='selection-container'>
                <legend>Programmes</legend>
                <input
                  type='search'
                  value={programmeSearch}
                  onChange={event => setProgrammeSearch(event.target.value)}
                  placeholder='Search programmes by name or code'
                  aria-label='Search programmes by name or code'
                  disabled={!form.departmentIds.length}
                />
                <div className='checkbox-list lecturer-profile-checkboxes'>
                  {visibleProgrammes.map(item => (
                    <label key={item.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        checked={form.programmeIds.includes(String(item.id))}
                        onChange={event =>
                          toggleProgramme(item.id, event.target.checked)
                        }
                      />
                      <span>{item.name || item.code}</span>
                    </label>
                  ))}
                  {!form.departmentIds.length && (
                    <small>Select a department first.</small>
                  )}
                  {form.departmentIds.length > 0 &&
                    !visibleProgrammes.length && (
                      <small>No programmes match that search.</small>
                    )}
                </div>
              </fieldset>
              <fieldset className='selection-container'>
                <legend>Units</legend>
                <div className='checkbox-list lecturer-profile-checkboxes'>
                  {selectedUnits.map(item => (
                    <label key={item.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        checked={form.unitIds.includes(String(item.id))}
                        onChange={() => toggle('unitIds', item.id)}
                      />
                      <span>
                        {item.code} - {item.name}
                      </span>
                    </label>
                  ))}
                  {!form.programmeIds.length && (
                    <small>Select a programme first.</small>
                  )}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <label>
                Academic year
                <select
                  value={form.academicYearId}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      academicYearId: event.target.value
                    }))
                  }
                >
                  <option value=''>Select academic year</option>
                  {(options.academicYears || []).map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Current year
                <select
                  value={form.currentYear}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      currentYear: event.target.value
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5, 6].map(item => (
                    <option key={item} value={item}>
                      Year {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Programme
                <select
                  value={form.programmeId}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      programmeId: event.target.value
                    }))
                  }
                >
                  <option value=''>Select programme</option>
                  {programmes.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.code}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {error && <p className='form-error'>{error}</p>}
          <button
            type='submit'
            className='primary-button'
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving...' : 'Save academic profile'}
          </button>
        </form>
        <div className='profile-completion-logout'>
          <button
            type='button'
            className='secondary-button'
            onClick={() => void logout()}
          >
            Log out
          </button>
        </div>
      </section>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

const EMPTY_LIST = []

const createAcademicForm = profile => ({
  facultyIds: [],
  departmentIds: [],
  programmeIds: [],
  unitIds: [],
  cohortTypeIds: [],
  facultyId: String(profile?.facultyId ?? profile?.faculty_id ?? ''),
  departmentId: String(profile?.departmentId ?? profile?.department_id ?? ''),
  programmeId: String(profile?.programmeId ?? profile?.programme_id ?? ''),
  academicYearId: String(
    profile?.academicYearId ?? profile?.academic_year_id ?? ''
  ),
  intakeYear: String(profile?.intakeYear ?? profile?.intake_year ?? ''),
  cohortTypeId: String(profile?.cohortTypeId ?? profile?.cohort_type_id ?? ''),
  studentCount: String(
    profile?.studentCount ??
      profile?.student_count ??
      profile?.cohort_student_count ??
      ''
  )
})

export default function ProfileCompletionModal ({
  role,
  variant = 'modal',
  initialProfile,
  editing = false,
  lockCohortIdentity = false,
  onCancel,
  onSaved
}) {
  const queryClient = useQueryClient()
  const { logout } = useAuth()
  const [departmentSearch, setDepartmentSearch] = useState('')
  const [programmeSearch, setProgrammeSearch] = useState('')
  const [formState, setFormState] = useState(() =>
    initialProfile ? createAcademicForm(initialProfile) : null
  )
  const isLecturer = role === 'LECTURER'
  const [error, setError] = useState('')
  useEffect(() => {
    if (!error) return undefined
    const timeout = setTimeout(() => setError(''), 20000)
    return () => clearTimeout(timeout)
  }, [error])
  const { data: options = {} } = useQuery({
    queryKey: ['profile-options'],
    queryFn: async () =>
      (await api.get('/api/auth/registration-options')).data || {}
  })
  const { data: savedProfileResponse } = useQuery({
    queryKey: ['student-academic-profile', 'profile-modal'],
    queryFn: async () => (await api.get('/api/auth/student-profile')).data,
    enabled: !isLecturer && !initialProfile
  })
  const savedProfile =
    savedProfileResponse?.cohortProfileRequest ||
    savedProfileResponse?.membershipRequest ||
    savedProfileResponse?.student
  const form = formState || createAcademicForm(initialProfile || savedProfile)
  const setForm = update =>
    setFormState(current => {
      const currentForm =
        current || createAcademicForm(initialProfile || savedProfile)
      return typeof update === 'function' ? update(currentForm) : update
    })
  const departments = Array.isArray(options.departments)
    ? options.departments
    : EMPTY_LIST
  const programmes = Array.isArray(options.programmes)
    ? options.programmes
    : EMPTY_LIST
  const units = Array.isArray(options.units) ? options.units : EMPTY_LIST
  const { data: lecturerCohortTypes = [] } = useQuery({
    queryKey: ['profile-lecturer-cohort-types', form.programmeIds],
    queryFn: async () => {
      const responses = await Promise.all(
        form.programmeIds.map(programmeId => {
          const params = new URLSearchParams({ programmeId })
          return api.get(`/api/academic/cohort-types?${params}`)
        })
      )
      return [
        ...new Map(
          responses
            .flatMap(response =>
              Array.isArray(response?.data) ? response.data : []
            )
            .map(item => [String(item.id), item])
        ).values()
      ]
    },
    enabled: isLecturer && form.programmeIds.length > 0
  })
  const { data: cohortTypes = [] } = useQuery({
    queryKey: ['profile-cohort-types', form.programmeId],
    queryFn: async () => {
      const params = new URLSearchParams({ programmeId: form.programmeId })
      const response = await api.get(`/api/academic/cohort-types?${params}`)
      return Array.isArray(response?.data) ? response.data : []
    },
    enabled: Boolean(form.programmeId)
  })
  const isClassRep = role === 'CLASS_REP'
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
    mutationFn: payload =>
      editing
        ? api.put('/api/auth/student-profile', payload)
        : api.post('/api/auth/complete-profile', payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile-status'] }),
        queryClient.invalidateQueries({ queryKey: ['student-academic-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['student-academic-profile', 'profile-modal'] })
      ])
      setError('')
      onSaved?.()
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
      const cohortTypeIds = current.cohortTypeIds.filter(id => {
        const type = lecturerCohortTypes.find(
          item => String(item.id) === String(id)
        )
        return type && programmeIds.includes(String(type.programme_id))
      })
      return {
        ...current,
        facultyIds,
        departmentIds,
        programmeIds,
        unitIds,
        cohortTypeIds
      }
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
      const cohortTypeIds = current.cohortTypeIds.filter(id => {
        const type = lecturerCohortTypes.find(
          item => String(item.id) === String(id)
        )
        return type && programmeIds.includes(String(type.programme_id))
      })
      return { ...current, departmentIds, programmeIds, unitIds, cohortTypeIds }
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
      const cohortTypeIds = current.cohortTypeIds.filter(id => {
        const type = lecturerCohortTypes.find(
          item => String(item.id) === String(id)
        )
        return type && programmeIds.includes(String(type.programme_id))
      })
      return { ...current, programmeIds, unitIds, cohortTypeIds }
    })
  }
  const submit = event => {
    event.preventDefault()
    setError('')
    if (isLecturer) {
      if (
        !form.facultyIds.length ||
        !form.departmentIds.length ||
        !form.programmeIds.length ||
        !form.unitIds.length ||
        !form.cohortTypeIds.length
      )
        return setError(
          'Select at least one faculty, department, programme, unit, and cohort type.'
        )
      mutation.mutate(form)
    } else {
      if (
        !form.academicYearId ||
        !form.intakeYear ||
        !form.facultyId ||
        !form.departmentId ||
        !form.programmeId ||
        !form.cohortTypeId ||
        (isClassRep && form.studentCount === '')
      )
        return setError(
          'Complete all academic profile fields before submitting.'
        )
      mutation.mutate(form)
    }
  }

  return (
    <div
      className={
        variant === 'page'
          ? 'student-academic-profile-editor'
          : 'profile-modal-backdrop'
      }
    >
      <section
        className={
          variant === 'page'
            ? 'content-panel'
            : 'profile-modal content-panel'
        }
      >
        {variant !== 'page' && (
          <>
            <p className='eyebrow'>Complete academic profile</p>
            <h2>
              {isLecturer
                ? 'Teaching assignments'
                : isClassRep
                  ? 'Cohort academic profile'
                  : 'Student academic profile'}
            </h2>
            <p className='muted'>
              Complete these details before using the academic workspace.
            </p>
          </>
        )}
        <form
          className={`stack-form profile-completion-form ${
            variant === 'page' ? 'student-academic-profile-form' : ''
          }`}
          onSubmit={submit}
        >
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
              <fieldset className='selection-container'>
                <legend>Cohort types you teach</legend>
                <div className='checkbox-list lecturer-profile-checkboxes'>
                  {lecturerCohortTypes.map(item => (
                    <label key={item.id} className='checkbox-option'>
                      <input
                        type='checkbox'
                        checked={form.cohortTypeIds.includes(String(item.id))}
                        onChange={() => toggle('cohortTypeIds', item.id)}
                      />
                      <span>
                        {item.name} (Year {item.study_year}, Semester{' '}
                        {item.semester_number})
                      </span>
                    </label>
                  ))}
                  {!form.programmeIds.length && (
                    <small>Select a programme first.</small>
                  )}
                  {form.programmeIds.length > 0 &&
                    !lecturerCohortTypes.length && (
                      <small>No cohort types are available for the selected programmes.</small>
                    )}
                </div>
              </fieldset>
            </>
          ) : (
            <div className='student-academic-profile-fields'>
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
                Intake year
                <input
                  type='number'
                  min='1900'
                  step='1'
                  value={form.intakeYear}
                  disabled={lockCohortIdentity}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      intakeYear: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Faculty
                <select
                  value={form.facultyId}
                  disabled={lockCohortIdentity}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      facultyId: event.target.value,
                      departmentId: '',
                      programmeId: '',
                      cohortTypeId: ''
                    }))
                  }
                >
                  <option value=''>Select faculty</option>
                  {(options.faculties || []).map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Department
                <select
                  value={form.departmentId}
                  disabled={!form.facultyId || lockCohortIdentity}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      departmentId: event.target.value,
                      programmeId: '',
                      cohortTypeId: ''
                    }))
                  }
                >
                  <option value=''>Select department</option>
                  {departments
                    .filter(
                      item =>
                        String(item.faculty_id ?? item.facultyId) ===
                        String(form.facultyId)
                    )
                    .map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name || item.code}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Programme
                <select
                  value={form.programmeId}
                  disabled={!form.departmentId || lockCohortIdentity}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      programmeId: event.target.value,
                      cohortTypeId: ''
                    }))
                  }
                >
                  <option value=''>Select programme</option>
                  {programmes
                    .filter(
                      item =>
                        String(item.department_id ?? item.departmentId) ===
                        String(form.departmentId)
                    )
                    .map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name || item.code}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Cohort type
                <select
                  value={form.cohortTypeId}
                  disabled={!form.programmeId}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      cohortTypeId: event.target.value
                    }))
                  }
                >
                  <option value=''>Select cohort type</option>
                  {cohortTypes.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} (Year {item.study_year}, Semester{' '}
                      {item.semester_number})
                    </option>
                  ))}
                </select>
              </label>
              {isClassRep && (
                <label>
                  Current student count
                  <input
                    type='number'
                    min='0'
                    step='1'
                    value={form.studentCount}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        studentCount: event.target.value
                      }))
                    }
                  />
                </label>
              )}
            </div>
          )}
          {error && <p className='form-error'>{error}</p>}
          <button
            type='submit'
            className='primary-button'
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? 'Saving...'
              : editing
              ? 'Save changes'
              : 'Save academic profile'}
          </button>
          {editing && onCancel && (
            <button
              type='button'
              className='secondary-button'
              onClick={onCancel}
              disabled={mutation.isPending}
            >
              Cancel
            </button>
          )}
        </form>
        {variant !== 'page' && (
          <div className='profile-completion-logout'>
            <button
              type='button'
              className='secondary-button'
              onClick={() => void logout()}
            >
              Log out
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

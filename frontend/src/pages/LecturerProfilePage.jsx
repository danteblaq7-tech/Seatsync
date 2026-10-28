import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

const list = value => (Array.isArray(value) ? value : [])
const asStrings = value => list(value).map(String)

export default function LecturerProfilePage () {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: '',
    facultyIds: [],
    departmentIds: [],
    programmeIds: [],
    unitIds: []
  })
  const [message, setMessage] = useState('')

  const { data: profileResponse, isLoading: profileLoading } = useQuery({
    queryKey: ['lecturer-academic-profile'],
    queryFn: () => api.get('/api/auth/lecturer-profile')
  })
  const { data: optionsResponse, isLoading: optionsLoading } = useQuery({
    queryKey: ['profile-options'],
    queryFn: () => api.get('/api/auth/registration-options')
  })
  const profile = profileResponse?.data || {}
  const options = optionsResponse?.data || {}
  const faculties = list(options.faculties)
  const departments = list(options.departments)
  const programmes = list(options.programmes)
  const units = list(options.units)

  useEffect(() => {
    if (!profileResponse?.data) return
    setForm({
      title: profile.title || '',
      facultyIds: asStrings(profile.facultyIds),
      departmentIds: asStrings(profile.departmentIds),
      programmeIds: asStrings(profile.programmeIds),
      unitIds: asStrings(profile.unitIds)
    })
  }, [profileResponse])

  const availableDepartments = useMemo(
    () =>
      departments.filter(item =>
        form.facultyIds.includes(String(item.faculty_id ?? item.facultyId))
      ),
    [departments, form.facultyIds]
  )
  const availableProgrammes = useMemo(
    () =>
      programmes.filter(item =>
        form.departmentIds.includes(
          String(item.department_id ?? item.departmentId)
        )
      ),
    [programmes, form.departmentIds]
  )
  const availableUnits = useMemo(
    () =>
      units.filter(unit =>
        (unit.programmeIds || []).some(id =>
          form.programmeIds.includes(String(id))
        )
      ),
    [units, form.programmeIds]
  )

  const saveMutation = useMutation({
    mutationFn: payload => api.put('/api/auth/lecturer-profile', payload),
    onSuccess: async () => {
      setMessage('Academic profile updated.')
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['lecturer-academic-profile']
        }),
        queryClient.invalidateQueries({ queryKey: ['profile-status'] }),
        queryClient.invalidateQueries({ queryKey: ['lecturers'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['timetable'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      ])
    },
    onError: error => setMessage(error.message || 'Unable to update profile.')
  })

  const toggleFaculty = (id, checked) => {
    setForm(current => {
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
          (unit.programmeIds || []).some(programmeId =>
            programmeIds.includes(String(programmeId))
          )
        )
      })
      return { ...current, facultyIds, departmentIds, programmeIds, unitIds }
    })
  }

  const toggleDepartment = (id, checked) => {
    setForm(current => {
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
          (unit.programmeIds || []).some(programmeId =>
            programmeIds.includes(String(programmeId))
          )
        )
      })
      return { ...current, departmentIds, programmeIds, unitIds }
    })
  }

  const toggleProgramme = (id, checked) => {
    setForm(current => {
      const programmeIds = checked
        ? [...new Set([...current.programmeIds, String(id)])]
        : current.programmeIds.filter(value => value !== String(id))
      const unitIds = current.unitIds.filter(unitId => {
        const unit = units.find(item => String(item.id) === unitId)
        return (
          unit &&
          (unit.programmeIds || []).some(programmeId =>
            programmeIds.includes(String(programmeId))
          )
        )
      })
      return { ...current, programmeIds, unitIds }
    })
  }

  const submit = event => {
    event.preventDefault()
    setMessage('')
    if (
      !form.facultyIds.length ||
      !form.departmentIds.length ||
      !form.programmeIds.length ||
      !form.unitIds.length
    ) {
      setMessage(
        'Select at least one faculty, department, programme, and unit.'
      )
      return
    }
    saveMutation.mutate({
      ...form,
      facultyIds: form.facultyIds.map(Number),
      departmentIds: form.departmentIds.map(Number),
      programmeIds: form.programmeIds.map(Number),
      unitIds: form.unitIds.map(Number)
    })
  }

  const checkboxGroup = (title, rows, selected, toggle, emptyMessage) => (
    <fieldset className='selection-container lecturer-profile-group'>
      <legend>{title}</legend>
      <div className='checkbox-list lecturer-profile-checkboxes'>
        {rows.map(item => (
          <label key={item.id} className='checkbox-option'>
            <input
              type='checkbox'
              checked={selected.includes(String(item.id))}
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

  if (profileLoading || optionsLoading)
    return <div className='content-panel'>Loading academic profile…</div>

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Teaching profile</p>
          <h1>My academic details</h1>
          <p>
            Choose the faculties, departments, programmes, and units you teach.
            Unchecking a parent automatically removes its dependent selections.
          </p>
        </div>
      </div>
      <section className='content-panel'>
        <form className='stack-form' onSubmit={submit}>
          <div className='form-grid'>
            <label>
              Academic title
              <input
                value={form.title}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    title: event.target.value
                  }))
                }
                placeholder='e.g. Dr, Professor'
              />
            </label>
            <label>
              Staff number
              <input
                value={profile.staffNumber || ''}
                readOnly
                aria-readonly='true'
              />
            </label>
          </div>
          <div className='lecturer-profile-selections'>
            {checkboxGroup(
              'Faculties',
              faculties,
              form.facultyIds,
              toggleFaculty,
              'No faculties are configured.'
            )}
            {checkboxGroup(
              'Departments',
              availableDepartments,
              form.departmentIds,
              toggleDepartment,
              'Select a faculty first.'
            )}
            {checkboxGroup(
              'Programmes',
              availableProgrammes,
              form.programmeIds,
              toggleProgramme,
              'Select a department first.'
            )}
            {checkboxGroup(
              'Units',
              availableUnits,
              form.unitIds,
              (id, checked) =>
                setForm(current => ({
                  ...current,
                  unitIds: checked
                    ? [...new Set([...current.unitIds, String(id)])]
                    : current.unitIds.filter(value => value !== String(id))
                })),
              'Select a programme first.'
            )}
          </div>
          {message && (
            <p
              className={
                saveMutation.isError ? 'form-error' : 'success-message'
              }
            >
              {message}
            </p>
          )}
          <div className='toolbar-actions'>
            <button
              type='submit'
              className='primary-button'
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save academic details'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

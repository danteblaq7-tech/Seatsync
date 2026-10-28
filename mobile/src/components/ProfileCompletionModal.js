import React, { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import useAutoClear from '../hooks/useAutoClear'
import { toggleDepartment, toggleFaculty, toggleProgramme, toggleUnit } from '../utils/academicCascade'
import Sheet from './Sheet'
import Select from './Select'
import {
  BoxedField,
  Checkbox,
  CheckboxList,
  Eyebrow,
  Fieldset,
  FormError,
  H2,
  Muted,
  PrimaryButton,
  Small,
  StackForm
} from './ui'

/** Blocking sheet shown until the user finishes their academic profile (no backdrop dismiss). */
export default function ProfileCompletionModal ({ role }) {
  const queryClient = useQueryClient()
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
  useAutoClear(error, useCallback(() => setError(''), []))

  const { data: options = {} } = useQuery({
    queryKey: ['profile-options'],
    queryFn: async () => (await api.get('/api/auth/registration-options')).data || {}
  })
  const departments = options.departments || []
  const programmes = options.programmes || []
  const units = options.units || []
  const data = { departments, programmes, units }

  const facultyDepartments = useMemo(
    () => departments.filter(i => form.facultyIds.includes(String(i.faculty_id ?? i.facultyId))),
    [departments, form.facultyIds]
  )
  const selectedProgrammes = useMemo(
    () => programmes.filter(i => form.departmentIds.includes(String(i.department_id ?? i.departmentId))),
    [programmes, form.departmentIds]
  )
  const selectedUnits = useMemo(
    () => units.filter(i => (i.programmeIds || []).some(id => form.programmeIds.includes(String(id)))),
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

  const isLecturer = role === 'LECTURER'

  const submit = () => {
    setError('')
    if (isLecturer) {
      if (!form.facultyIds.length || !form.departmentIds.length || !form.programmeIds.length || !form.unitIds.length) {
        return setError('Select at least one faculty, department, programme, and unit.')
      }
    } else if (!form.academicYearId || !form.programmeId || !form.currentYear) {
      return setError('Select your academic year, current year, and programme.')
    }
    mutation.mutate(form)
  }

  const list = (legend, rows, selected, onToggle, empty, labeler) => (
    <Fieldset legend={legend}>
      <CheckboxList maxHeight={116}>
        {rows.map(item => (
          <Checkbox key={item.id} checked={selected.includes(String(item.id))} onChange={c => onToggle(item.id, c)} label={labeler(item)} />
        ))}
        {empty && <Small>{empty}</Small>}
      </CheckboxList>
    </Fieldset>
  )

  return (
    <Sheet visible dismissable={false}>
      <View>
        <Eyebrow>Complete academic profile</Eyebrow>
        <H2>{isLecturer ? 'Teaching assignments' : 'Student information'}</H2>
      </View>
      <Muted>
        Complete these details before using the academic workspace. Removing a faculty, department, or programme also clears its dependent selections.
      </Muted>
      <StackForm>
        {isLecturer ? (
          <>
            {list('Faculties', options.faculties || [], form.facultyIds, (id, c) => setForm(s => ({ ...s, ...toggleFaculty(s, data, id, c) })), null, i => i.name || i.code)}
            {list('Departments', facultyDepartments, form.departmentIds, (id, c) => setForm(s => ({ ...s, ...toggleDepartment(s, data, id, c) })), !form.facultyIds.length ? 'Select a faculty first.' : null, i => i.name || i.code)}
            {list('Programmes', selectedProgrammes, form.programmeIds, (id, c) => setForm(s => ({ ...s, ...toggleProgramme(s, data, id, c) })), !form.departmentIds.length ? 'Select a department first.' : null, i => i.name || i.code)}
            {list('Units', selectedUnits, form.unitIds, (id, c) => setForm(s => toggleUnit(s, id, c)), !form.programmeIds.length ? 'Select a programme first.' : null, i => `${i.code} - ${i.name}`)}
          </>
        ) : (
          <>
            <BoxedField label='Academic year'>
              <Select
                value={String(form.academicYearId)}
                onChange={academicYearId => setForm(c => ({ ...c, academicYearId }))}
                emptyLabel='Select academic year'
                options={(options.academicYears || []).map(i => ({ value: String(i.id), label: i.name }))}
              />
            </BoxedField>
            <BoxedField label='Current year'>
              <Select
                value={String(form.currentYear)}
                onChange={currentYear => setForm(c => ({ ...c, currentYear }))}
                searchable={false}
                options={[1, 2, 3, 4, 5, 6].map(n => ({ value: String(n), label: `Year ${n}` }))}
              />
            </BoxedField>
            <BoxedField label='Programme'>
              <Select
                value={String(form.programmeId)}
                onChange={programmeId => setForm(c => ({ ...c, programmeId }))}
                emptyLabel='Select programme'
                options={programmes.map(i => ({ value: String(i.id), label: i.name || i.code }))}
              />
            </BoxedField>
          </>
        )}
        <FormError>{error}</FormError>
        <PrimaryButton title={mutation.isPending ? 'Saving...' : 'Save academic profile'} onPress={submit} disabled={mutation.isPending} />
      </StackForm>
    </Sheet>
  )
}

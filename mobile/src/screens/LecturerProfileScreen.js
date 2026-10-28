import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { type } from '../theme'
import { Text } from '../components/Typography'
import { asStrings, list } from '../utils/data'
import { toggleDepartment, toggleFaculty, toggleProgramme, toggleUnit } from '../utils/academicCascade'
import {
  Checkbox,
  CheckboxList,
  Field,
  Fieldset,
  FormError,
  FormGrid,
  PageHeader,
  Panel,
  PrimaryButton,
  Screen,
  StackForm,
  SuccessMessage,
  TextField,
  ToolbarActions,
  Small
} from '../components/ui'

const emptyForm = { title: '', facultyIds: [], departmentIds: [], programmeIds: [], unitIds: [] }

export default function LecturerProfileScreen () {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
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
  const data = { departments, programmes, units }

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
    () => departments.filter(i => form.facultyIds.includes(String(i.faculty_id ?? i.facultyId))),
    [departments, form.facultyIds]
  )
  const availableProgrammes = useMemo(
    () => programmes.filter(i => form.departmentIds.includes(String(i.department_id ?? i.departmentId))),
    [programmes, form.departmentIds]
  )
  const availableUnits = useMemo(
    () => units.filter(u => (u.programmeIds || []).some(id => form.programmeIds.includes(String(id)))),
    [units, form.programmeIds]
  )

  const saveMutation = useMutation({
    mutationFn: payload => api.put('/api/auth/lecturer-profile', payload),
    onSuccess: async () => {
      setMessage('Academic profile updated.')
      await Promise.all(
        ['lecturer-academic-profile', 'profile-status', 'lecturers', 'courses', 'timetable', 'dashboard-summary'].map(key =>
          queryClient.invalidateQueries({ queryKey: [key] })
        )
      )
    },
    onError: error => setMessage(error.message || 'Unable to update profile.')
  })

  const submit = () => {
    setMessage('')
    if (!form.facultyIds.length || !form.departmentIds.length || !form.programmeIds.length || !form.unitIds.length) {
      setMessage('Select at least one faculty, department, programme, and unit.')
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

  const group = (title, rows, selected, toggle, emptyMessage) => (
    <Fieldset legend={title}>
      <CheckboxList maxHeight={230}>
        {rows.map(item => (
          <Checkbox
            key={item.id}
            checked={selected.includes(String(item.id))}
            onChange={checked => toggle(item.id, checked)}
            label={`${item.code ? `${item.code} · ` : ''}${item.name || item.code}`}
          />
        ))}
        {!rows.length && <Small>{emptyMessage}</Small>}
      </CheckboxList>
    </Fieldset>
  )

  if (profileLoading || optionsLoading) {
    return (
      <Screen>
        <Panel><Text style={type.body}>Loading academic profile…</Text></Panel>
      </Screen>
    )
  }

  return (
    <Screen>
      <PageHeader
        eyebrow='Teaching profile'
        title='My academic details'
        description='Choose the faculties, departments, programmes, and units you teach. Unchecking a parent automatically removes its dependent selections.'
      />
      <Panel>
        <StackForm>
          <FormGrid>
            <Field label='Academic title'>
              <TextField
                value={form.title}
                onChangeText={title => setForm(c => ({ ...c, title }))}
                placeholder='e.g. Dr, Professor'
                autoCapitalize='words'
              />
            </Field>
            <Field label='Staff number'>
              <TextField value={profile.staffNumber || ''} editable={false} />
            </Field>
          </FormGrid>

          <FormGrid style={{ gap: 14 }}>
            {group('Faculties', faculties, form.facultyIds, (id, c) => setForm(s => ({ ...s, ...toggleFaculty(s, data, id, c) })), 'No faculties are configured.')}
            {group('Departments', availableDepartments, form.departmentIds, (id, c) => setForm(s => ({ ...s, ...toggleDepartment(s, data, id, c) })), 'Select a faculty first.')}
            {group('Programmes', availableProgrammes, form.programmeIds, (id, c) => setForm(s => ({ ...s, ...toggleProgramme(s, data, id, c) })), 'Select a department first.')}
            {group('Units', availableUnits, form.unitIds, (id, c) => setForm(s => toggleUnit(s, id, c)), 'Select a programme first.')}
          </FormGrid>

          {!!message && (saveMutation.isError ? <FormError>{message}</FormError> : <SuccessMessage>{message}</SuccessMessage>)}

          <ToolbarActions>
            <PrimaryButton
              title={saveMutation.isPending ? 'Saving…' : 'Save academic details'}
              onPress={submit}
              disabled={saveMutation.isPending}
            />
          </ToolbarActions>
        </StackForm>
      </Panel>
    </Screen>
  )
}

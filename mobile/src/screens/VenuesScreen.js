import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { API_URL } from '../config'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import useAutoClear from '../hooks/useAutoClear'
import { formatDateOnly } from '../utils/dateOnly'
import { toArray } from '../utils/data'
import { Text } from '../components/Typography'
import { colors, radius, type } from '../theme'
import ConfirmActionModal from '../components/ConfirmActionModal'
import Select from '../components/Select'
import Sheet from '../components/Sheet'
import { TimeField } from '../components/DateTime'
import {
  Badge, BoxedField, Body, Eyebrow, EmptyState, Field, FilterRow, FormError, FormGrid, H2, P, PageHeader,
  Panel, PrimaryButton, Screen, SecondaryButton, DangerAction, StackForm, TextField, ToolbarActions
} from '../components/ui'

const emptyVenue = { name: '', code: '', building: '', room_number: '', capacity: '50', status: 'ACTIVE', venue_type_id: '', description: '' }
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const statusOptions = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'BOOKED', label: 'Booked' },
  { value: 'MAINTENANCE', label: 'Maintenance' }
]
const emptyAvailability = { day: 'Monday', startTime: '', endTime: '', capacity: '' }

const AllocationCard = ({ lines, title, small }) => (
  <View style={{ gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: radius.input, padding: 14 }}>
    <Text style={[type.body, { fontWeight: '700' }]}>{title}</Text>
    {lines.map((line, i) => <Text key={i} style={type.body}>{line}</Text>)}
    {!!small && <Text style={[type.small, { fontSize: 13.6 }]}>{small}</Text>}
  </View>
)

export default function VenuesScreen () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManage = (user?.roles || []).includes('ADMIN')
  const canViewAllocations = (user?.roles || []).some(r => ['ADMIN', 'LECTURER'].includes(r))
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [now, setNow] = useState(new Date())
  const [showForm, setShowForm] = useState(false)
  const [showAvailability, setShowAvailability] = useState(false)
  const [filters, setFilters] = useState(emptyAvailability)
  const [availabilitySearch, setAvailabilitySearch] = useState(null)
  const [form, setForm] = useState(emptyVenue)
  const [formError, setFormError] = useState('')
  const [allocationVenue, setAllocationVenue] = useState(null)
  const [venueToDelete, setVenueToDelete] = useState(null)
  useAutoClear(formError, useCallback(() => setFormError(''), []))

  const q = (key, path) => useQuery({ queryKey: [key], queryFn: async () => toArray(await api.get(path)) })
  const { data = [], isLoading, error, refetch, isRefetching } = q('venues', '/api/academic/venues')
  const { data: venueTypes = [] } = q('venue-types', '/api/academic/venue-types')
  const { data: exams = [] } = q('venue-exam-allocations', '/api/exams')
  const { data: timetable = [] } = q('venue-timetable-allocations', '/api/timetable')
  const { data: units = [] } = q('venue-allocation-units', '/api/academic/courses')
  const { data: lecturers = [] } = q('venue-allocation-lecturers', '/api/academic/lecturers')
  const { data: cohorts = [] } = q('venue-allocation-cohorts', '/api/academic/cohorts')

  const unitMap = Object.fromEntries(units.map(u => [String(u.id), u]))
  const lecturerMap = Object.fromEntries(lecturers.map(l => [String(l.id), l]))
  const cohortMap = Object.fromEntries(cohorts.map(c => [String(c.id), c]))
  const venueTypeMap = Object.fromEntries((venueTypes || []).map(t => [String(t.id), t.name]))

  useEffect(() => {
    const socket = io(API_URL, { transports: ['websocket'] })
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      queryClient.invalidateQueries({ queryKey: ['venue-timetable-allocations'] })
      queryClient.invalidateQueries({ queryKey: ['venue-exam-allocations'] })
    }
    socket.on('venue:blocked', refresh)
    socket.on('timetable:override_created', refresh)
    return () => { socket.disconnect() }
  }, [queryClient])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const getLiveStatus = venue => {
    const id = String(venue.id)
    const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]
    const pad = n => String(n).padStart(2, '0')
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    const today = now.toISOString().slice(0, 10)
    const active = (timetable || []).find(entry => {
      if (String(entry.venue_id ?? entry.venueId) !== id) return false
      const entryDay = entry.day_of_week || entry.dayOfWeek
      const start = String(entry.start_time || entry.startTime || '00:00').slice(0, 5)
      const end = String(entry.end_time || entry.endTime || '00:00').slice(0, 5)
      const recurring = !entry.effective_date && entryDay === currentDay
      const makeup = Boolean(entry.effective_date) && String(entry.effective_date).slice(0, 10) === today
      return (recurring || makeup) && currentTime >= start && currentTime < end
    })
    if (active) return { badge: `${String(active.event_type || active.eventType || 'Lecture').toUpperCase()} ongoing`, level: 'warn' }
    const exam = (exams || []).find(e => {
      if (!(e.venueDetails || []).map(v => String(v.id)).includes(id)) return false
      return String(e.exam_date || '').slice(0, 10) === today &&
        currentTime >= String(e.start_time || '00:00').slice(0, 5) &&
        currentTime < String(e.end_time || '23:59').slice(0, 5)
    })
    return exam ? { badge: 'EXAM ongoing', level: 'warn' } : { badge: 'Available now', level: 'ok' }
  }

  const { data: availabilityResults = [], isLoading: loadingAvailability } = useQuery({
    queryKey: ['venue-availability', availabilitySearch],
    queryFn: async () => {
      if (!availabilitySearch) return []
      const params = new URLSearchParams()
      if (availabilitySearch.day) params.set('day', availabilitySearch.day)
      if (availabilitySearch.startTime) params.set('startTime', availabilitySearch.startTime)
      if (availabilitySearch.endTime) params.set('endTime', availabilitySearch.endTime)
      if (availabilitySearch.capacity) params.set('requiredCapacity', String(availabilitySearch.capacity))
      return toArray(await api.get(`/api/timetable/availability?${params}`))
    },
    enabled: Boolean(availabilitySearch)
  })

  const createVenue = useMutation({
    mutationFn: async payload => { const r = await api.post('/api/academic/venues', payload); return r?.data ?? r },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['venues'] }); setShowForm(false); setForm(emptyVenue); setFormError('') },
    onError: err => setFormError(err.message || 'Unable to create venue.')
  })
  const deleteVenue = useMutation({
    mutationFn: async id => { await api.del(`/api/academic/venues/${id}`) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues'] })
  })

  const filtered = useMemo(() => (data || []).filter(item => {
    const nameOk = (item.name || item.venue_name || '').toLowerCase().includes(search.toLowerCase())
    const status = (item.status || 'ACTIVE').toUpperCase()
    return nameOk && (statusFilter === 'all' || status === statusFilter)
  }), [data, search, statusFilter])

  const submit = () => {
    if (!form.name || !form.venue_type_id) return setFormError('Venue name and venue type are required.')
    createVenue.mutate({ ...form, capacity: Number(form.capacity) || 0, venue_type_id: Number(form.venue_type_id) || null })
  }
  const set = key => v => setForm(c => ({ ...c, [key]: v }))

  const allocations = allocationVenue ? [
    ...exams.flatMap(exam => (exam.venueDetails || [])
      .filter(a => String(a.id) === String(allocationVenue.id))
      .map(allocation => ({ type: 'EXAM', exam, allocation }))),
    ...timetable.filter(e => String(e.venue_id ?? e.venueId) === String(allocationVenue.id))
      .map(entry => ({ type: entry.event_type || entry.eventType || 'LECTURE', entry }))
  ] : []

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader eyebrow='Space management' title='Venues'>
        <ToolbarActions>
          <SecondaryButton title='View availability' onPress={() => { setShowAvailability(true); setAvailabilitySearch(null) }} />
          {canManage && <PrimaryButton title={showForm ? 'Close form' : 'Create venue'} onPress={() => setShowForm(v => !v)} />}
        </ToolbarActions>
      </PageHeader>

      {showForm && canManage && (
        <Panel>
          <View style={{ marginBottom: 12 }}><Eyebrow>Venue details</Eyebrow><H2>Create venue</H2></View>
          <StackForm>
            <FormGrid>
              <Field label='Venue name'><TextField value={form.name} onChangeText={set('name')} placeholder='Lecture Hall A' autoCapitalize='words' /></Field>
              <Field label='Code (optional)'><TextField value={form.code} onChangeText={set('code')} placeholder='LHA-01' autoCapitalize='characters' /></Field>
              <Field label='Building (optional)'><TextField value={form.building} onChangeText={set('building')} placeholder='Main Block' /></Field>
              <Field label='Room number (optional)'><TextField value={form.room_number} onChangeText={set('room_number')} placeholder='101' /></Field>
              <Field label='Capacity'><TextField value={String(form.capacity)} onChangeText={set('capacity')} keyboardType='number-pad' /></Field>
              <BoxedField label='Venue type'>
                <Select value={String(form.venue_type_id)} onChange={set('venue_type_id')} emptyLabel='Select venue type'
                  options={(venueTypes || []).map(t => ({ value: String(t.id ?? t.name), label: t.name }))} searchable={false} />
              </BoxedField>
              <BoxedField label='Status'><Select value={form.status} onChange={set('status')} options={statusOptions} searchable={false} /></BoxedField>
              <Field label='Description'><TextField multiline value={form.description} onChangeText={set('description')} placeholder='Optional description' autoCapitalize='sentences' /></Field>
            </FormGrid>
            <FormError>{formError}</FormError>
            <ToolbarActions>
              <PrimaryButton title={createVenue.isPending ? 'Saving...' : 'Save venue'} onPress={submit} disabled={createVenue.isPending} />
              <SecondaryButton title='Cancel' onPress={() => setShowForm(false)} />
            </ToolbarActions>
          </StackForm>
        </Panel>
      )}

      <Panel>
        <FilterRow>
          <TextField value={search} onChangeText={setSearch} placeholder='Search venue name' />
          <Select value={statusFilter} onChange={setStatusFilter} searchable={false} options={[{ value: 'all', label: 'All statuses' }, ...statusOptions]} />
        </FilterRow>
      </Panel>

      <Panel>
        {isLoading ? <P>Loading venues...</P> : error ? <FormError style={{ marginVertical: 16 }}>Unable to load venues.</FormError> : (
          <View style={{ gap: 16 }}>
            {filtered.length ? filtered.map(item => {
              const live = getLiveStatus(item)
              return (
                <View key={item.id ?? item.name} style={{ backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 16, gap: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Eyebrow small>Venue</Eyebrow>
                      <Text style={[type.body, { fontSize: 16.8, lineHeight: 25.2, fontWeight: '700' }]}>{item.name || item.venue_name || 'Unnamed venue'}</Text>
                    </View>
                    <Badge tone={live.level}>{live.badge}</Badge>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={[type.body, { color: colors.muted }]}>Capacity: {item.capacity || 0}</Text>
                    <Text style={[type.body, { color: colors.muted }]}>
                      Type: {venueTypeMap[String(item.venue_type_id ?? item.venueTypeId)] || item.venue_type || item.type || 'General room'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    {canViewAllocations && <SecondaryButton title='View allocations' onPress={() => setAllocationVenue(item)} />}
                    {canManage && <DangerAction title='Delete' onPress={() => setVenueToDelete(item)} disabled={deleteVenue.isPending} />}
                  </View>
                </View>
              )
            }) : <EmptyState title='No venues match your filters.' message='Try a different name or status.' />}
          </View>
        )}
      </Panel>

      {showAvailability && (
        <Sheet visible onClose={() => setShowAvailability(false)}>
          <View style={{ gap: 12 }}>
            <View><Eyebrow>Availability</Eyebrow><H2>Find a suitable venue</H2></View>
            <View style={{ alignSelf: 'flex-start' }}><SecondaryButton title='Close' onPress={() => setShowAvailability(false)} /></View>
          </View>
          <StackForm gap={14}>
            <FormGrid>
              <BoxedField label='Day'>
                <Select value={filters.day} onChange={day => setFilters(c => ({ ...c, day }))} options={days.map(d => ({ value: d, label: d }))} searchable={false} />
              </BoxedField>
              <Field label='Start time'><TimeField value={filters.startTime} onChange={startTime => setFilters(c => ({ ...c, startTime }))} /></Field>
              <Field label='End time'><TimeField value={filters.endTime} onChange={endTime => setFilters(c => ({ ...c, endTime }))} /></Field>
              <Field label='Capacity needed'>
                <TextField value={filters.capacity} onChangeText={capacity => setFilters(c => ({ ...c, capacity }))} placeholder='e.g. 80' keyboardType='number-pad' />
              </Field>
            </FormGrid>
            <ToolbarActions>
              <PrimaryButton title='Search venues' onPress={() =>
                setAvailabilitySearch(!filters.startTime || !filters.endTime ? { ...filters, startTime: '', endTime: '' } : { ...filters })} />
              <SecondaryButton title='Reset' onPress={() => { setFilters(emptyAvailability); setAvailabilitySearch(null) }} />
            </ToolbarActions>
          </StackForm>
          <View style={{ gap: 12, marginTop: 4 }}>
            {loadingAvailability ? <Body>Checking venue availability...</Body>
              : availabilitySearch ? (availabilityResults.length ? availabilityResults.map(v => (
                <AllocationCard key={v.id ?? v.name} title={v.name || v.venue_name}
                  lines={[`Code: ${v.code || 'N/A'}`, `Capacity: ${v.capacity || 0} seats`, `${v.building || 'Main campus'} · ${v.room_number || 'Room unspecified'}`]}
                  small={(v.status || 'ACTIVE').toUpperCase()} />
              )) : <Body>No venues are available for the selected filters.</Body>)
              : <Body>Choose a day, time range, and capacity to see matching venues.</Body>}
          </View>
        </Sheet>
      )}

      {allocationVenue && (
        <Sheet visible onClose={() => setAllocationVenue(null)}>
          <View style={{ gap: 12 }}>
            <View><Eyebrow>Venue allocations</Eyebrow><H2>{allocationVenue.name || allocationVenue.venue_name}</H2></View>
            <View style={{ alignSelf: 'flex-start' }}><SecondaryButton title='Close' onPress={() => setAllocationVenue(null)} /></View>
          </View>
          <Body>Capacity: {allocationVenue.capacity || 0} seats</Body>
          <View style={{ gap: 12 }}>
            {allocations.length ? allocations.map(item => {
              if (item.type === 'EXAM') {
                const { exam, allocation } = item
                return (
                  <AllocationCard key={`exam-${exam.id}-${allocation.id}`}
                    title={`EXAM · ${exam.unitCode || exam.unit_code || 'Unit'} - ${exam.unitName || exam.unit_name || ''}`}
                    lines={[
                      exam.exam_date ? formatDateOnly(exam.exam_date, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : 'Date unavailable',
                      `${exam.start_time} - ${exam.end_time}`,
                      (exam.cohortDetails || []).map(c => c.name).join(', ') || 'No cohort details',
                      `${allocation.capacity} students allocated of ${allocation.venueCapacity || allocationVenue.capacity || 0} seats`
                    ]}
                    small={exam.status || 'SCHEDULED'} />
                )
              }
              const e = item.entry
              const unit = unitMap[String(e.course_id ?? e.courseId)]
              const lecturer = lecturerMap[String(e.lecturer_id ?? e.lecturerId)]
              return (
                <AllocationCard key={`event-${e.id}`}
                  title={`${String(item.type).toUpperCase()} · ${unit?.code || 'Unit'} - ${unit?.name || 'Unknown unit'}`}
                  lines={[
                    `${e.day_of_week || e.dayOfWeek || 'Day unavailable'}${e.effective_date ? ` · Make-up ${String(e.effective_date).slice(0, 10)}` : ''}`,
                    `${e.start_time || e.startTime} - ${e.end_time || e.endTime}`,
                    `Lecturer: ${lecturer?.name || lecturer?.email || 'N/A'}`,
                    `Cohorts: ${(e.cohortIds || [e.cohort_id]).map(id => cohortMap[String(id)]).filter(Boolean)
                      .map(c => `${c.name} (${c.student_count ?? c.studentCount ?? 0} students)`).join(', ') || 'N/A'}`,
                    e.status || 'SCHEDULED'
                  ]} />
              )
            }) : <Body>No allocations found for this venue.</Body>}
          </View>
        </Sheet>
      )}

      {venueToDelete && canManage && (
        <ConfirmActionModal title='Delete venue?'
          message={`Delete ${venueToDelete.name || venueToDelete.venue_name}? This deletion will be recorded in the audit history.`}
          isPending={deleteVenue.isPending} onCancel={() => setVenueToDelete(null)}
          onConfirm={() => deleteVenue.mutate(venueToDelete.id, { onSuccess: () => setVenueToDelete(null) })} />
      )}
    </Screen>
  )
}

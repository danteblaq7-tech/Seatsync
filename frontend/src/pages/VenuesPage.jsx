import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { api } from '../api/client'
import { formatDateOnly } from '../utils/dateOnly'
import ConfirmActionModal from '../components/ConfirmActionModal'
import { useAuth } from '../context/AuthContext'
import { SOCKET_BASE_URL } from '../config.js'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

const emptyVenue = {
  name: '',
  code: '',
  building: '',
  room_number: '',
  capacity: 50,
  status: 'ACTIVE',
  venue_type_id: '',
  description: ''
}

export default function VenuesPage () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManageVenues = (user?.roles || []).includes('ADMIN')
  const canViewAllocations = (user?.roles || []).some(role =>
    ['ADMIN', 'LECTURER'].includes(role)
  )
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [now, setNow] = useState(new Date())
  const [showForm, setShowForm] = useState(false)
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false)
  const [availabilityFilters, setAvailabilityFilters] = useState({
    day: 'Monday',
    startTime: '',
    endTime: '',
    capacity: ''
  })
  const [availabilitySearch, setAvailabilitySearch] = useState(null)
  const [form, setForm] = useState(emptyVenue)
  const [formError, setFormError] = useState('')
  const [allocationVenue, setAllocationVenue] = useState(null)
  const [venueToDelete, setVenueToDelete] = useState(null)

  useEffect(() => {
    if (!formError) return undefined
    const timeout = setTimeout(() => setFormError(''), 5000)
    return () => clearTimeout(timeout)
  }, [formError])

  const {
    data = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['venues'],
    queryFn: async () => {
      const response = await api.get('/api/academic/venues')
      return toArray(response)
    }
  })

  const { data: venueTypes = [] } = useQuery({
    queryKey: ['venue-types'],
    queryFn: async () => {
      const response = await api.get('/api/academic/venue-types')
      return toArray(response)
    }
  })

  const { data: exams = [] } = useQuery({
    queryKey: ['venue-exam-allocations'],
    queryFn: async () => toArray(await api.get('/api/exams'))
  })

  const { data: timetable = [] } = useQuery({
    queryKey: ['venue-timetable-allocations'],
    queryFn: async () => toArray(await api.get('/api/timetable'))
  })

  const { data: units = [] } = useQuery({
    queryKey: ['venue-allocation-units'],
    queryFn: async () => toArray(await api.get('/api/academic/courses'))
  })

  const { data: lecturers = [] } = useQuery({
    queryKey: ['venue-allocation-lecturers'],
    queryFn: async () => toArray(await api.get('/api/academic/lecturers'))
  })

  const { data: cohorts = [] } = useQuery({
    queryKey: ['venue-allocation-cohorts'],
    queryFn: async () => toArray(await api.get('/api/academic/cohorts'))
  })

  const unitMap = Object.fromEntries(units.map(unit => [String(unit.id), unit]))
  const lecturerMap = Object.fromEntries(
    lecturers.map(lecturer => [String(lecturer.id), lecturer])
  )
  const cohortMap = Object.fromEntries(
    cohorts.map(cohort => [String(cohort.id), cohort])
  )

  const venueTypeMap = Object.fromEntries(
    (venueTypes || []).map(type => [String(type.id), type.name])
  )

  const socketRef = useRef(null)

  useEffect(() => {
    const socket = io(SOCKET_BASE_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('venue:blocked', () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      queryClient.invalidateQueries({
        queryKey: ['venue-timetable-allocations']
      })
      queryClient.invalidateQueries({ queryKey: ['venue-exam-allocations'] })
    })

    socket.on('timetable:override_created', () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      queryClient.invalidateQueries({
        queryKey: ['venue-timetable-allocations']
      })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [queryClient])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const getVenueLiveStatus = venue => {
    if (!venue || !data) return { badge: 'Available now', level: 'ok' }

    const venueId = String(venue.id)
    const currentDay = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ][now.getDay()]
    const currentTime = now.toTimeString().slice(0, 5)

    const activeTimetableEvent = (timetable || []).find(entry => {
      if (String(entry.venue_id ?? entry.venueId) !== venueId) return false
      const entryDay = entry.day_of_week || entry.dayOfWeek
      const start = String(
        entry.start_time || entry.startTime || '00:00'
      ).slice(0, 5)
      const end = String(entry.end_time || entry.endTime || '00:00').slice(0, 5)
      const isRecurring = !entry.effective_date && entryDay === currentDay
      const isMakeup =
        Boolean(entry.effective_date) &&
        String(entry.effective_date).slice(0, 10) ===
          now.toISOString().slice(0, 10)
      return (
        (isRecurring || isMakeup) && currentTime >= start && currentTime < end
      )
    })

    if (activeTimetableEvent) {
      return {
        badge: `${String(
          activeTimetableEvent.event_type ||
            activeTimetableEvent.eventType ||
            'Lecture'
        ).toUpperCase()} ongoing`,
        level: 'warn'
      }
    }

    const activeExam = (exams || []).find(exam => {
      const examVenueIds = (exam.venueDetails || []).map(item =>
        String(item.id)
      )
      if (!examVenueIds.includes(venueId)) return false
      const examDate = String(exam.exam_date || '').slice(0, 10)
      const examStart = String(exam.start_time || '00:00').slice(0, 5)
      const examEnd = String(exam.end_time || '23:59').slice(0, 5)
      return (
        examDate === now.toISOString().slice(0, 10) &&
        currentTime >= examStart &&
        currentTime < examEnd
      )
    })

    if (activeExam) {
      return { badge: 'EXAM ongoing', level: 'warn' }
    }

    return { badge: 'Available now', level: 'ok' }
  }

  const { data: availabilityResults = [], isLoading: isLoadingAvailability } =
    useQuery({
      queryKey: ['venue-availability', availabilitySearch],
      queryFn: async () => {
        if (!availabilitySearch) return []
        const params = new URLSearchParams()
        if (availabilitySearch.day) params.set('day', availabilitySearch.day)
        if (availabilitySearch.startTime)
          params.set('startTime', availabilitySearch.startTime)
        if (availabilitySearch.endTime)
          params.set('endTime', availabilitySearch.endTime)
        if (availabilitySearch.capacity)
          params.set('requiredCapacity', String(availabilitySearch.capacity))
        const response = await api.get(`/api/timetable/availability?${params}`)
        return toArray(response)
      },
      enabled: Boolean(availabilitySearch)
    })

  const createVenueMutation = useMutation({
    mutationFn: async payload => {
      const response = await api.post('/api/academic/venues', payload)
      return response?.data ?? response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      setShowForm(false)
      setForm(emptyVenue)
      setFormError('')
    },
    onError: err => {
      setFormError(err.message || 'Unable to create venue.')
    }
  })

  const deleteVenueMutation = useMutation({
    mutationFn: async id => {
      await api.del(`/api/academic/venues/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
    }
  })

  const filteredVenues = useMemo(() => {
    return (data || []).filter(item => {
      const matchesSearch = (item.name || item.venue_name || '')
        .toLowerCase()
        .includes(search.toLowerCase())
      const status = (item.status || 'ACTIVE').toUpperCase()
      const matchesStatus =
        statusFilter === 'all' ? true : status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [data, search, statusFilter])

  const handleSubmit = event => {
    event.preventDefault()

    if (!form.name || !form.venue_type_id) {
      setFormError('Venue name and venue type are required.')
      return
    }

    createVenueMutation.mutate({
      ...form,
      capacity: Number(form.capacity) || 0,
      venue_type_id: Number(form.venue_type_id) || null
    })
  }

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Space management</p>
          <h1>Venues</h1>
        </div>

        <div className='toolbar-actions'>
          <button
            type='button'
            className='secondary-button'
            onClick={() => {
              setShowAvailabilityModal(true)
              setAvailabilitySearch(null)
            }}
          >
            View availability
          </button>
          {canManageVenues && (
            <button
              type='button'
              className='primary-button'
              onClick={() => setShowForm(value => !value)}
            >
              {showForm ? 'Close form' : 'Create venue'}
            </button>
          )}
        </div>
      </div>

      {showForm && canManageVenues && (
        <section className='content-panel venue-create-section'>
          <div className='page-header venue-form-header'>
            <div>
              <p className='eyebrow'>Venue details</p>
              <h2>Create venue</h2>
            </div>
          </div>
          <form
            className='stack-form venue-create-form'
            onSubmit={handleSubmit}
          >
            <div className='form-grid'>
              <label>
                Venue name
                <input
                  value={form.name}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder='Lecture Hall A'
                />
              </label>
              <label>
                Code (optional)
                <input
                  value={form.code}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      code: event.target.value
                    }))
                  }
                  placeholder='LHA-01'
                />
              </label>
              <label>
                Building (optional)
                <input
                  value={form.building}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      building: event.target.value
                    }))
                  }
                  placeholder='Main Block'
                />
              </label>
              <label>
                Room number (optional)
                <input
                  value={form.room_number}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      room_number: event.target.value
                    }))
                  }
                  placeholder='101'
                />
              </label>
              <label>
                Capacity
                <input
                  type='number'
                  value={form.capacity}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      capacity: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                Venue type
                <select
                  value={form.venue_type_id}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      venue_type_id: event.target.value
                    }))
                  }
                >
                  <option value=''>Select venue type</option>
                  {(venueTypes || []).map(type => (
                    <option
                      key={type.id ?? type.name}
                      value={type.id ?? type.name}
                    >
                      {type.name}
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
                  <option value='BOOKED'>Booked</option>
                  <option value='MAINTENANCE'>Maintenance</option>
                </select>
              </label>
              <label className='full-width'>
                Description
                <textarea
                  value={form.description}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                  placeholder='Optional description'
                />
              </label>
            </div>

            {formError && <p className='form-error'>{formError}</p>}

            <div className='toolbar-actions'>
              <button
                type='submit'
                className='primary-button'
                disabled={createVenueMutation.isPending}
              >
                {createVenueMutation.isPending ? 'Saving...' : 'Save venue'}
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

      <section className='content-panel'>
        <div className='filter-row'>
          <input
            type='text'
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder='Search venue name'
          />
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
          >
            <option value='all'>All statuses</option>
            <option value='ACTIVE'>Active</option>
            <option value='BOOKED'>Booked</option>
            <option value='MAINTENANCE'>Maintenance</option>
          </select>
        </div>
      </section>

      <section className='content-panel'>
        {isLoading ? (
          <p>Loading venues...</p>
        ) : error ? (
          <p className='form-error'>Unable to load venues.</p>
        ) : (
          <div className='venue-grid'>
            {filteredVenues.length ? (
              filteredVenues.map(item => {
                const liveStatus = getVenueLiveStatus(item)
                const badgeClass =
                  liveStatus.level === 'warn'
                    ? 'warn'
                    : liveStatus.level === 'muted'
                    ? 'muted'
                    : 'ok'

                return (
                  <article
                    key={item.id ?? item.name ?? item.venue_name}
                    className='venue-card'
                  >
                    <div className='venue-card-top'>
                      <div>
                        <p className='eyebrow small'>Venue</p>
                        <h3>
                          {item.name || item.venue_name || 'Unnamed venue'}
                        </h3>
                      </div>
                      <span className={`status-badge ${badgeClass}`}>
                        {liveStatus.badge}
                      </span>
                    </div>

                    <div className='venue-meta'>
                      <span>Capacity: {item.capacity || 0}</span>
                      <span>
                        Type:{' '}
                        {venueTypeMap[
                          String(item.venue_type_id ?? item.venueTypeId)
                        ] ||
                          item.venue_type ||
                          item.type ||
                          'General room'}
                      </span>
                    </div>

                    <div className='venue-actions'>
                      {canViewAllocations && (
                        <button
                          type='button'
                          className='secondary-button'
                          onClick={() => setAllocationVenue(item)}
                        >
                          View allocations
                        </button>
                      )}
                      {canManageVenues && (
                        <button
                          type='button'
                          className='table-action danger'
                          onClick={() => setVenueToDelete(item)}
                          disabled={deleteVenueMutation.isPending}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </article>
                )
              })
            ) : (
              <div className='empty-state'>
                <strong>No venues match your filters.</strong>
                <span>Try a different name or status.</span>
              </div>
            )}
          </div>
        )}
      </section>

      {showAvailabilityModal && (
        <div
          className='profile-modal-backdrop'
          onClick={() => setShowAvailabilityModal(false)}
        >
          <section
            className='profile-modal content-panel venue-allocation-modal'
            onClick={event => event.stopPropagation()}
          >
            <div className='page-header'>
              <div>
                <p className='eyebrow'>Availability</p>
                <h2>Find a suitable venue</h2>
              </div>
              <button
                type='button'
                className='secondary-button'
                onClick={() => setShowAvailabilityModal(false)}
              >
                Close
              </button>
            </div>

            <div className='stack-form venue-availability-form'>
              <div className='form-grid'>
                <label>
                  Day
                  <select
                    value={availabilityFilters.day}
                    onChange={event =>
                      setAvailabilityFilters(current => ({
                        ...current,
                        day: event.target.value
                      }))
                    }
                  >
                    {[
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                      'Friday',
                      'Saturday',
                      'Sunday'
                    ].map(day => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start time
                  <input
                    type='time'
                    value={availabilityFilters.startTime}
                    onChange={event =>
                      setAvailabilityFilters(current => ({
                        ...current,
                        startTime: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  End time
                  <input
                    type='time'
                    value={availabilityFilters.endTime}
                    onChange={event =>
                      setAvailabilityFilters(current => ({
                        ...current,
                        endTime: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  Capacity needed
                  <input
                    type='number'
                    min='0'
                    value={availabilityFilters.capacity}
                    onChange={event =>
                      setAvailabilityFilters(current => ({
                        ...current,
                        capacity: event.target.value
                      }))
                    }
                    placeholder='e.g. 80'
                  />
                </label>
              </div>

              <div className='toolbar-actions'>
                <button
                  type='button'
                  className='primary-button'
                  onClick={() => {
                    if (
                      !availabilityFilters.startTime ||
                      !availabilityFilters.endTime
                    ) {
                      setAvailabilitySearch({
                        ...availabilityFilters,
                        startTime: '',
                        endTime: ''
                      })
                      return
                    }
                    setAvailabilitySearch({ ...availabilityFilters })
                  }}
                >
                  Search venues
                </button>
                <button
                  type='button'
                  className='secondary-button'
                  onClick={() => {
                    setAvailabilityFilters({
                      day: 'Monday',
                      startTime: '',
                      endTime: '',
                      capacity: ''
                    })
                    setAvailabilitySearch(null)
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            <div className='venue-allocation-grid venue-availability-results'>
              {isLoadingAvailability ? (
                <p>Checking venue availability...</p>
              ) : availabilitySearch ? (
                availabilityResults.length ? (
                  availabilityResults.map(venue => (
                    <article
                      key={venue.id ?? venue.name}
                      className='venue-allocation-card'
                    >
                      <strong>{venue.name || venue.venue_name}</strong>
                      <span>Code: {venue.code || 'N/A'}</span>
                      <span>Capacity: {venue.capacity || 0} seats</span>
                      <span>
                        {venue.building || 'Main campus'} ·{' '}
                        {venue.room_number || 'Room unspecified'}
                      </span>
                      <small>{(venue.status || 'ACTIVE').toUpperCase()}</small>
                    </article>
                  ))
                ) : (
                  <p>No venues are available for the selected filters.</p>
                )
              ) : (
                <p>
                  Choose a day, time range, and capacity to see matching venues.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {allocationVenue && (
        <div
          className='profile-modal-backdrop'
          onClick={() => setAllocationVenue(null)}
        >
          <section
            className='profile-modal content-panel venue-allocation-modal'
            onClick={event => event.stopPropagation()}
          >
            <div className='page-header'>
              <div>
                <p className='eyebrow'>Venue allocations</p>
                <h2>{allocationVenue.name || allocationVenue.venue_name}</h2>
              </div>
              <button
                type='button'
                className='secondary-button'
                onClick={() => setAllocationVenue(null)}
              >
                Close
              </button>
            </div>
            <p>Capacity: {allocationVenue.capacity || 0} seats</p>
            <div className='venue-allocation-grid'>
              {[
                ...exams.flatMap(exam =>
                  (exam.venueDetails || [])
                    .filter(
                      allocation =>
                        String(allocation.id) === String(allocationVenue.id)
                    )
                    .map(allocation => ({ type: 'EXAM', exam, allocation }))
                ),
                ...timetable
                  .filter(
                    entry =>
                      String(entry.venue_id ?? entry.venueId) ===
                      String(allocationVenue.id)
                  )
                  .map(entry => ({
                    type: entry.event_type || entry.eventType || 'LECTURE',
                    entry
                  }))
              ].length ? (
                [
                  ...exams.flatMap(exam =>
                    (exam.venueDetails || [])
                      .filter(
                        allocation =>
                          String(allocation.id) === String(allocationVenue.id)
                      )
                      .map(allocation => ({ type: 'EXAM', exam, allocation }))
                  ),
                  ...timetable
                    .filter(
                      entry =>
                        String(entry.venue_id ?? entry.venueId) ===
                        String(allocationVenue.id)
                    )
                    .map(entry => ({
                      type: entry.event_type || entry.eventType || 'LECTURE',
                      entry
                    }))
                ].map(item =>
                  item.type === 'EXAM' ? (
                    <article
                      key={`exam-${item.exam.id}-${item.allocation.id}`}
                      className='venue-allocation-card'
                    >
                      <strong>
                        EXAM ·{' '}
                        {item.exam.unitCode || item.exam.unit_code || 'Unit'} -{' '}
                        {item.exam.unitName || item.exam.unit_name || ''}
                      </strong>
                      <span>
                        {item.exam.exam_date
                          ? formatDateOnly(item.exam.exam_date, {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })
                          : 'Date unavailable'}
                      </span>
                      <span>
                        {item.exam.start_time} - {item.exam.end_time}
                      </span>
                      <span>
                        {(item.exam.cohortDetails || [])
                          .map(cohort => cohort.name)
                          .join(', ') || 'No cohort details'}
                      </span>
                      <span>
                        {item.allocation.capacity} students allocated of{' '}
                        {item.allocation.venueCapacity ||
                          allocationVenue.capacity ||
                          0}{' '}
                        seats
                      </span>
                      <small>{item.exam.status || 'SCHEDULED'}</small>
                    </article>
                  ) : (
                    <article
                      key={`event-${item.entry.id}`}
                      className='venue-allocation-card'
                    >
                      <strong>
                        {String(item.type).toUpperCase()} ·{' '}
                        {unitMap[
                          String(item.entry.course_id ?? item.entry.courseId)
                        ]?.code || 'Unit'}{' '}
                        -{' '}
                        {unitMap[
                          String(item.entry.course_id ?? item.entry.courseId)
                        ]?.name || 'Unknown unit'}
                      </strong>
                      <span>
                        {item.entry.day_of_week ||
                          item.entry.dayOfWeek ||
                          'Day unavailable'}
                        {item.entry.effective_date
                          ? ` · Make-up ${String(
                              item.entry.effective_date
                            ).slice(0, 10)}`
                          : ''}
                      </span>
                      <span>
                        {item.entry.start_time || item.entry.startTime} -{' '}
                        {item.entry.end_time || item.entry.endTime}
                      </span>
                      <span>
                        Lecturer:{' '}
                        {lecturerMap[
                          String(
                            item.entry.lecturer_id ?? item.entry.lecturerId
                          )
                        ]?.name ||
                          lecturerMap[
                            String(
                              item.entry.lecturer_id ?? item.entry.lecturerId
                            )
                          ]?.email ||
                          'N/A'}
                      </span>
                      <span>
                        Cohorts:{' '}
                        {(item.entry.cohortIds || [item.entry.cohort_id])
                          .map(id => cohortMap[String(id)])
                          .filter(Boolean)
                          .map(
                            cohort =>
                              `${cohort.name} (${
                                cohort.student_count ?? cohort.studentCount ?? 0
                              } students)`
                          )
                          .join(', ') || 'N/A'}
                      </span>
                      <span>{item.entry.status || 'SCHEDULED'}</span>
                    </article>
                  )
                )
              ) : (
                <p>No allocations found for this venue.</p>
              )}
            </div>
          </section>
        </div>
      )}
      {venueToDelete && canManageVenues && (
        <ConfirmActionModal
          title='Delete venue?'
          message={`Delete ${
            venueToDelete.name || venueToDelete.venue_name
          }? This deletion will be recorded in the audit history.`}
          isPending={deleteVenueMutation.isPending}
          onCancel={() => setVenueToDelete(null)}
          onConfirm={() =>
            deleteVenueMutation.mutate(venueToDelete.id, {
              onSuccess: () => setVenueToDelete(null)
            })
          }
        />
      )}
    </div>
  )
}

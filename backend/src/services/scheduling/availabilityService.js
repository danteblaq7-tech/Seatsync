import {
  checkVenueConflict,
  checkVenueBlockConflict
} from './conflictService.js'

const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB
const toMinutes = time => {
  if (!time) return 0
  const [hours, minutes] = String(time).split(':').map(Number)
  return hours * 60 + minutes
}

export const findAvailableVenues = ({
  venues = [],
  existingEvents = [],
  venueBlocks = [],
  date,
  startTime,
  endTime,
  requiredCapacity = 0,
  venueType = null
}) => {
  if (!date || !startTime || !endTime) {
    return []
  }

  return venues.filter(venue => {
    if (!venue || venue.status !== 'ACTIVE' || venue.capacity <= 0) return false
    if (requiredCapacity && Number(venue.capacity) < Number(requiredCapacity))
      return false
    if (venueType && venue.venue_type_id && venueType !== venue.venue_type_id)
      return false

    const venueEventConflict = checkVenueConflict({
      venueId: venue.id,
      startTime,
      endTime,
      existingEvents
    })

    if (!venueEventConflict.valid) return false

    const blockConflict = checkVenueBlockConflict({
      startTime,
      endTime,
      venueBlocks: venueBlocks.filter(block => block.venue_id === venue.id)
    })

    return blockConflict.valid
  })
}

export const isVenueAvailable = ({
  venue,
  startTime,
  endTime,
  existingEvents = [],
  venueBlocks = []
}) => {
  if (!venue || venue.status !== 'ACTIVE') return false
  const timeConflict = checkVenueConflict({
    venueId: venue.id,
    startTime,
    endTime,
    existingEvents
  })

  if (!timeConflict.valid) return false

  const blockConflict = checkVenueBlockConflict({
    startTime,
    endTime,
    venueBlocks: venueBlocks.filter(block => block.venue_id === venue.id)
  })

  return blockConflict.valid
}

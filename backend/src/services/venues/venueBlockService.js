import { createRow } from '../../repositories/sqlRepository.js'
import { emitSocketEvent } from '../../socket/socketEvents.js'

export const createVenueBlock = async ({
  venueId,
  startDatetime,
  endDatetime,
  reason,
  status = 'ACTIVE'
}) => {
  if (!venueId || !startDatetime || !endDatetime) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'Venue, start, and end are required.'
        }
      ]
    }
  }

  const record = await createRow('venue_blocks', {
    venue_id: Number(venueId),
    start_datetime: startDatetime,
    end_datetime: endDatetime,
    reason,
    status,
    created_by: 1
  })

  emitSocketEvent('venue:blocked', record)

  return { valid: true, data: record }
}

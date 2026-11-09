export const uniqueScheduleIds = values =>
  [...new Set((values || []).map(Number).filter(Boolean))]

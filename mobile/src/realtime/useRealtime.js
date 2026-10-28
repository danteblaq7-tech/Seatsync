import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { API_URL } from '../config'

/**
 * Same Socket.IO subscription the web ProtectedLayout sets up:
 *   timetable:changed -> refresh schedule queries
 *   audit:changed     -> refresh audit logs
 */
export default function useRealtime () {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = io(API_URL, { transports: ['websocket'] })

    const refreshScheduleData = () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
      queryClient.invalidateQueries({ queryKey: ['timetable-exams'] })
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['venue-timetable-allocations'] })
    }

    socket.on('timetable:changed', refreshScheduleData)
    socket.on('audit:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
    })

    return () => {
      socket.disconnect()
    }
  }, [queryClient])
}

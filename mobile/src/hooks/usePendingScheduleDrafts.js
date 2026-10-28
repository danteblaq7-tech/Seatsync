import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

/**
 * Server-side schedule drafts (stage -> review -> publish).
 * The web hook also imported legacy browser-localStorage drafts; a fresh mobile install has none,
 * so that migration step is intentionally dropped.
 */
export default function usePendingScheduleDrafts () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const { data: drafts = [] } = useQuery({
    queryKey: ['schedule-drafts', user?.id],
    queryFn: async () => {
      const response = await api.get('/api/schedules/drafts')
      return Array.isArray(response?.data) ? response.data : []
    },
    enabled: Boolean(user?.id)
  })

  useEffect(() => {
    if (!publishError) return undefined
    const timeout = setTimeout(() => setPublishError(''), 10000)
    return () => clearTimeout(timeout)
  }, [publishError])

  const stageDraft = useCallback(
    async (kind, payload, createdBy = null) => {
      setPublishError('')
      const response = await api.post('/api/schedules/drafts', { kind, payload, createdBy })
      await queryClient.invalidateQueries({ queryKey: ['schedule-drafts'] })
      return response?.data
    },
    [queryClient]
  )

  const removeDraft = useCallback(
    id =>
      api
        .del(`/api/schedules/drafts/${encodeURIComponent(id)}`)
        .then(() => queryClient.invalidateQueries({ queryKey: ['schedule-drafts'] }))
        .catch(error => {
          setPublishError(error.message || 'Unable to remove the pending draft.')
          throw error
        }),
    [queryClient]
  )

  const updateDraft = useCallback(
    async (id, payload) => {
      setPublishError('')
      const response = await api.put(`/api/schedules/drafts/${encodeURIComponent(id)}`, { payload })
      await queryClient.invalidateQueries({ queryKey: ['schedule-drafts'] })
      return response?.data
    },
    [queryClient]
  )

  const publishDrafts = useCallback(
    async (selectedDrafts = null) => {
      const batch = selectedDrafts || drafts
      if (!batch.length) return
      setIsPublishing(true)
      setPublishError('')
      try {
        await api.post('/api/schedules/publish', { draftIds: batch.map(draft => draft.id) })
        await Promise.all(
          ['schedule-drafts', 'timetable', 'exams', 'dashboard-summary', 'venues'].map(key =>
            queryClient.invalidateQueries({ queryKey: [key] })
          )
        )
      } catch (error) {
        setPublishError(
          error.message || 'Unable to publish schedule drafts. Nothing was added to the timetable.'
        )
        throw error
      } finally {
        setIsPublishing(false)
      }
    },
    [drafts, queryClient]
  )

  return { drafts, stageDraft, removeDraft, updateDraft, publishDrafts, isPublishing, publishError }
}

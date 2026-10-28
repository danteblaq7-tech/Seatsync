import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

const STORAGE_KEY = 'seatsync-pending-schedule-drafts'

export default function usePendingScheduleDrafts () {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const legacyImportStarted = useRef(false)

  const { data: drafts = [], isFetched } = useQuery({
    queryKey: ['schedule-drafts', user?.id],
    queryFn: async () => {
      const response = await api.get('/api/schedules/drafts')
      return Array.isArray(response?.data) ? response.data : []
    },
    enabled: Boolean(user?.id)
  })

  useEffect(() => {
    if (!isFetched || legacyImportStarted.current) return
    legacyImportStarted.current = true
    let localDrafts = []
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) || '[]'
      )
      if (Array.isArray(parsed)) localDrafts = parsed
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
    if (!localDrafts.length) return

    const knownIds = new Set(drafts.map(draft => String(draft.id)))
    const remaining = []
    const importDrafts = async () => {
      for (const draft of localDrafts) {
        if (knownIds.has(String(draft.id))) continue
        try {
          await api.post('/api/schedules/drafts', draft)
        } catch (error) {
          remaining.push(draft)
          console.warn('[SCHEDULE][LEGACY_DRAFT_IMPORT_FAILED]', error.message)
        }
      }
      if (remaining.length) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining))
        setPublishError(
          `${remaining.length} older local draft(s) could not be moved to shared storage. Resolve conflicts or permissions, then reload to retry.`
        )
      } else {
        window.localStorage.removeItem(STORAGE_KEY)
      }
      await queryClient.invalidateQueries({ queryKey: ['schedule-drafts'] })
    }
    importDrafts().catch(error => {
      setPublishError(
        error.message || 'Could not import older schedule drafts.'
      )
    })
  }, [drafts, isFetched, queryClient])

  useEffect(() => {
    if (!publishError) return undefined
    const timeout = setTimeout(() => setPublishError(''), 10000)
    return () => clearTimeout(timeout)
  }, [publishError])

  const stageDraft = useCallback(
    async (kind, payload, createdBy = null) => {
      setPublishError('')
      try {
        const response = await api.post('/api/schedules/drafts', {
          kind,
          payload,
          createdBy
        })
        await queryClient.invalidateQueries({ queryKey: ['schedule-drafts'] })
        return response?.data
      } catch (error) {
        throw error
      }
    },
    [queryClient]
  )

  const removeDraft = useCallback(
    id => {
      return api
        .del(`/api/schedules/drafts/${encodeURIComponent(id)}`)
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ['schedule-drafts'] })
        )
        .catch(error => {
          setPublishError(
            error.message || 'Unable to remove the pending draft.'
          )
          throw error
        })
    },
    [queryClient]
  )

  const updateDraft = useCallback(
    async (id, payload) => {
      setPublishError('')
      try {
        const response = await api.put(
          `/api/schedules/drafts/${encodeURIComponent(id)}`,
          { payload }
        )
        await queryClient.invalidateQueries({ queryKey: ['schedule-drafts'] })
        return response?.data
      } catch (error) {
        throw error
      }
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
        await api.post('/api/schedules/publish', {
          draftIds: batch.map(draft => draft.id)
        })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['schedule-drafts'] }),
          queryClient.invalidateQueries({ queryKey: ['timetable'] }),
          queryClient.invalidateQueries({ queryKey: ['exams'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
          queryClient.invalidateQueries({ queryKey: ['venues'] })
        ])
      } catch (error) {
        setPublishError(
          error.message ||
            'Unable to publish schedule drafts. Nothing was added to the timetable.'
        )
        throw error
      } finally {
        setIsPublishing(false)
      }
    },
    [drafts, queryClient]
  )

  return {
    drafts,
    stageDraft,
    removeDraft,
    updateDraft,
    publishDrafts,
    isPublishing,
    publishError
  }
}

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

export default function NotificationsPage () {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const {
    data = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const response = await api.get('/api/notifications')
      return toArray(response)
    },
    enabled: Boolean(user?.id)
  })

  const rows = useMemo(() => data || [], [data])
  const unreadCount = rows.filter(
    item => !(item.isRead ?? item.is_read ?? item.read)
  ).length

  const filteredRows = useMemo(() => {
    return rows.filter(item => {
      const text = `${item.title || ''} ${item.message || ''}`.toLowerCase()
      return text.includes(search.toLowerCase())
    })
  }, [rows, search])

  const markRead = async id => {
    try {
      await api.patch(`/api/notifications/${id}/read`, {})
      await queryClient.invalidateQueries({
        queryKey: ['notifications', user?.id]
      })
    } catch (error) {
      console.error('Failed to mark notification read:', error)
    }
  }

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Communication</p>
          <h1>Notifications</h1>
          <p className='muted'>Live updates from your academic workspace.</p>
        </div>
        <span className='notification-unread-count'>
          {unreadCount} unread
        </span>
      </div>

      <section className='content-panel'>
        <div className='filter-row'>
          <input
            type='text'
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder='Search notifications'
          />
        </div>
      </section>

      <section className='content-panel'>
        {isLoading ? (
          <p>Loading notifications...</p>
        ) : error ? (
          <p className='form-error'>Unable to load notifications.</p>
        ) : (
          <ul className='notification-list' aria-live='polite'>
            {filteredRows.length ? (
              filteredRows.map(item => {
                const isRead = Boolean(
                  item.isRead ?? item.is_read ?? item.read
                )
                return (
                  <li
                    key={item.id ?? item.title ?? item.message}
                    className={`notification-item ${
                      isRead ? 'is-read' : 'is-new'
                    }`}
                  >
                    <div className='notification-copy'>
                      <strong>
                        {item.title || item.type || 'Notification'}
                      </strong>
                      <span>{item.message || 'No detail provided.'}</span>
                    </div>
                    <div className='toolbar-actions compact'>
                      <span
                        className={`status-badge ${isRead ? 'ok' : 'warn'}`}
                      >
                        {isRead ? 'Read' : 'New'}
                      </span>
                      {!isRead && (
                        <button
                          type='button'
                          className='secondary-button'
                          onClick={() => markRead(item.id)}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </li>
                )
              })
            ) : (
              <li>
                <strong>No notifications</strong>
                <span>There are no notifications to display.</span>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  )
}

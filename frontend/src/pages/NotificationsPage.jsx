import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

export default function NotificationsPage () {
  const [search, setSearch] = useState('')
  const {
    data = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get('/api/notifications')
      return toArray(response)
    }
  })

  const rows = data || []

  const filteredRows = useMemo(() => {
    return rows.filter(item => {
      const text = `${item.title || ''} ${item.message || ''}`.toLowerCase()
      return text.includes(search.toLowerCase())
    })
  }, [rows, search])

  const markRead = async id => {
    try {
      await api.patch(`/api/notifications/${id}/read`, {})
      window.location.reload()
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
        </div>
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
          <ul className='notification-list'>
            {filteredRows.length ? (
              filteredRows.map(item => (
                <li key={item.id ?? item.title ?? item.message}>
                  <div>
                    <strong>{item.title || item.type || 'Notification'}</strong>
                    <span>{item.message || 'No detail provided.'}</span>
                  </div>
                  <div className='toolbar-actions compact'>
                    <span
                      className={`status-badge ${item.read ? 'ok' : 'warn'}`}
                    >
                      {item.read ? 'Read' : 'New'}
                    </span>
                    {!item.read && (
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
              ))
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

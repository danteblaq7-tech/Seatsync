import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import PaginationControls from '../components/PaginationControls'

const internalAuditFields = new Set([
  'created_at',
  'updated_at',
  'deleted_at',
  'user_id',
  'ip_address',
  'user_agent',
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token'
])

const deletedRecordFields = new Set([
  'name',
  'code',
  'unit_name',
  'unit_code',
  'cohort_name',
  'email',
  'exam_date',
  'effective_date'
])

const fieldLabels = {
  is_active: 'Status',
  active: 'Status',
  is_current: 'Academic year status',
  student_count: 'Student count',
  year_level: 'Year level',
  duration_years: 'Programme duration',
  allocated_capacity: 'Allocated capacity',
  exam_date: 'Exam date',
  effective_date: 'Class date',
  start_time: 'Start time',
  end_time: 'End time',
  unit_name: 'Unit',
  unit_code: 'Unit code',
  cohort_name: 'Cohort',
  venue_name: 'Venue'
}

const normalizeAuditKey = key =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

const isInternalAuditField = key => {
  const normalized = normalizeAuditKey(key)
  return (
    internalAuditFields.has(normalized) ||
    normalized === 'id' ||
    normalized.endsWith('_id') ||
    normalized.endsWith('_ids')
  )
}

const auditFieldLabel = key => {
  const normalized = normalizeAuditKey(key)
  return (
    fieldLabels[normalized] ||
    normalized
      .split('_')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )
}

const parseAuditRecord = value => {
  if (typeof value === 'string') {
    try {
      return parseAuditRecord(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
}

const formatAuditValue = (value, key = '') => {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (typeof value === 'boolean') {
    if (['active', 'is_active'].includes(normalizeAuditKey(key))) {
      return value ? 'Active' : 'Inactive'
    }
    return value ? 'Yes' : 'No'
  }
  if (typeof value === 'number' || typeof value === 'string') {
    if (normalizeAuditKey(key) === 'status') {
      return value
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/\b\w/g, character => character.toUpperCase())
    }
    return String(value)
  }
  if (Array.isArray(value)) {
    return value
      .map(item => formatAuditValue(item))
      .filter(Boolean)
      .join(', ')
  }
  return Object.entries(value)
    .filter(([entryKey]) => !isInternalAuditField(entryKey))
    .map(
      ([entryKey, entryValue]) =>
        `${auditFieldLabel(entryKey)}: ${formatAuditValue(
          entryValue,
          entryKey
        )}`
    )
    .join(', ')
}

const getAuditChanges = log => {
  const action = String(log.action || '').toUpperCase()
  const before = parseAuditRecord(log.old_values ?? log.oldValues)
  const after = parseAuditRecord(log.new_values ?? log.newValues)

  if (action === 'DELETE') {
    return Object.entries(before)
      .filter(([key]) => deletedRecordFields.has(normalizeAuditKey(key)))
      .map(([key, value]) => ({
        key: normalizeAuditKey(key),
        label: auditFieldLabel(key),
        value,
        type: 'detail'
      }))
  }

  const beforeFields = new Map(
    Object.entries(before).map(([key, value]) => [
      normalizeAuditKey(key),
      value
    ])
  )
  const afterFields = new Map(
    Object.entries(after).map(([key, value]) => [normalizeAuditKey(key), value])
  )
  const fieldKeys = new Set([...beforeFields.keys(), ...afterFields.keys()])
  const hasBeforeAndAfter =
    Object.keys(before).length > 0 && Object.keys(after).length > 0

  return [...fieldKeys]
    .filter(key => !isInternalAuditField(key))
    .filter(key => {
      if (!hasBeforeAndAfter) return true
      return (
        JSON.stringify(beforeFields.get(key)) !==
        JSON.stringify(afterFields.get(key))
      )
    })
    .map(key => ({
      key,
      label: auditFieldLabel(key),
      before: beforeFields.get(key),
      after: afterFields.get(key),
      type: hasBeforeAndAfter ? 'change' : 'detail'
    }))
}

const auditTimestampLabel = action => {
  if (action === 'DELETE') return 'Deleted at'
  if (action === 'ARCHIVE_COHORT') return 'Archived at'
  if (action === 'CREATE_MAKEUP_CLASS') return 'Requested at'
  if (action === 'UPDATE') return 'Updated at'
  return 'Recorded at'
}

const auditActionLabel = action => {
  const labels = {
    DELETE: 'Record deleted',
    UPDATE: 'Record updated',
    ARCHIVE_COHORT: 'Cohort archived',
    CREATE_MAKEUP_CLASS: 'Make-up class requested',
    BLOCK_USER: 'User blocked',
    UNBLOCK_USER: 'User unblocked'
  }
  return labels[action] || String(action || 'Audit record').replaceAll('_', ' ')
}

export default function ReportsPage () {
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('all')
  const [entityType, setEntityType] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState('date')
  const [direction, setDirection] = useState('desc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [viewingLog, setViewingLog] = useState(null)

  const {
    data: result = {},
    isLoading,
    error
  } = useQuery({
    queryKey: [
      'audit-logs',
      search,
      action,
      entityType,
      dateFrom,
      dateTo,
      sort,
      direction,
      page,
      limit
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        search,
        action: action === 'all' ? '' : action,
        entityType: entityType === 'all' ? '' : entityType,
        dateFrom,
        dateTo,
        sort,
        direction,
        page: String(page),
        limit: String(limit)
      })
      return api.get(`/api/audit/logs?${params}`)
    }
  })
  const logs = Array.isArray(result.data) ? result.data : []
  const pagination = result.pagination || {}
  const updateFilter = setter => event => {
    setter(event.target.value)
    setPage(1)
  }
  const viewingAction = String(viewingLog?.action || '').toUpperCase()
  const auditChanges = viewingLog ? getAuditChanges(viewingLog) : []

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Administration</p>
          <h1>Audit history</h1>
          <p>
            Review academic record changes, deletions, and temporary class
            requests.
          </p>
        </div>
      </div>

      <section className='content-panel table-panel'>
        <div className='filter-row academic-list-filters audit-filter-row'>
          <input
            type='search'
            value={search}
            onChange={updateFilter(setSearch)}
            placeholder='Search action, user, record, or reason'
          />
          <select value={action} onChange={updateFilter(setAction)}>
            <option value='all'>All actions</option>
            <option value='UPDATE'>Updates</option>
            <option value='DELETE'>Deletions</option>
            <option value='ARCHIVE_COHORT'>Cohort archives</option>
            <option value='BLOCK_USER'>Block user</option>
            <option value='UNBLOCK_USER'>Unblock user</option>
            <option value='CREATE_MAKEUP_CLASS'>Make-up class requests</option>
          </select>
          <select value={entityType} onChange={updateFilter(setEntityType)}>
            <option value='all'>All record types</option>
            {[
              'unit',
              'cohort',
              'student',
              'lecturer',
              'venue',
              'exam',
              'user',
              'schedule_override'
            ].map(type => (
              <option key={type} value={type}>
                {type.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <label>
            From
            <input
              type='date'
              value={dateFrom}
              onChange={updateFilter(setDateFrom)}
            />
          </label>
          <label>
            To
            <input
              type='date'
              value={dateTo}
              onChange={updateFilter(setDateTo)}
            />
          </label>
          <select value={sort} onChange={updateFilter(setSort)}>
            <option value='date'>Sort by date</option>
            <option value='action'>Sort by action</option>
            <option value='entity'>Sort by record type</option>
            <option value='user'>Sort by user</option>
          </select>
          <button
            type='button'
            className='secondary-button'
            onClick={() => {
              setDirection(value => (value === 'asc' ? 'desc' : 'asc'))
              setPage(1)
            }}
          >
            {direction === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        {isLoading ? (
          <p>Loading audit history...</p>
        ) : error ? (
          <p className='form-error'>
            Unable to load audit history. Admin access is required.
          </p>
        ) : (
          <div className='academic-records-scroll'>
            <table className='audit-log-table'>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Record ID</th>
                  <th>Reason</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {logs.length ? (
                  logs.map(log => (
                    <tr key={log.id}>
                      <td>
                        {log.created_at
                          ? new Date(log.created_at).toLocaleString()
                          : '—'}
                      </td>
                      <td>
                        {[log.first_name, log.last_name]
                          .filter(Boolean)
                          .join(' ') ||
                          log.email ||
                          'System'}
                      </td>
                      <td>{String(log.action || '').replaceAll('_', ' ')}</td>
                      <td>
                        {String(log.entity_type || '').replaceAll('_', ' ')}
                      </td>
                      <td>{log.entity_id ?? '—'}</td>
                      <td>{log.reason || '—'}</td>
                      <td>
                        <button
                          type='button'
                          className='table-action'
                          onClick={() => setViewingLog(log)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan='7'>No audit entries match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={pagination.page || page}
          pageSize={pagination.limit || limit}
          totalItems={pagination.totalItems || 0}
          totalPages={pagination.totalPages || 1}
          onPageChange={setPage}
          onPageSizeChange={size => {
            setLimit(size)
            setPage(1)
          }}
        />
      </section>
      {viewingLog && (
        <div
          className='profile-modal-backdrop'
          onClick={() => setViewingLog(null)}
        >
          <section
            className='profile-modal content-panel audit-detail-modal'
            role='dialog'
            aria-modal='true'
            aria-labelledby='audit-detail-heading'
            onClick={event => event.stopPropagation()}
          >
            <div className='page-header'>
              <div>
                <p className='eyebrow'>Audit record · #{viewingLog.id}</p>
                <h2 id='audit-detail-heading'>
                  {auditActionLabel(viewingAction)}
                </h2>
              </div>
              <button
                type='button'
                className='secondary-button'
                onClick={() => setViewingLog(null)}
              >
                Close
              </button>
            </div>
            <dl className='audit-detail-meta'>
              <div>
                <dt>Actor</dt>
                <dd>
                  {[viewingLog.first_name, viewingLog.last_name]
                    .filter(Boolean)
                    .join(' ') ||
                    viewingLog.email ||
                    'System'}
                </dd>
              </div>
              <div>
                <dt>Record</dt>
                <dd>
                  {String(viewingLog.entity_type || '').replaceAll('_', ' ')} #
                  {viewingLog.entity_id ?? '—'}
                </dd>
              </div>
              <div>
                <dt>{auditTimestampLabel(viewingAction)}</dt>
                <dd>
                  {viewingLog.created_at
                    ? new Date(viewingLog.created_at).toLocaleString()
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{viewingLog.reason || 'No reason supplied'}</dd>
              </div>
            </dl>
            <h3 className='audit-detail-section-heading'>
              {viewingAction === 'DELETE'
                ? 'Deleted record'
                : viewingAction === 'UPDATE'
                ? 'Changes made'
                : 'Relevant details'}
            </h3>
            <div className='audit-detail-changes'>
              {auditChanges.length ? (
                auditChanges.map(change => (
                  <section key={change.key}>
                    <h3>{change.label}</h3>
                    {change.type === 'change' ? (
                      <>
                        <p>
                          <strong>Before:</strong>{' '}
                          {formatAuditValue(change.before, change.key)}
                        </p>
                        <p>
                          <strong>After:</strong>{' '}
                          {formatAuditValue(change.after, change.key)}
                        </p>
                      </>
                    ) : (
                      <p>
                        <strong>
                          {viewingAction === 'DELETE' ? 'Was:' : 'Details:'}
                        </strong>{' '}
                        {formatAuditValue(
                          change.type === 'detail' && change.value !== undefined
                            ? change.value
                            : change.after,
                          change.key
                        )}
                      </p>
                    )}
                  </section>
                ))
              ) : (
                <p className='audit-detail-empty'>
                  No relevant record details were recorded.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

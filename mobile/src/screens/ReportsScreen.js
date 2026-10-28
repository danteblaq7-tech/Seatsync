import React, { useState } from 'react'
import { View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { colors, radius } from '../theme'
import { humanize, qs } from '../utils/data'
import DataTable from '../components/DataTable'
import PaginationControls from '../components/PaginationControls'
import Select from '../components/Select'
import Sheet from '../components/Sheet'
import { DateField } from '../components/DateTime'
import {
  Body,
  DetailCell,
  Eyebrow,
  Field,
  FilterRow,
  FormError,
  H2,
  H3,
  P,
  PageHeader,
  Panel,
  Screen,
  SecondaryButton,
  TableAction,
  TextField
} from '../components/ui'

const prettyAuditDetails = value => {
  if (!value) return 'No data recorded.'
  const normalize = raw => {
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return raw
      }
    }
    return raw
  }
  const formatValue = raw => {
    const parsed = normalize(raw)
    if (parsed === null || parsed === undefined) return '—'
    if (typeof parsed === 'boolean') return parsed ? 'Yes' : 'No'
    if (typeof parsed === 'number' || typeof parsed === 'string') return String(parsed)
    if (Array.isArray(parsed)) {
      return parsed
        .map(item =>
          typeof item === 'object' && item !== null
            ? Object.entries(item).map(([k, v]) => `${k}: ${formatValue(v)}`).join(', ')
            : formatValue(item)
        )
        .join(' | ')
    }
    if (typeof parsed === 'object') {
      return Object.entries(parsed)
        .map(([k, v]) => `${k.replaceAll('_', ' ')}: ${formatValue(v)}`)
        .join(' • ')
    }
    return String(parsed)
  }
  return formatValue(value)
}

const actions = [
  ['all', 'All actions'],
  ['UPDATE', 'Updates'],
  ['DELETE', 'Deletions'],
  ['ARCHIVE_COHORT', 'Cohort archives'],
  ['BLOCK_USER', 'Block user'],
  ['UNBLOCK_USER', 'Unblock user'],
  ['CREATE_MAKEUP_CLASS', 'Make-up class requests']
]
const entityTypes = ['unit', 'cohort', 'student', 'lecturer', 'venue', 'exam', 'user', 'schedule_override']

export default function ReportsScreen () {
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

  const { data: result = {}, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['audit-logs', search, action, entityType, dateFrom, dateTo, sort, direction, page, limit],
    queryFn: () =>
      api.get(
        `/api/audit/logs?${qs({
          search,
          action: action === 'all' ? '' : action,
          entityType: entityType === 'all' ? '' : entityType,
          dateFrom,
          dateTo,
          sort,
          direction,
          page,
          limit
        })}`
      )
  })
  const logs = Array.isArray(result.data) ? result.data : []
  const pagination = result.pagination || {}
  const filter = setter => value => {
    setter(value)
    setPage(1)
  }

  const actor = log => [log.first_name, log.last_name].filter(Boolean).join(' ') || log.email || 'System'

  const columns = [
    { key: 'date', label: 'Date', width: 190, value: l => (l.created_at ? new Date(l.created_at).toLocaleString() : '—') },
    { key: 'user', label: 'User', width: 160, value: actor },
    { key: 'action', label: 'Action', width: 170, value: l => humanize(l.action) },
    { key: 'record', label: 'Record', width: 130, value: l => humanize(l.entity_type) },
    { key: 'id', label: 'Record ID', width: 100, value: l => l.entity_id ?? '—' },
    { key: 'reason', label: 'Reason', width: 200, value: l => l.reason || '—' },
    { key: 'changes', label: 'Changes', width: 100, render: l => <TableAction title='View' onPress={() => setViewingLog(l)} /> }
  ]

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader
        eyebrow='Administration'
        title='Audit history'
        description='Review academic record changes, deletions, and temporary class requests.'
      />

      <Panel>
        <FilterRow style={{ marginBottom: 16 }}>
          <TextField value={search} onChangeText={filter(setSearch)} placeholder='Search action, user, record, or reason' />
          <Select value={action} onChange={filter(setAction)} searchable={false} options={actions.map(([value, label]) => ({ value, label }))} />
          <Select
            value={entityType}
            onChange={filter(setEntityType)}
            searchable={false}
            options={[{ value: 'all', label: 'All record types' }, ...entityTypes.map(t => ({ value: t, label: humanize(t) }))]}
          />
          <Field label='From'>
            <DateField value={dateFrom} onChange={filter(setDateFrom)} />
          </Field>
          <Field label='To'>
            <DateField value={dateTo} onChange={filter(setDateTo)} />
          </Field>
          <Select
            value={sort}
            onChange={filter(setSort)}
            searchable={false}
            options={[
              { value: 'date', label: 'Sort by date' },
              { value: 'action', label: 'Sort by action' },
              { value: 'entity', label: 'Sort by record type' },
              { value: 'user', label: 'Sort by user' }
            ]}
          />
          <SecondaryButton
            title={direction === 'desc' ? 'Newest first' : 'Oldest first'}
            onPress={() => {
              setDirection(v => (v === 'asc' ? 'desc' : 'asc'))
              setPage(1)
            }}
          />
        </FilterRow>

        {isLoading ? (
          <P>Loading audit history...</P>
        ) : error ? (
          <FormError style={{ marginVertical: 16 }}>Unable to load audit history. Admin access is required.</FormError>
        ) : (
          <DataTable columns={columns} rows={logs} rowKey={l => l.id} minWidth={1100} emptyText='No audit entries match these filters.' maxHeight={520} />
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
      </Panel>

      {viewingLog && (
        <Sheet visible onClose={() => setViewingLog(null)} maxWidth={980}>
          <View style={{ gap: 12 }}>
            <View>
              <Eyebrow>Audit record · #{viewingLog.id}</Eyebrow>
              <H2>{humanize(viewingLog.action)}</H2>
            </View>
            <View style={{ alignSelf: 'flex-start' }}>
              <SecondaryButton title='Close' onPress={() => setViewingLog(null)} />
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <DetailCell label='Actor' value={actor(viewingLog)} />
            <DetailCell label='Record' value={`${humanize(viewingLog.entity_type)} #${viewingLog.entity_id ?? '—'}`} />
            <DetailCell label='Timestamp' value={viewingLog.created_at ? new Date(viewingLog.created_at).toLocaleString() : '—'} />
            <DetailCell label='Reason' value={viewingLog.reason || 'No reason supplied'} />
          </View>
          <View style={{ gap: 14 }}>
            <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.input, padding: 12 }}>
              <H3>Before</H3>
              <Body>{prettyAuditDetails(viewingLog.old_values)}</Body>
            </View>
            <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.input, padding: 12 }}>
              <H3>After</H3>
              <Body>{prettyAuditDetails(viewingLog.new_values)}</Body>
            </View>
          </View>
        </Sheet>
      )}
    </Screen>
  )
}

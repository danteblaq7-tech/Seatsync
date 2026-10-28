import React, { useMemo, useState } from 'react'
import { View } from 'react-native'
import DataTable from './DataTable'
import Select from './Select'
import { H2, Panel, SecondaryButton, TableAction, DangerAction, TextField } from './ui'

const getColumnValue = (record, column) => (column.value ? column.value(record) : record[column.key])

/** Port of AcademicRecordsTable: search + filters + sort + scrollable (max 390px) table. */
export default function AcademicRecordsTable ({ title, records = [], columns = [], filters = [], onEdit, onDelete }) {
  const [search, setSearch] = useState('')
  const [filterValues, setFilterValues] = useState({})
  const [sortBy, setSortBy] = useState(columns[0]?.key || '')
  const [sortDirection, setSortDirection] = useState('asc')

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return [...records]
      .filter(record => {
        const matchesSearch =
          !needle ||
          columns.some(c =>
            `${getColumnValue(record, c) ?? ''} ${c.searchValue ? c.searchValue(record) : ''}`.toLowerCase().includes(needle)
          )
        return (
          matchesSearch &&
          filters.every(f => {
            const selected = filterValues[f.key] || 'all'
            return selected === 'all' || String(f.value(record)) === String(selected)
          })
        )
      })
      .sort((a, b) => {
        const column = columns.find(c => c.key === sortBy) || columns[0]
        if (!column) return 0
        const av = getColumnValue(a, column)
        const bv = getColumnValue(b, column)
        const cmp =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' })
        return sortDirection === 'asc' ? cmp : -cmp
      })
  }, [columns, filterValues, filters, records, search, sortBy, sortDirection])

  const tableColumns = [
    ...columns.map(c => ({ key: c.key, label: c.label, width: c.width ?? 150, value: r => getColumnValue(r, c) })),
    ...(onEdit || onDelete
      ? [{
          key: '__actions',
          label: 'Actions',
          width: 170,
          render: record => (
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {onEdit && <TableAction title='Edit' onPress={() => onEdit(record)} />}
              {onDelete && <DangerAction title='Delete' onPress={() => onDelete(record)} />}
            </View>
          )
        }]
      : [])
  ]

  return (
    <Panel style={{ padding: 16, gap: 14 }}>
      <H2>{title}</H2>
      <View style={{ gap: 12 }}>
        <TextField value={search} onChangeText={setSearch} placeholder={`Search ${title.toLowerCase()}`} />
        {filters.map(f => (
          <Select
            key={f.key}
            searchable={f.searchable}
            value={filterValues[f.key] || 'all'}
            onChange={value => setFilterValues(cur => ({ ...cur, [f.key]: value }))}
            options={[{ value: 'all', label: `All ${f.label.toLowerCase()}` }, ...f.options.map(o => ({ ...o, value: String(o.value) }))]}
            searchPlaceholder={`Search ${f.label.toLowerCase()}`}
          />
        ))}
        <Select
          value={sortBy}
          onChange={setSortBy}
          searchable={false}
          options={columns.map(c => ({ value: c.key, label: `Sort by ${c.label.toLowerCase()}` }))}
        />
        <View style={{ alignSelf: 'flex-start' }}>
          <SecondaryButton
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            onPress={() => setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))}
          />
        </View>
      </View>
      <DataTable
        columns={tableColumns}
        rows={visible}
        rowKey={(r, i) => r.id ?? r.code ?? `${title}-${i}`}
        maxHeight={390}
        emptyText={`No ${title.toLowerCase()} match.`}
        showsHorizontalScrollIndicator={false}
      />
    </Panel>
  )
}

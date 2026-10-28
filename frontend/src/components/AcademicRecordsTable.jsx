import { useMemo, useState } from 'react'
import SearchableSelect from './SearchableSelect'

const getColumnValue = (record, column) =>
  column.value ? column.value(record) : record[column.key]

export default function AcademicRecordsTable ({
  title,
  records = [],
  columns = [],
  filters = [],
  onEdit,
  onDelete
}) {
  const [search, setSearch] = useState('')
  const [filterValues, setFilterValues] = useState({})
  const [sortBy, setSortBy] = useState(columns[0]?.key || '')
  const [sortDirection, setSortDirection] = useState('asc')

  const visibleRecords = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return [...records]
      .filter(record => {
        const matchesSearch =
          !needle ||
          columns.some(column =>
            `${getColumnValue(record, column) ?? ''} ${
              column.searchValue ? column.searchValue(record) : ''
            }`
              .toLowerCase()
              .includes(needle)
          )
        return (
          matchesSearch &&
          filters.every(filter => {
            const selected = filterValues[filter.key] || 'all'
            return (
              selected === 'all' ||
              String(filter.value(record)) === String(selected)
            )
          })
        )
      })
      .sort((first, second) => {
        const column = columns.find(item => item.key === sortBy) || columns[0]
        if (!column) return 0
        const firstValue = getColumnValue(first, column)
        const secondValue = getColumnValue(second, column)
        const comparison =
          typeof firstValue === 'number' && typeof secondValue === 'number'
            ? firstValue - secondValue
            : String(firstValue ?? '').localeCompare(
                String(secondValue ?? ''),
                undefined,
                { numeric: true, sensitivity: 'base' }
              )
        return sortDirection === 'asc' ? comparison : -comparison
      })
  }, [columns, filterValues, filters, records, search, sortBy, sortDirection])

  return (
    <section className='content-panel table-panel academic-records-panel'>
      <div className='page-header compact-table-header'>
        <h2>{title}</h2>
        <div className='filter-row compact-table-filters'>
          <input
            type='search'
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
            aria-label={`Search ${title.toLowerCase()}`}
          />
          {filters.map(filter =>
            filter.searchable ? (
              <SearchableSelect
                key={filter.key}
                options={[
                  { value: 'all', label: `All ${filter.label.toLowerCase()}` },
                  ...filter.options
                ]}
                value={filterValues[filter.key] || 'all'}
                onChange={value =>
                  setFilterValues(current => ({
                    ...current,
                    [filter.key]: value
                  }))
                }
                placeholder={`All ${filter.label.toLowerCase()}`}
                searchPlaceholder={`Search ${filter.label.toLowerCase()}`}
                ariaLabel={`Filter ${title.toLowerCase()} by ${filter.label.toLowerCase()}`}
              />
            ) : (
              <select
                key={filter.key}
                value={filterValues[filter.key] || 'all'}
                onChange={event =>
                  setFilterValues(current => ({
                    ...current,
                    [filter.key]: event.target.value
                  }))
                }
                aria-label={`Filter ${title.toLowerCase()} by ${filter.label.toLowerCase()}`}
              >
                <option value='all'>All {filter.label.toLowerCase()}</option>
                {filter.options.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )
          )}
          <select
            value={sortBy}
            onChange={event => setSortBy(event.target.value)}
            aria-label={`Sort ${title.toLowerCase()} by`}
          >
            {columns.map(column => (
              <option key={column.key} value={column.key}>
                Sort by {column.label.toLowerCase()}
              </option>
            ))}
          </select>
          <button
            type='button'
            className='secondary-button'
            onClick={() =>
              setSortDirection(direction =>
                direction === 'asc' ? 'desc' : 'asc'
              )
            }
            aria-label={`Sort ${
              sortDirection === 'asc' ? 'descending' : 'ascending'
            }`}
          >
            {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          </button>
        </div>
      </div>
      <div className='academic-records-scroll'>
        <table>
          <thead>
            <tr>
              {columns.map(column => (
                <th key={column.key}>{column.label}</th>
              ))}
              {(onEdit || onDelete) && (
                <th className='academic-record-actions-heading'>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRecords.length ? (
              visibleRecords.map((record, index) => (
                <tr key={record.id ?? record.code ?? `${title}-${index}`}>
                  {columns.map(column => {
                    const value = getColumnValue(record, column)
                    const textValue =
                      value === null || value === undefined || value === ''
                        ? '—'
                        : String(value)
                    return (
                      <td key={column.key}>
                        <span className='table-cell-value' title={textValue}>
                          {textValue}
                        </span>
                      </td>
                    )
                  })}
                  {(onEdit || onDelete) && (
                    <td className='academic-record-actions'>
                      {onEdit && (
                        <button
                          type='button'
                          className='table-action'
                          onClick={() => onEdit(record)}
                        >
                          Edit
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type='button'
                          className='table-action danger'
                          onClick={() => onDelete(record)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length + (onEdit || onDelete ? 1 : 0)}>
                  No {title.toLowerCase()} match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

import { useState } from 'react'

export default function SearchableSelect ({
  options = [],
  value,
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search options',
  ariaLabel = 'Search options',
  multiple = false
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selectedValues = multiple
    ? (Array.isArray(value) ? value : []).map(String)
    : [String(value ?? '')]
  const selectedOptions = options.filter(option =>
    selectedValues.includes(String(option.value))
  )
  const needle = search.trim().toLowerCase()
  const visibleOptions = needle
    ? options.filter(option =>
        `${option.label ?? ''} ${option.searchText ?? ''}`
          .toLowerCase()
          .includes(needle)
      )
    : options

  const closeMenu = () => {
    setIsOpen(false)
    setSearch('')
  }

  const toggleOption = option => {
    const optionValue = String(option.value)
    if (multiple) {
      const nextValues = selectedValues.includes(optionValue)
        ? selectedValues.filter(item => item !== optionValue)
        : [...selectedValues, optionValue]
      onChange(nextValues)
      return
    }
    onChange(optionValue)
    closeMenu()
  }

  const triggerLabel = multiple
    ? selectedOptions.length
      ? selectedOptions.map(option => option.label).join(', ')
      : placeholder
    : selectedOptions[0]?.label || placeholder

  return (
    <div className='searchable-select'>
      <button
        type='button'
        className='searchable-select-trigger'
        aria-haspopup='listbox'
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen(open => !open)
          setSearch('')
        }}
      >
        {triggerLabel}
      </button>
      {isOpen && (
        <div className='searchable-select-menu'>
          <input
            type='search'
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={ariaLabel}
            autoFocus
          />
          <div
            className='searchable-select-options'
            role='listbox'
            aria-multiselectable={multiple}
          >
            {visibleOptions.length ? (
              visibleOptions.map(option => {
                const selected = selectedValues.includes(String(option.value))
                return (
                  <button
                    key={option.value}
                    type='button'
                    className='searchable-select-option'
                    role='option'
                    aria-selected={selected}
                    aria-pressed={selected}
                    onClick={() => toggleOption(option)}
                  >
                    {multiple && (
                      <span aria-hidden='true'>{selected ? '☑ ' : '☐ '}</span>
                    )}
                    {option.label}
                  </button>
                )
              })
            ) : (
              <span className='searchable-select-empty'>No options match.</span>
            )}
          </div>
          {multiple && (
            <button
              type='button'
              className='secondary-button'
              onClick={() => onChange([])}
              disabled={!selectedValues.length}
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  )
}

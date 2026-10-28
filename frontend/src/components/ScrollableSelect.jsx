import { useEffect, useRef, useState } from 'react'

export default function ScrollableSelect ({
  value = '',
  options = [],
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  required = false,
  ariaLabel = placeholder
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef(null)
  const selected = options.find(
    option => String(option.value) === String(value)
  )
  const filteredOptions = options.filter(option =>
    `${option.label} ${option.searchText || ''}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )

  useEffect(() => {
    const closeOnOutsideClick = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  return (
    <div className={`scrollable-select ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type='button'
        className='scrollable-select-trigger'
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-required={required}
        disabled={disabled}
        onClick={() => {
          setOpen(current => !current)
          setSearch('')
        }}
      >
        <span>{selected?.label || placeholder}</span>
        <span aria-hidden='true'>▾</span>
      </button>
      {open && !disabled && (
        <div className='scrollable-select-menu'>
          <input
            type='search'
            className='scrollable-select-search'
            value={search}
            autoFocus
            placeholder='Search options'
            aria-label={`Search ${ariaLabel.toLowerCase()}`}
            onChange={event => setSearch(event.target.value)}
          />
          <div
            className='scrollable-select-options'
            role='listbox'
            aria-label={ariaLabel}
          >
            {placeholder && (
              <button
                type='button'
                role='option'
                aria-selected={!selected}
                className='scrollable-select-option'
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                {placeholder}
              </button>
            )}
            {filteredOptions.map(option => (
              <button
                type='button'
                role='option'
                aria-selected={String(option.value) === String(value)}
                className='scrollable-select-option'
                key={option.value}
                onClick={() => {
                  onChange(String(option.value))
                  setOpen(false)
                }}
              >
                {option.label}
              </button>
            ))}
            {!filteredOptions.length && (
              <p className='scrollable-select-empty'>No matching options.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

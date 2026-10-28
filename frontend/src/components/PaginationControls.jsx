export default function PaginationControls ({
  page = 1,
  pageSize = 20,
  totalItems = 0,
  totalPages = 1,
  onPageChange,
  onPageSizeChange
}) {
  return (
    <div className='pagination-controls'>
      <span>
        {totalItems === 0
          ? 'No records'
          : `Showing ${(page - 1) * pageSize + 1}–${Math.min(
              page * pageSize,
              totalItems
            )} of ${totalItems}`}
      </span>
      <div className='toolbar-actions compact'>
        <label>
          Rows
          <select
            value={pageSize}
            onChange={event => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 20, 50, 100].map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button
          type='button'
          className='secondary-button'
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          type='button'
          className='secondary-button'
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  )
}

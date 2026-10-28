export default function ConfirmActionModal ({
  title = 'Confirm deletion',
  message,
  confirmLabel = 'Delete',
  eyebrow = 'This action cannot be undone',
  errorMessage = '',
  isPending = false,
  onConfirm,
  onCancel
}) {
  return (
    <div className='profile-modal-backdrop' onClick={onCancel}>
      <section
        className='profile-modal content-panel confirm-action-modal'
        role='alertdialog'
        aria-modal='true'
        aria-labelledby='confirm-action-title'
        onClick={event => event.stopPropagation()}
      >
        <p className='eyebrow'>{eyebrow}</p>
        <h2 id='confirm-action-title'>{title}</h2>
        <p>{message}</p>
        {errorMessage && <p className='form-error'>{errorMessage}</p>}
        <div className='toolbar-actions'>
          <button
            type='button'
            className='table-action danger'
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Deleting...' : confirmLabel}
          </button>
          <button
            type='button'
            className='secondary-button'
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  )
}

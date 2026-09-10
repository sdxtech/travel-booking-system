import React from 'react'

function BookingActions({
  booking,
  statusValue,
  canCancel,
  cancellationPolicyLabel,
  actionLoadingId,
  onEdit,
  onCancel,
  onValidate,
  onDetails,
}) {
  const isPending = statusValue === 'pending'
  const isAwaitingValidation = statusValue === 'awaiting_validation'

  return (
    <div className="table-row-actions table-action-buttons">
      <button
        type="button"
        className="btn btn-outline-brand"
        onClick={() => onEdit(booking)}
        disabled={!isPending || actionLoadingId === booking.id}
        title={isPending ? 'Edit this request' : 'Only pending requests can be edited'}
      >
        Edit
      </button>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => onCancel(booking.id)}
        disabled={!canCancel || actionLoadingId === booking.id}
        title={
          !isPending
            ? 'Only pending requests can be cancelled'
            : canCancel
              ? 'Cancel this request'
              : `Cancellation closes ${cancellationPolicyLabel}`
        }
      >
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => onValidate(booking)}
        disabled={!isAwaitingValidation || actionLoadingId === booking.id}
        title={
          isAwaitingValidation
            ? 'Validate this trip completion'
            : 'Available after the driver submits the finish report'
        }
      >
        Validate
      </button>
      <button
        type="button"
        className="btn btn-outline-brand"
        onClick={() => onDetails(booking)}
        disabled={actionLoadingId === booking.id}
      >
        Details
      </button>
    </div>
  )
}

export default BookingActions
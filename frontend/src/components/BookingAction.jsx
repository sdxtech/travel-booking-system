import React from 'react'
import TableActionDropdown from './TableActionDropdown'

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
    <TableActionDropdown
      label={`Actions for ${booking.request_id || 'driver booking'}`}
      disabled={actionLoadingId === booking.id}
    >
      <button
        type="button"
        onClick={() => onEdit(booking)}
        disabled={!isPending || booking.cancellation_status === 'pending' || actionLoadingId === booking.id}
        title={isPending ? 'Edit this request' : 'Only pending requests can be edited'}
      >
        Edit
      </button>
      <button
        type="button"
        className="is-danger"
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
        onClick={() => onDetails(booking)}
        disabled={actionLoadingId === booking.id}
      >
        Details
      </button>
    </TableActionDropdown>
  )
}

export default BookingActions

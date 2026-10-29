import React from 'react'
import TableActionDropdown from './TableActionDropdown'

function BookingActions({
  booking,
  statusValue,
  canCancel,
  cancellationPolicyLabel,
  actionLoadingId,
  onEdit,
  canEdit,
  onCancel,
  onValidate,
  onDetails,
}) {
  const isPending = statusValue === 'pending'
  const isCancellableStatus = statusValue === 'pending' || statusValue === 'approved'
  const isAwaitingValidation = statusValue === 'awaiting_validation'

  return (
    <TableActionDropdown
      label={`Actions for ${booking.request_id || 'driver booking'}`}
      disabled={actionLoadingId === booking.id}
    >
      <button
        type="button"
        onClick={() => onEdit(booking)}
        disabled={!canEdit || !isPending || booking.cancellation_status === 'pending' || actionLoadingId === booking.id}
        title={!canEdit ? 'Editing is disabled or edit permissions are not available.' : isPending ? 'Edit this request' : 'Only pending requests can be edited'}
      >
        Edit
      </button>
      <button
        type="button"
        className="is-danger"
        onClick={() => onCancel(booking.id)}
        disabled={!canCancel || actionLoadingId === booking.id}
        title={
          !isCancellableStatus
            ? 'Only pending or approved bookings can be cancelled'
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

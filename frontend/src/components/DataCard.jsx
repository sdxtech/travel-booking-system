import React from 'react'
import BookingActions from './BookingAction'


function DataCard({
  booking,
  index,
  statusValue,
  canCancel,
  cancellationPolicyLabel,
  actionLoadingId,
  formatDateOnly,
  formatDateTime,
  formatTripType,
  formatStatusText,
  onEdit,
  onCancel,
  onValidate,
  onDetails,
}) {
  return (
    <div className="booking-card-item">
      <div className="booking-card-header">
        <div>
         
          <h3 className="booking-card-title">{booking.request_id || 'Driver Booking'}</h3>
        </div>
        <span className={`status-badge status-${statusValue}`}>
          {formatStatusText(statusValue)}
        </span>
      </div>

      <div className="booking-card-body">
        <div className="booking-card-meta">
          <span className="meta-label">Submission Date</span>
          <span className="meta-value">{formatDateOnly(booking.created_at)}</span>
        </div>
        <div className="booking-card-meta">
          <span className="meta-label">Departure</span>
          <span className="meta-value">{formatDateTime(booking.departure_time)}</span>
        </div>
        <div className="booking-card-meta">
          <span className="meta-label">Route</span>
          <span className="meta-value truncate">
            {booking.pickup_location || '-'} &rarr; {booking.destination || '-'}
          </span>
        </div>
        <div className="booking-card-meta">
          <span className="meta-label">Trip Type</span>
          <span className="meta-value">{formatTripType(booking.trip_type)}</span>
        </div>
      </div>

      <div className="booking-card-actions">
        <BookingActions
          booking={booking}
          statusValue={statusValue}
          canCancel={canCancel}
          cancellationPolicyLabel={cancellationPolicyLabel}
          actionLoadingId={actionLoadingId}
          onEdit={onEdit}
          onCancel={onCancel}
          onValidate={onValidate}
          onDetails={onDetails}
        />
      </div>
    </div>
  )
}

export default DataCard
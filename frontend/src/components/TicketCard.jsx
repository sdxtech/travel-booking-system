import React from 'react'

function TicketCard({
  ticket,
  index,
  actionLoadingId,
  formatDate,
  formatDateTime,
  onEdit,
  onCancel,
  onDetails,
}) {
  const statusValue = (ticket?.status || 'pending').toLowerCase()
  const isPending = statusValue === 'pending'
  const isLoading = actionLoadingId === ticket.id

  return (
    <div className="booking-card-item">
      <div className="booking-card-header">
        <div>
          <span className="booking-card-index"></span>
          <h3 className="booking-card-title">{ticket.request_id || 'Travel Request'}</h3>
        </div>
        <span className={`status-badge status-${statusValue}`}>
          {ticket.status || 'pending'}
        </span>
      </div>

      <div className="booking-card-body">
        <div className="booking-card-meta">
          <span className="meta-label">Submission Date</span>
          <span className="meta-value">{formatDate(ticket.created_at)}</span>
        </div>
        <div className="booking-card-meta">
          <span className="meta-label">Departure</span>
          <span className="meta-value">
            {formatDateTime(ticket.departure_date, ticket.departure_time)}
          </span>
        </div>
        <div className="booking-card-meta">
          <span className="meta-label">Route</span>
          <span className="meta-value truncate">
            {ticket.departure_point || '-'} &rarr; {ticket.destination || '-'}
          </span>
        </div>
        <div className="booking-card-meta">
          <span className="meta-label">Trip Type</span>
          <span className="meta-value">{ticket.trip_type || '-'}</span>
        </div>
      </div>

      <div className="booking-card-actions">
        <div className="table-row-actions table-action-buttons">
          <button
            type="button"
            className="btn btn-outline-brand"
            onClick={() => onEdit(ticket)}
            disabled={!isPending || isLoading}
            title={isPending ? 'Edit this request' : 'Only pending requests can be edited'}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onCancel(ticket.id)}
            disabled={!isPending || isLoading}
            title={isPending ? 'Cancel this request' : 'Only pending requests can be cancelled'}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-outline-brand"
            onClick={() => onDetails(ticket)}
            disabled={isLoading}
          >
            Details
          </button>
        </div>
      </div>
    </div>
  )
}

export default TicketCard
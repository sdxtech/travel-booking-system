import React from 'react'
import TableActionDropdown from './TableActionDropdown' // Adjust path if needed

function TicketCard({
  ticket,
  actionLoadingId,
  formatDate,
  formatDateTime,
  onEdit,
  onCancel,
  onDetails,
}) {
  const statusValue = (ticket?.status || 'pending').toLowerCase()
  const isPending = statusValue === 'pending'
  const isLoading = actionLoadingId === ticket?.id

  return (
    <div className="booking-card-item">
      <div className="booking-card-header">
        <div>
          <span className="booking-card-index"></span>
          <h3 className="booking-card-title">{ticket?.request_id || 'Travel Request'}</h3>
        </div>
        <span className={`status-badge status-${statusValue}`}>
          {ticket?.status || 'pending'}
        </span>
      </div>

      <div className="booking-card-body">
        <div className="booking-card-meta">
          <span className="meta-label">Submission Date</span>
          <span className="meta-value">{formatDate(ticket?.created_at)}</span>
        </div>
        <div className="booking-card-meta">
          <span className="meta-label">Departure</span>
          <span className="meta-value">
            {formatDateTime(ticket?.departure_date, ticket?.departure_time)}
          </span>
        </div>
        <div className="booking-card-meta">
          <span className="meta-label">Route</span>
          <span className="meta-value truncate">
            {ticket?.departure_point || '-'} &rarr; {ticket?.destination || '-'}
          </span>
        </div>
        <div className="booking-card-meta">
          <span className="meta-label">Trip Type</span>
          <span className="meta-value">{ticket?.trip_type || '-'}</span>
        </div>
      </div>

      <div className="booking-card-actions">
        <TableActionDropdown
          label={`Actions for request ${ticket?.request_id || ticket?.id}`}
          disabled={isLoading}
        >
          <button
            type="button"
            className="dropdown-item"
            onClick={() => onEdit(ticket)}
            disabled={!isPending || isLoading}
            title={isPending ? 'Edit this request' : 'Only pending requests can be edited'}
          >
            <i className="bi bi-pencil" aria-hidden="true" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            className="dropdown-item text-danger"
            onClick={() => onCancel(ticket?.id)}
            disabled={!isPending || isLoading}
            title={isPending ? 'Cancel this request' : 'Only pending requests can be cancelled'}
          >
            <i className="bi bi-x-circle" aria-hidden="true" />
            <span>Cancel</span>
          </button>

          <button
            type="button"
            className="dropdown-item"
            onClick={() => onDetails(ticket)}
            disabled={isLoading}
          >
            <i className="bi bi-info-circle" aria-hidden="true" />
            <span>Details</span>
          </button>
        </TableActionDropdown>
      </div>
    </div>
  )
}

export default TicketCard
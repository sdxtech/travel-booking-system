import React from 'react'
import BookingActions from './BookingAction'

function DataTable({
  bookings,
  currentPage,
  pageSize,
  sortConfig,
  onSort,
  getBookingStatus,
  canCancelBooking,
  getCancellationPolicyLabel,
  formatDateOnly,
  formatStatusText,
  actionLoadingId,
  onEdit,
  onCancel,
  onValidate,
  onDetails,
}) {
  const renderSortIcon = (key) => {
    const isActive = sortConfig.key === key
    if (!isActive) {
      return <i className="bi bi-arrow-down-up sort-indicator sort-indicator-muted" aria-hidden="true" />
    }
    return (
      <i
        className={`bi ${sortConfig.direction === 'asc' ? 'bi-caret-up-fill' : 'bi-caret-down-fill'} sort-indicator`}
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="table-wrapper">
      <table className="simple-table history-summary-table">
        <thead>
          <tr>
            <th className="table-col-no">No</th>
            <th>
              <button type="button" className="table-sort" onClick={() => onSort('created_at')}>
                Submission Date {renderSortIcon('created_at')}
              </button>
            </th>
            <th>
              <button type="button" className="table-sort" onClick={() => onSort('request_id')}>
                Request ID {renderSortIcon('request_id')}
              </button>
            </th>
            <th>
              <button type="button" className="table-sort" onClick={() => onSort('status')}>
                Status {renderSortIcon('status')}
              </button>
            </th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 ? (
            <tr>
              <td colSpan="5" className="muted">
                No driver bookings yet.
              </td>
            </tr>
          ) : (
            bookings.map((booking, index) => {
              const statusValue = getBookingStatus(booking)
              const canCancel = canCancelBooking(booking)
              const itemIndex = (currentPage - 1) * pageSize + index + 1

              return (
                <tr key={booking.id}>
                  <td className="table-col-no">{itemIndex}</td>
                  <td>{formatDateOnly(booking.created_at)}</td>
                  <td className="request-id-cell">{booking.request_id || '-'}</td>
                  <td>
                    <span className={`status-badge status-${statusValue}`}>
                      {formatStatusText(statusValue)}
                    </span>
                  </td>
                  <td>
                    <BookingActions
                      booking={booking}
                      statusValue={statusValue}
                      canCancel={canCancel}
                      cancellationPolicyLabel={getCancellationPolicyLabel()}
                      actionLoadingId={actionLoadingId}
                      onEdit={onEdit}
                      onCancel={onCancel}
                      onValidate={onValidate}
                      onDetails={onDetails}
                    />
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

export default DataTable
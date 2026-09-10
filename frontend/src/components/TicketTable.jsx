import React from 'react'
import TableActionDropdown from './TableActionDropdown'

function TicketTable({
  tickets,
  currentPage,
  pageSize,
  onSort,
  renderSortIcon,
  formatDate,
  actionLoadingId,
  onEdit,
  onCancel,
  onDetails,
}) {
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
          {tickets.length === 0 ? (
            <tr>
              <td colSpan="5" className="muted">
                No ticket requests yet.
              </td>
            </tr>
          ) : (
            tickets.map((ticket, index) => {
              const statusValue = (ticket.status || 'pending').toLowerCase()
              const isPending = statusValue === 'pending'
              const isLoading = actionLoadingId === ticket.id

              return (
                <tr key={ticket.id}>
                  <td className="table-col-no">{(currentPage - 1) * pageSize + index + 1}</td>
                  <td>{formatDate(ticket.created_at)}</td>
                  <td className="request-id-cell">{ticket.request_id || '-'}</td>
                  <td>
                    <span className={`status-badge status-${statusValue}`}>
                      {ticket.status || 'pending'}
                    </span>
                  </td>
                  <td>
                    <TableActionDropdown
                      label={`Actions for ${ticket.request_id || 'travel request'}`}
                      disabled={isLoading}
                    >
                      <button
                        type="button"
                        onClick={() => onEdit(ticket)}
                        disabled={!isPending || isLoading}
                        title={isPending ? 'Edit this request' : 'Only pending requests can be edited'}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => onCancel(ticket.id)}
                        disabled={!isPending || isLoading}
                        title={isPending ? 'Cancel this request' : 'Only pending requests can be cancelled'}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => onDetails(ticket)}
                        disabled={isLoading}
                      >
                        Details
                      </button>
                    </TableActionDropdown>
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

export default TicketTable

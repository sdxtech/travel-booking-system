import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

// List the signed-in user's travel requests and their statuses.
function TicketHistory() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [page, setPage] = useState(1)
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' })

  const pageSize = 10

  // Convert API timestamps into a Date instance.
  const toDate = (value) => {
    if (!value) return null
    if (value?.seconds) {
      return new Date(value.seconds * 1000)
    }
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  // Provide a stable sort value per table column.
  const getTicketSortValue = (ticket, key) => {
    if (!ticket) return ''
    switch (key) {
      case 'created_at':
        return toDate(ticket.created_at)?.getTime() ?? null
      case 'request_id':
        return ticket.request_id || ''
      case 'full_name':
        return ticket.full_name || ''
      case 'national_id':
        return ticket.national_id || ''
      case 'dept_job_position':
        return ticket.dept_job_position || ''
      case 'phone_number':
        return ticket.phone_number || ''
      case 'email':
        return ticket.email || ''
      case 'departure_datetime':
        {
          const date = toDate(ticket.departure_date)
          if (!date) return null
          const timeValue = String(ticket.departure_time || '').trim()
          if (!timeValue) return date.getTime()

          const [hours, minutes] = timeValue.split(':').map((part) => Number(part))
          if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return date.getTime()

          const merged = new Date(date)
          merged.setHours(hours, minutes, 0, 0)
          return merged.getTime()
        }
      case 'departure_point':
        return ticket.departure_point || ''
      case 'destination':
        return ticket.destination || ''
      case 'trip_type':
        return ticket.trip_type || ''
      case 'hotel_accommodation':
        {
          const value = ticket.hotel_accommodation
          if (value === true || value === 'yes') return 1
          if (value === false || value === 'no') return 0
          return null
        }
      case 'hotel_name':
        return ticket.hotel_name || ''
      case 'hotel_location':
        return ticket.hotel_location || ''
      case 'transportation_mode':
        return ticket.transportation_mode || ''
      case 'superior_approval_note':
        return ticket.superior_approval_note || ''
      case 'additional_notes':
        return ticket.additional_notes || ''
      case 'status':
        return String(ticket.status || '').toLowerCase()
      default:
        return ''
    }
  }

  // Compare values while keeping empty values at the bottom.
  const compareValues = (aValue, bValue) => {
    const aEmpty = aValue === null || aValue === undefined || aValue === ''
    const bEmpty = bValue === null || bValue === undefined || bValue === ''

    if (aEmpty && bEmpty) return 0
    if (aEmpty) return 1
    if (bEmpty) return -1

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return aValue - bValue
    }

    return String(aValue).localeCompare(String(bValue), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  }

  // Sort tickets based on the active column/direction.
  const sortedTickets = useMemo(() => {
    if (!sortConfig.key) return tickets

    return tickets
      .map((ticket, index) => ({ ticket, index }))
      .sort((a, b) => {
        const aValue = getTicketSortValue(a.ticket, sortConfig.key)
        const bValue = getTicketSortValue(b.ticket, sortConfig.key)
        const base = compareValues(aValue, bValue)

        if (base !== 0) {
          return sortConfig.direction === 'asc' ? base : -base
        }

        return a.index - b.index
      })
      .map((entry) => entry.ticket)
  }, [tickets, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sortedTickets.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedTickets = sortedTickets.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Keep page index within bounds when the list size changes.
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  // Allow the details dialog to be closed with the Escape key.
  useEffect(() => {
    if (!selectedTicket) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedTicket(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedTicket])

  // Load the current user's ticket history.
  useEffect(() => {
    // Fetch ticket data from the API.
    const fetchTickets = async () => {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('authToken')
      if (!token) {
        setError('Authentication token not found. Please login again.')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE_URL}/tickets/my`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          let detail = 'Failed to load tickets.'
          try {
            const data = await response.json()
            if (data?.detail) {
              detail = data.detail
            }
          } catch {
            // ignore parse error
          }
          setError(detail)
          setTickets([])
        } else {
          const data = await response.json()
          setTickets(Array.isArray(data) ? data : [])
        }
      } catch {
        setError('Network error. Please try again.')
        setTickets([])
      } finally {
        setLoading(false)
      }
    }

    fetchTickets()
  }, [])

  // Open the travel request form with the selected request for editing.
  const handleEdit = (ticket) => {
    navigate('/user/ticket-request', { state: { ticket } })
  }

  // Cancel a ticket request (when allowed by status).
  const handleCancel = async (ticketId) => {
    const confirmed = window.confirm('Cancel this ticket request?')
    if (!confirmed) return

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found. Please login again.')
      return
    }

    setActionLoadingId(ticketId)
    setActionError('')

    try {
      const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        let detail = 'Failed to cancel ticket.'
        try {
          const data = await response.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      const updated = await response.json()
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)))
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  // Toggle sort direction for a column (or activate a new sort key).
  const toggleSort = (key) => {
    setPage(1)
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  // Render the sort icon for the table header.
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

  // Format a date-only value for table display.
  const formatDate = (value) => {
    const date = toDate(value)
    if (!date) return '-'
    return date.toLocaleDateString('en-GB')
  }

  // Merge date and time fields into a single display string.
  const formatDateTime = (dateValue, timeValue) => {
    const date = toDate(dateValue)
    if (!date) return '-'
    const base = date.toLocaleDateString('en-GB')
    if (timeValue) {
      return `${base} ${timeValue}`
    }
    return base
  }

  // Format boolean-ish values consistently.
  const formatBool = (value) => {
    if (value === true) return 'Yes'
    if (value === false) return 'No'
    if (value === 'yes') return 'Yes'
    if (value === 'no') return 'No'
    return '-'
  }

  return (
    <MainLayout title="Ticket History">
      <div className="ticket-history">
        <header className="history-header">
          <button className="back-link" type="button" onClick={() => navigate(-1)}>
            &larr; Back
          </button>
          <div>
            <p className="eyebrow">Travel Status & History</p>
            <h1>List of all Travel Request</h1>
            <p className="muted">Track the status of all your travel requests</p>
          </div>
        </header>

        {loading ? <p className="muted">Loading tickets...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {actionError ? <p className="error-text">{actionError}</p> : null}

        {!loading && !error ? (
          <>
            <div className="table-wrapper">
              <table className="simple-table history-summary-table">
                <thead>
                  <tr>
                    <th className="table-col-no">No</th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('created_at')}>
                        Submission Date {renderSortIcon('created_at')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('request_id')}>
                        Request ID {renderSortIcon('request_id')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('status')}>
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
                    pagedTickets.map((ticket, index) => {
                      const statusValue = (ticket.status || 'pending').toLowerCase()
                      const isPending = statusValue === 'pending'

                      return (
                        <tr key={ticket.id}>
                          <td className="table-col-no">{(currentPage - 1) * pageSize + index + 1}</td>
                          <td>{formatDate(ticket.created_at)}</td>
                          <td className="request-id-cell">{ticket.request_id || '-'}</td>
                          <td>
                            <span className={`status-badge status-${statusValue}`}>{ticket.status || 'pending'}</span>
                          </td>
                          <td>
                            <div className="table-row-actions table-action-buttons">
                              <button
                                type="button"
                                className="btn btn-outline-brand"
                                onClick={() => handleEdit(ticket)}
                                disabled={!isPending || actionLoadingId === ticket.id}
                                title={isPending ? 'Edit this request' : 'Only pending requests can be edited'}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => handleCancel(ticket.id)}
                                disabled={!isPending || actionLoadingId === ticket.id}
                                title={isPending ? 'Cancel this request' : 'Only pending requests can be cancelled'}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-brand"
                                onClick={() => setSelectedTicket(ticket)}
                                disabled={actionLoadingId === ticket.id}
                              >
                                Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="office-pagination">
              <button
                type="button"
                className="btn btn-neutral"
                disabled={loading || currentPage <= 1 || tickets.length === 0}
                onClick={() => setPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
              >
                Prev
              </button>
              <span className="office-page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-neutral"
                disabled={loading || currentPage >= totalPages || tickets.length === 0}
                onClick={() => setPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
              >
                Next
              </button>
            </div>

            {selectedTicket ? (
              <div
                className="modal-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ticket-details-title"
                onClick={() => setSelectedTicket(null)}
              >
                <div className="modal ticket-details-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-header">
                    <div>
                      <p className="eyebrow">Travel Request Details</p>
                      <h2 id="ticket-details-title">{selectedTicket.request_id || 'Travel Request'}</h2>
                    </div>
                    <button
                      type="button"
                      className="modal-close"
                      onClick={() => setSelectedTicket(null)}
                      aria-label="Close details"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="ticket-details-summary">
                    <span>Submitted {formatDate(selectedTicket.created_at)}</span>
                    <span className={`status-badge status-${(selectedTicket.status || 'pending').toLowerCase()}`}>
                      {selectedTicket.status || 'pending'}
                    </span>
                  </div>

                  <section className="ticket-details-section">
                    <h3>Employee Information</h3>
                    <dl className="ticket-details-grid">
                      <div className="ticket-details-item">
                        <dt>Name</dt>
                        <dd>{selectedTicket.full_name || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>National ID</dt>
                        <dd>{selectedTicket.national_id || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Department / Job Position</dt>
                        <dd>{selectedTicket.dept_job_position || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Phone</dt>
                        <dd>{selectedTicket.phone_number || '-'}</dd>
                      </div>
                      <div className="ticket-details-item ticket-details-item--full">
                        <dt>Email</dt>
                        <dd>{selectedTicket.email || '-'}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="ticket-details-section">
                    <h3>Travel Details</h3>
                    <dl className="ticket-details-grid">
                      <div className="ticket-details-item">
                        <dt>Departure Date & Time</dt>
                        <dd>{formatDateTime(selectedTicket.departure_date, selectedTicket.departure_time)}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Type of Trip</dt>
                        <dd>{selectedTicket.trip_type || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Departure Point</dt>
                        <dd>{selectedTicket.departure_point || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Destination</dt>
                        <dd>{selectedTicket.destination || '-'}</dd>
                      </div>
                      <div className="ticket-details-item ticket-details-item--full">
                        <dt>Purpose of Travel</dt>
                        <dd>{selectedTicket.purpose_of_travel || '-'}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="ticket-details-section">
                    <h3>Accommodation & Transportation</h3>
                    <dl className="ticket-details-grid">
                      <div className="ticket-details-item">
                        <dt>Hotel Accommodation</dt>
                        <dd>{formatBool(selectedTicket.hotel_accommodation)}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Transportation</dt>
                        <dd>{selectedTicket.transportation_mode || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Hotel Name</dt>
                        <dd>{selectedTicket.hotel_name || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Hotel Location</dt>
                        <dd>{selectedTicket.hotel_location || '-'}</dd>
                      </div>
                      <div className="ticket-details-item ticket-details-item--full">
                        <dt>Other Transportation</dt>
                        <dd>{selectedTicket.transportation_other || '-'}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="ticket-details-section">
                    <h3>Approval & Notes</h3>
                    <dl className="ticket-details-grid">
                      <div className="ticket-details-item ticket-details-item--full">
                        <dt>Approval Note</dt>
                        <dd>{selectedTicket.superior_approval_note || '-'}</dd>
                      </div>
                      <div className="ticket-details-item ticket-details-item--full">
                        <dt>Additional Notes</dt>
                        <dd>{selectedTicket.additional_notes || '-'}</dd>
                      </div>
                    </dl>
                  </section>

                  <div className="modal-actions">
                    <button type="button" className="btn btn-neutral" onClick={() => setSelectedTicket(null)}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </MainLayout>
  )
}

export default TicketHistory

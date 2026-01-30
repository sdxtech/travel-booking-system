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
  const [page, setPage] = useState(1)
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' })

  const pageSize = 10

  // Convert Firestore timestamps/ISO strings into a Date instance.
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
          } catch (err) {
            // ignore parse error
          }
          setError(detail)
          setTickets([])
        } else {
          const data = await response.json()
          setTickets(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        setError('Network error. Please try again.')
        setTickets([])
      } finally {
        setLoading(false)
      }
    }

    fetchTickets()
  }, [])

  // Open the ticket form with the selected ticket for editing.
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
        } catch (err) {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      const updated = await response.json()
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)))
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch (err) {
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
              <table className="simple-table">
                <thead>
                  <tr>
                    <th className="table-col-no">No</th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('created_at')}>
                        Submission Date {renderSortIcon('created_at')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('full_name')}>
                        Name {renderSortIcon('full_name')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('national_id')}>
                        National ID {renderSortIcon('national_id')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('dept_job_position')}>
                        Dept/Job Position {renderSortIcon('dept_job_position')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('phone_number')}>
                        Phone {renderSortIcon('phone_number')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('email')}>
                        Email {renderSortIcon('email')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('departure_datetime')}>
                        Departure Date {renderSortIcon('departure_datetime')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('departure_point')}>
                        Departure Point {renderSortIcon('departure_point')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('destination')}>
                        Destination {renderSortIcon('destination')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('trip_type')}>
                        Type of Trip {renderSortIcon('trip_type')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('hotel_accommodation')}>
                        Hotel Accommodation {renderSortIcon('hotel_accommodation')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('hotel_name')}>
                        Hotel Name {renderSortIcon('hotel_name')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('hotel_location')}>
                        Hotel Location {renderSortIcon('hotel_location')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('transportation_mode')}>
                        Transportation {renderSortIcon('transportation_mode')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('superior_approval_note')}>
                        Approval Note {renderSortIcon('superior_approval_note')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('additional_notes')}>
                        Additional Notes {renderSortIcon('additional_notes')}
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
                      <td colSpan="19" className="muted">
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
                          <td className="cell-wrap">{ticket.full_name || '-'}</td>
                          <td>{ticket.national_id || '-'}</td>
                          <td className="cell-wrap">{ticket.dept_job_position || '-'}</td>
                          <td>{ticket.phone_number || '-'}</td>
                          <td className="cell-wrap">{ticket.email || '-'}</td>
                          <td>{formatDateTime(ticket.departure_date, ticket.departure_time)}</td>
                          <td className="cell-wrap">{ticket.departure_point || '-'}</td>
                          <td>{ticket.destination || '-'}</td>
                          <td>{ticket.trip_type || '-'}</td>
                          <td>{formatBool(ticket.hotel_accommodation)}</td>
                          <td className="cell-wrap">{ticket.hotel_name || '-'}</td>
                          <td className="cell-wrap">{ticket.hotel_location || '-'}</td>
                          <td>{ticket.transportation_mode || '-'}</td>
                          <td className="cell-wrap">{ticket.superior_approval_note || '-'}</td>
                          <td className="cell-wrap">{ticket.additional_notes || '-'}</td>
                          <td>
                            <span className={`status-badge status-${statusValue}`}>{ticket.status || 'pending'}</span>
                          </td>
                          <td>
                            {isPending ? (
                              <div className="table-row-actions">
                                <button
                                  type="button"
                                  className="btn btn-outline-brand"
                                  onClick={() => handleEdit(ticket)}
                                  disabled={actionLoadingId === ticket.id}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => handleCancel(ticket.id)}
                                  disabled={actionLoadingId === ticket.id}
                                >
                                  {actionLoadingId === ticket.id ? 'Cancelling...' : 'Cancel'}
                                </button>
                              </div>
                            ) : (
                              '-'
                            )}
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
          </>
        ) : null}
      </div>
    </MainLayout>
  )
}

export default TicketHistory

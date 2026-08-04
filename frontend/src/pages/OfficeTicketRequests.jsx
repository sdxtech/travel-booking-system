import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import useOfficeSidebar from '../hooks/useOfficeSidebar'
import { API_BASE_URL } from '../config'

const menuItems = [
  { label: 'Quick View', icon: 'bi-speedometer2' },
  { label: 'Travel Requests', icon: 'bi-ticket-perforated' },
  { label: 'Travel Status & History', icon: 'bi-clock-history' },
  { label: 'Travel Assign', icon: 'bi-building' },
  { label: 'Booking Driver Requests', icon: 'bi-car-front' },
  { label: 'Booking Driver Status & History', icon: 'bi-card-list' },
  { label: 'Booking Driver Assign', icon: 'bi-person-check' },
  { label: 'Manage User', icon: 'bi-people' },
]

// Pending travel requests for office coordinators (approve/reject).
function OfficeTicketRequests() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const isSuperadmin = localStorage.getItem('authRole') === 'superadmin'
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [processing, setProcessing] = useState({})
  const [page, setPage] = useState(1)

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(tickets.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedTickets = tickets.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Keep page index within bounds when the list size changes.
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  // Load pending ticket requests.
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setLoading(false)
      setError('Authentication token not found.')
      return
    }

    // Fetch pending tickets from the API.
    const loadTickets = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`${API_BASE_URL}/tickets/pending`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          let detail = 'Failed to load tickets.'
          try {
            const data = await res.json()
            if (data?.detail) detail = data.detail
          } catch {
            // ignore parse error
          }
          setError(detail)
          setTickets([])
        } else {
          const data = await res.json()
          setTickets(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        setError('Network error. Please try again.')
        setTickets([])
      } finally {
        setLoading(false)
      }
    }

    loadTickets()
  }, [])

  // Update ticket status and remove it from the pending list.
  const handleStatusUpdate = async (ticketId, nextStatus) => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setProcessing((prev) => ({ ...prev, [ticketId]: true }))
    setActionMessage('')
    setActionError('')

    try {
      const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!res.ok) {
        let detail = 'Failed to update ticket status.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      setTickets((prev) => prev.filter((ticket) => ticket.id !== ticketId))
      setActionMessage(`Ticket ${nextStatus}. Moved to ticket history.`)
    } catch (err) {
      setActionError('Network error. Please try again.')
    } finally {
      setProcessing((prev) => {
        const next = { ...prev }
        delete next[ticketId]
        return next
      })
    }
  }

  // Format a date-only display value.
  const formatDate = (value) => {
    if (!value) return '-'
    const dt = new Date(value)
    return Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('en-GB')
  }

  // Handle sidebar navigation clicks.
  const handleNavigate = (item) => {
    const quickViewRoute = isSuperadmin ? '/admin/home' : '/office/home'
    const manageUserRoute = isSuperadmin ? '/admin/manage-user' : '/office/manage-user'

    if (item === 'Quick View') navigate(quickViewRoute)
    if (item === 'Travel Requests') navigate('/office/ticket-requests')
    if (item === 'Travel Status & History') navigate('/office/ticket-history')
    if (item === 'Booking Driver Status & History') navigate('/office/driver-history')
    if (item === 'Travel Assign') navigate('/office/travel-accommodation')
    if (item === 'Booking Driver Requests') navigate('/office/driver-requests')
    if (item === 'Booking Driver Assign') navigate('/office/assign-drivers')
    if (item === 'Manage User') navigate(manageUserRoute)
  }

  const sidebarRoleLabel = isSuperadmin ? 'Super Admin' : 'Office Coordinator'

  return (
    <MainLayout title="Travel Requests">
      <div className={`office-quick-view fixed-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
        <aside className="office-sidebar visible">
          <div className="sidebar-header">
            <span className="sidebar-role">{sidebarRoleLabel}</span>
            <button
              type="button"
              className="sidebar-toggle"
              onClick={toggleSidebar}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <i className={`bi ${isSidebarCollapsed ? 'bi-chevron-right' : 'bi-chevron-left'}`} aria-hidden="true" />
            </button>
          </div>
          <nav className="sidebar-menu">
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`sidebar-item ${item.label === 'Travel Requests' ? 'active' : ''}`}
                onClick={() => handleNavigate(item.label)}
                aria-label={item.label}
                title={item.label}
              >
                <i className={`bi ${item.icon} sidebar-item__icon`} aria-hidden="true" />
                <span className="sidebar-item__label">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="office-content">
          <header className="office-header">
            <p className="eyebrow">Travel Accommodation Requests</p>
            <h1>List of all travel accommodation requests</h1>
            <p className="muted">Manage ticket approvals and assignments</p>
          </header>

          {actionMessage ? <p className="success-text">{actionMessage}</p> : null}
          {actionError ? <p className="error-text">{actionError}</p> : null}

          <div className="office-table-wrapper">
            <table className="office-table">
              <thead>
                <tr>
                  <th className="table-col-no">No</th>
                  <th>Name</th>
                  <th>User Dept/Job Position</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>National ID</th>
                  <th>Departure Date</th>
                  <th>Departure Time</th>
                  <th>Departure Point</th>
                  <th>Destination</th>
                  <th>Purpose of Travel</th>
                  <th>Type of Trip</th>
                  <th>Hotel Accommodation</th>
                  <th>Hotel Name</th>
                  <th>Hotel Location</th>
                  <th>Transport Mode</th>
                  <th>Attachment</th>
                  <th>Notes</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="20" className="muted">
                      Loading...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="20" className="error-text">
                      {error}
                    </td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan="20" className="muted">
                      No ticket requests found.
                    </td>
                  </tr>
                ) : (
                  pagedTickets.map((ticket, index) => (
                    <tr key={ticket.id}>
                      <td className="table-col-no">{(currentPage - 1) * pageSize + index + 1}</td>
                      <td>{ticket.full_name || '-'}</td>
                      <td>{ticket.dept_job_position || '-'}</td>
                      <td>{ticket.phone_number || '-'}</td>
                      <td>{ticket.email || '-'}</td>
                      <td>{ticket.national_id || '-'}</td>
                      <td>{formatDate(ticket.departure_date)}</td>
                      <td>{ticket.departure_time || '-'}</td>
                      <td>{ticket.departure_point || '-'}</td>
                      <td>{ticket.destination || '-'}</td>
                      <td>{ticket.purpose_of_travel || '-'}</td>
                      <td>{ticket.trip_type || '-'}</td>
                      <td>{ticket.hotel_accommodation ? 'Yes' : 'No'}</td>
                      <td>{ticket.hotel_name || '-'}</td>
                      <td>{ticket.hotel_location || '-'}</td>
                      <td>{ticket.transportation_mode || '-'}</td>
                      <td>{ticket.superior_approval_note || '-'}</td>
                      <td>{ticket.additional_notes || '-'}</td>
                      <td>
                        {ticket.status ? (
                          <span className={`status-badge status-${String(ticket.status).toLowerCase()}`}>{ticket.status}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <div className="office-row-actions table-action-buttons">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={
                              (!isSuperadmin && String(ticket.status || 'pending').toLowerCase() !== 'pending') ||
                              processing[ticket.id]
                            }
                            onClick={() => handleStatusUpdate(ticket.id, 'approved')}
                            title={
                              isSuperadmin || String(ticket.status || 'pending').toLowerCase() === 'pending'
                                ? 'Approve this request'
                                : 'Only pending requests can be approved'
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={
                              (!isSuperadmin && String(ticket.status || 'pending').toLowerCase() !== 'pending') ||
                              processing[ticket.id]
                            }
                            onClick={() => handleStatusUpdate(ticket.id, 'rejected')}
                            title={
                              isSuperadmin || String(ticket.status || 'pending').toLowerCase() === 'pending'
                                ? 'Reject this request'
                                : 'Only pending requests can be rejected'
                            }
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
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
        </section>
      </div>
    </MainLayout>
  )
}

export default OfficeTicketRequests

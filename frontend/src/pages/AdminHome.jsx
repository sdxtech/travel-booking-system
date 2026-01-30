import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import useOfficeSidebar from '../hooks/useOfficeSidebar'
import { API_BASE_URL } from '../config'

const menuItems = [
  { label: 'Dashboard', icon: 'bi-speedometer2' },
  { label: 'Travel Requests', icon: 'bi-ticket-perforated' },
  { label: 'Travel Status & History', icon: 'bi-clock-history' },
  { label: 'Travel Assign', icon: 'bi-building' },
  { label: 'Booking Driver Requests', icon: 'bi-car-front' },
  { label: 'Booking Driver Status & History', icon: 'bi-card-list' },
  { label: 'Booking Driver Assign', icon: 'bi-person-check' },
  { label: 'Manage User', icon: 'bi-people' },
]

const actionConfig = [
  { label: 'Pending Tickets', type: 'ticketPending', icon: 'bi-ticket-perforated-fill' },
  { label: 'Approved Travel', type: 'ticketApproved', icon: 'bi-check-circle-fill' },
  { label: 'Rejected Travel', type: 'ticketRejected', icon: 'bi-x-circle-fill' },
  { label: 'Pending Bookings', type: 'bookingPending', icon: 'bi-car-front-fill' },
  { label: 'Rejected Drivers', type: 'bookingRejected', icon: 'bi-slash-circle-fill' },
  { label: 'Completed Drivers', type: 'bookingCompleted', icon: 'bi-check2-circle' },
]

// Superadmin dashboard page.
function AdminHome() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const [profile, setProfile] = useState({ name: '' })
  const [stats, setStats] = useState({
    ticketPending: 0,
    ticketApproved: 0,
    ticketRejected: 0,
    bookingPending: 0,
    bookingApproved: 0,
    bookingRejected: 0,
    bookingCompleted: 0,
  })

  // Load the user profile and dashboard stats.
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) return

    // Fetch profile for the greeting line.
    const loadProfile = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setProfile({ name: data.name || data.email || 'User' })
        }
      } catch (err) {
        console.error('Failed to load profile', err)
      }
    }

    // Fetch ticket/booking counts for the stat cards.
    const loadStats = async () => {
      try {
        const [ticketRes, bookingRes] = await Promise.all([
          fetch(`${API_BASE_URL}/tickets/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/bookings/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        const ticketData = ticketRes.ok ? await ticketRes.json() : {}
        const bookingData = bookingRes.ok ? await bookingRes.json() : {}

        setStats({
          ticketPending: ticketData.pending || 0,
          ticketApproved: ticketData.approved || 0,
          ticketRejected: ticketData.rejected || 0,
          bookingPending: bookingData.pending || 0,
          bookingApproved: bookingData.approved || 0,
          bookingRejected: bookingData.rejected || 0,
          bookingCompleted: bookingData.completed || 0,
        })
      } catch (err) {
        console.error('Failed to load stats', err)
      }
    }

    loadProfile()
    loadStats()
  }, [])

  // Handle sidebar navigation clicks.
  const handleNavigate = (item) => {
    if (item === 'Dashboard') navigate('/admin/home')
    if (item === 'Travel Requests') navigate('/office/ticket-requests')
    if (item === 'Travel Status & History') navigate('/office/ticket-history')
    if (item === 'Booking Driver Status & History') navigate('/office/driver-history')
    if (item === 'Travel Assign') navigate('/office/travel-accommodation')
    if (item === 'Booking Driver Requests') navigate('/office/driver-requests')
    if (item === 'Booking Driver Assign') navigate('/office/assign-drivers')
    if (item === 'Manage User') navigate('/admin/manage-user')
  }

  return (
    <MainLayout title="Admin Dashboard">
      <div className={`office-dashboard fixed-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
        <aside className="office-sidebar visible">
          <div className="sidebar-header">
            <span className="sidebar-role">Super Admin</span>
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
            {menuItems.map((menuItem) => (
              <button
                key={menuItem.label}
                type="button"
                className={`sidebar-item ${menuItem.label === 'Dashboard' ? 'active' : ''}`}
                onClick={() => handleNavigate(menuItem.label)}
                aria-label={menuItem.label}
                title={menuItem.label}
              >
                <i className={`bi ${menuItem.icon} sidebar-item__icon`} aria-hidden="true" />
                <span className="sidebar-item__label">{menuItem.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="office-content">
          <header className="office-header">
            <p className="eyebrow">Dashboard</p>
            <h1>Hello, {profile.name || 'Admin'}!</h1>
            <p className="muted">Monitor ticket requests and driver bookings</p>
          </header>

          <div className="office-actions">
            {actionConfig.map((action) => (
              <div key={action.label} className="office-card">
                <div className="office-card__left">
                  <span className="office-card__icon">
                    <i className={`bi ${action.icon}`} aria-hidden="true" />
                  </span>
                </div>
                <div className="office-card__text">
                  <span className="office-card__label">{action.label}</span>
                  <span className="office-card__countPlain">{stats[action.type] ?? 0}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </MainLayout>
  )
}

export default AdminHome

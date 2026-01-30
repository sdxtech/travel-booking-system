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
  { label: 'Pending Travel', type: 'ticketPending', icon: 'bi-ticket-perforated-fill' },
  { label: 'Pending Booking Driver', type: 'bookingPending', icon: 'bi-car-front-fill' },
]

// Dashboard for office coordinators.
function OfficeHome() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const isSuperadmin = localStorage.getItem('authRole') === 'superadmin'
  const [profile, setProfile] = useState({ name: '' })
  const [stats, setStats] = useState({
    ticketPending: 0,
    bookingPending: 0,
  })

  // Load the user profile and the current pending counts.
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

    // Fetch ticket/booking stats for the dashboard cards.
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
          bookingPending: bookingData.pending || 0,
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
    const dashboardRoute = isSuperadmin ? '/admin/home' : '/office/home'
    const manageUserRoute = isSuperadmin ? '/admin/manage-user' : '/office/manage-user'

    if (item === 'Dashboard') navigate(dashboardRoute)
    if (item === 'Travel Requests') navigate('/office/ticket-requests')
    if (item === 'Travel Status & History') navigate('/office/ticket-history')
    if (item === 'Booking Driver Status & History') navigate('/office/driver-history')
    if (item === 'Travel Assign') navigate('/office/travel-accommodation')
    if (item === 'Booking Driver Requests') navigate('/office/driver-requests')
    if (item === 'Booking Driver Assign') navigate('/office/assign-drivers')
    if (item === 'Manage User') navigate(manageUserRoute)
  }

  return (
    <MainLayout title="Office Dashboard">
      <div className={`office-dashboard fixed-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
        <aside className="office-sidebar visible">
          <div className="sidebar-header">
            <span className="sidebar-role">{isSuperadmin ? 'Super Admin' : 'Office Coordinator'}</span>
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
                className={`sidebar-item ${item.label === 'Dashboard' ? 'active' : ''}`}
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
            <p className="eyebrow">Dashboard</p>
            <h1>Hello, {profile.name || 'Coordinator'}!</h1>
            <p className="muted">Manage ticket requests and driver bookings</p>
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

export default OfficeHome

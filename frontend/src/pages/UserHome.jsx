import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

// User dashboard landing page.
function UserHome() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState({ name: '' })
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [stats, setStats] = useState({
    ticketPending: 0,
    bookingPending: 0,
    bookingActive: 0,
  })

  // Load profile header and high-level ticket/booking stats.
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setLoadingProfile(false)
      return
    }

    // Fetch the user's profile for the greeting.
    const fetchProfile = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (response.ok) {
          const data = await response.json()
          setProfile({ name: data.name || data.email || '' })
        }
      } catch (error) {
        console.error('Failed to load profile', error)
      } finally {
        setLoadingProfile(false)
      }
    }

    // Fetch tickets and bookings to compute quick stats.
    const fetchStats = async () => {
      try {
        const [ticketsRes, bookingsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/tickets/my`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE_URL}/bookings/my`, { headers: { Authorization: `Bearer ${token}` } }),
        ])

        let ticketPending = 0
        let bookingPending = 0
        let bookingActive = 0

        if (ticketsRes.ok) {
          const tickets = await ticketsRes.json()
          ticketPending = Array.isArray(tickets)
            ? tickets.filter((t) => (t.status || '').toLowerCase() === 'pending').length
            : 0
        }

        if (bookingsRes.ok) {
          const bookings = await bookingsRes.json()
          if (Array.isArray(bookings)) {
            bookingPending = bookings.filter((b) => (b.status || '').toLowerCase() === 'pending').length
            bookingActive = bookings.filter((b) => (b.status || '').toLowerCase() === 'approved').length
          }
        }

        setStats({ ticketPending, bookingPending, bookingActive })
      } catch (error) {
        console.error('Failed to load stats', error)
      }
    }

    fetchProfile()
    fetchStats()
  }, [])

  // Navigate to the travel request form.
  const handleTicketRequest = () => {
    navigate('/user/ticket-request')
  }

  // Navigate to travel history/status.
  const handleTicketHistory = () => {
    navigate('/user/ticket-history')
  }

  // Navigate to the driver booking form.
  const handleBookingDriver = () => {
    navigate('/user/booking-driver')
  }

  // Navigate to driver booking history/status.
  const handleBookingHistory = () => {
    navigate('/user/booking-history')
  }

  // Enable keyboard activation on clickable cards.
  const handleCardKeyDown = (event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  return (
    <MainLayout title="User Dashboard">
      <div className="user-dashboard">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">User Dashboard</p>
            <h1>Hello, {profile.name || (loadingProfile ? '...' : 'User')}</h1>
            <p className="muted">Summary of your trips and bookings</p>
          </div>
        </div>

        <section className="stats-section">
          <div className="stats-grid">
            <article className="stat-card">
              <div className="stat-icon stat-icon-blue" aria-hidden="true">
                <i className="bi bi-ticket-perforated" />
              </div>
              <div>
                <p className="stat-label">Pending Travel</p>
                <p className="stat-value">{stats.ticketPending}</p>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-icon stat-icon-green" aria-hidden="true">
                <i className="bi bi-car-front" />
              </div>
              <div>
                <p className="stat-label">Pending Booking Driver</p>
                <p className="stat-value">{stats.bookingPending}</p>
              </div>
            </article>
            <article className="stat-card">
              <div className="stat-icon stat-icon-amber" aria-hidden="true">
                <i className="bi bi-activity" />
              </div>
              <div>
                <p className="stat-label">Active Booking Driver</p>
                <p className="stat-value">{stats.bookingActive}</p>
              </div>
            </article>
          </div>
        </section>

        <section className="menu-section">
          <div className="section-heading">
            <div className="heading-icon" aria-hidden="true">
              <i className="bi bi-grid-3x3-gap-fill" />
            </div>
            <div>
              <h2>Main Menu</h2>
              <p className="muted">Choose the service you need</p>
            </div>
          </div>

          <div className="actions-grid">
            <article
              className="action-card action-primary is-clickable"
              role="link"
              tabIndex={0}
              onClick={handleTicketRequest}
              onKeyDown={(event) => handleCardKeyDown(event, handleTicketRequest)}
            >
              <div className="action-icon" aria-hidden="true">
                <i className="bi bi-plus-lg" />
              </div>
              <div className="action-content">
                <h3>Make a Travel Request</h3>
                <p className="muted">Submit a request for business or travel needs</p>
                <span className="link-cta">
                  Make Request <span aria-hidden="true">&rarr;</span>
                </span>
              </div>
            </article>

            <article
              className="action-card action-success is-clickable"
              role="link"
              tabIndex={0}
              onClick={handleBookingDriver}
              onKeyDown={(event) => handleCardKeyDown(event, handleBookingDriver)}
            >
              <div className="action-icon" aria-hidden="true">
                <i className="bi bi-plus-lg" />
              </div>
              <div className="action-content">
                <h3>Book a Driver</h3>
                <p className="muted">Request a driver for business travel or operational needs</p>
                <span className="link-cta success">
                  Make Request <span aria-hidden="true">&rarr;</span>
                </span>
              </div>
            </article>

            <article
              className="action-card action-plain is-clickable"
              role="link"
              tabIndex={0}
              onClick={handleTicketHistory}
              onKeyDown={(event) => handleCardKeyDown(event, handleTicketHistory)}
            >
              <div className="action-icon icon-soft" aria-hidden="true">
                <i className="bi bi-ticket-perforated" />
              </div>
              <div className="action-content">
                <h3>Travel Status & History</h3>
                <p className="muted">View all your Travel Accommodation requests</p>
                <span className="link-cta">
                  View <span aria-hidden="true">&rarr;</span>
                </span>
              </div>
            </article>

            <article
              className="action-card action-plain is-clickable"
              role="link"
              tabIndex={0}
              onClick={handleBookingHistory}
              onKeyDown={(event) => handleCardKeyDown(event, handleBookingHistory)}
            >
              <div className="action-icon icon-soft" aria-hidden="true">
                <i className="bi bi-car-front" />
              </div>
              <div className="action-content">
                <h3>Booking Driver Status & History</h3>
                <p className="muted">View all your driver bookings</p>
                <span className="link-cta">
                  View <span aria-hidden="true">&rarr;</span>
                </span>
              </div>
            </article>
          </div>
        </section>
      </div>
    </MainLayout>
  )
}

export default UserHome

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import QuickViewScheduler from '../components/QuickViewScheduler'
import {
  addMinutes,
  formatStatusLabel,
  getBookingEventColor,
  parseApiDate,
} from '../components/quickViewSchedulerUtils'
import useOfficeSidebar from '../hooks/useOfficeSidebar'
import { API_BASE_URL } from '../config'

const menuItems = [
  { label: 'Quick View', icon: 'bi-speedometer2' },
  { label: 'Travel Status & History', icon: 'bi-clock-history' },
  { label: 'Travel Assign', icon: 'bi-building' },
  { label: 'Booking Driver Status & History', icon: 'bi-card-list' },
  { label: 'Booking Driver Assign', icon: 'bi-person-check' },
  { label: 'Manage User', icon: 'bi-people' },
]

const driverCalendarColors = [
  '#df3f45',
  '#0b84d8',
  '#13b86b',
  '#d97706',
  '#8b5cf6',
  '#06b6d4',
  '#e11d48',
  '#84cc16',
]

function getErrorDetail(response, fallback) {
  return response
    .json()
    .then((data) => data?.detail || fallback)
    .catch(() => fallback)
}

function getBookingDisplayStatus(booking) {
  const raw = String(booking?.status || 'pending').toLowerCase()
  if (raw === 'approved') {
    const hasStarted = booking?.starting_mileage !== null && booking?.starting_mileage !== undefined
    if (hasStarted || booking?.started_at) return 'in_progress'
  }
  return raw
}

function buildDriverBookingEvent(booking, calendarId, color) {
  const start = parseApiDate(booking.departure_time)
  if (!start) return null

  const status = getBookingDisplayStatus(booking)
  const estimatedArrival = parseApiDate(booking.estimated_arrival_time)
  const completedAt = parseApiDate(booking.completed_at)
  const end =
    estimatedArrival && estimatedArrival > start
      ? estimatedArrival
      : completedAt && completedAt > start
        ? completedAt
        : addMinutes(start, 120)

  return {
    id: `driver-calendar-${calendarId}-${booking.id}`,
    calendarId,
    title: booking.destination || 'Busy',
    meta: `${booking.requester_name || 'Employee'} - ${formatStatusLabel(status)}`,
    start,
    end,
    color: getBookingEventColor(status, color),
  }
}

function OfficeHome() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const isSuperadmin = localStorage.getItem('authRole') === 'superadmin'
  const [tickets, setTickets] = useState([])
  const [bookings, setBookings] = useState([])
  const [driverSchedules, setDriverSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setLoading(false)
      setError('Authentication token not found.')
      return
    }

    const loadQuickView = async () => {
      setLoading(true)
      setError('')

      try {
        const [pendingTicketsRes, ticketHistoryRes, pendingBookingsRes, bookingHistoryRes, driverCalendarRes] = await Promise.all([
          fetch(`${API_BASE_URL}/tickets/pending`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/tickets/history`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/bookings/pending`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/bookings/history`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/bookings/driver-calendars`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (!pendingTicketsRes.ok) {
          setError(await getErrorDetail(pendingTicketsRes, 'Failed to load pending travel requests.'))
          setTickets([])
          setBookings([])
          return
        }
        if (!ticketHistoryRes.ok) {
          setError(await getErrorDetail(ticketHistoryRes, 'Failed to load travel history.'))
          setTickets([])
          setBookings([])
          return
        }
        if (!pendingBookingsRes.ok) {
          setError(await getErrorDetail(pendingBookingsRes, 'Failed to load pending driver bookings.'))
          setTickets([])
          setBookings([])
          return
        }
        if (!bookingHistoryRes.ok) {
          setError(await getErrorDetail(bookingHistoryRes, 'Failed to load driver booking history.'))
          setTickets([])
          setBookings([])
          return
        }
        if (!driverCalendarRes.ok) {
          setError(await getErrorDetail(driverCalendarRes, 'Failed to load driver calendars.'))
          setTickets([])
          setBookings([])
          setDriverSchedules([])
          return
        }

        const [pendingTickets, ticketHistory, pendingBookings, bookingHistory, driverCalendarData] = await Promise.all([
          pendingTicketsRes.json(),
          ticketHistoryRes.json(),
          pendingBookingsRes.json(),
          bookingHistoryRes.json(),
          driverCalendarRes.json(),
        ])

        setTickets([
          ...(Array.isArray(pendingTickets) ? pendingTickets : []),
          ...(Array.isArray(ticketHistory) ? ticketHistory : []),
        ])
        setBookings([
          ...(Array.isArray(pendingBookings) ? pendingBookings : []),
          ...(Array.isArray(bookingHistory) ? bookingHistory : []),
        ])
        setDriverSchedules(Array.isArray(driverCalendarData) ? driverCalendarData : [])
      } catch {
        setError('Network error. Please try again.')
        setTickets([])
        setBookings([])
        setDriverSchedules([])
      } finally {
        setLoading(false)
      }
    }

    loadQuickView()
  }, [])

  const driverCalendars = useMemo(
    () =>
      driverSchedules.map((driver, index) => ({
        id: driver.driver_id,
        name: driver.driver_name || driver.driver_email || `Driver ${index + 1}`,
        color: driverCalendarColors[index % driverCalendarColors.length],
      })),
    [driverSchedules]
  )

  const events = useMemo(
    () =>
      driverSchedules.flatMap((driver, index) => {
        const calendarId = driver.driver_id
        const color = driverCalendarColors[index % driverCalendarColors.length]
        const driverBookings = Array.isArray(driver.bookings) ? driver.bookings : []
        return driverBookings.map((booking) => buildDriverBookingEvent(booking, calendarId, color)).filter(Boolean)
      }),
    [driverSchedules]
  )

  const summaryItems = useMemo(() => {
    const pendingTravel = tickets.filter((ticket) => String(ticket?.status || '').toLowerCase() === 'pending').length
    const pendingBookings = bookings.filter((booking) => String(booking?.status || '').toLowerCase() === 'pending').length
    const activeBookings = bookings.filter((booking) => {
      const status = getBookingDisplayStatus(booking)
      return status === 'approved' || status === 'in_progress'
    }).length

    return [
      { label: 'Pending travel', value: pendingTravel },
      { label: 'Pending bookings', value: pendingBookings },
      { label: 'Active schedules', value: activeBookings },
    ]
  }, [tickets, bookings])

  const handleNavigate = (item) => {
    const quickViewRoute = isSuperadmin ? '/admin/home' : '/office/home'
    const manageUserRoute = isSuperadmin ? '/admin/manage-user' : '/office/manage-user'

    if (item === 'Quick View') navigate(quickViewRoute)
    if (item === 'Travel Status & History') navigate('/office/ticket-history')
    if (item === 'Booking Driver Status & History') navigate('/office/driver-history')
    if (item === 'Travel Assign') navigate('/office/travel-accommodation')
    if (item === 'Booking Driver Assign') navigate('/office/assign-drivers')
    if (item === 'Manage User') navigate(manageUserRoute)
  }

  return (
    <MainLayout title={isSuperadmin ? 'Super Admin Quick View' : 'Office Coordinator Quick View'}>
      <div className={`office-quick-view fixed-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
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
                className={`sidebar-item ${item.label === 'Quick View' ? 'active' : ''}`}
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

        <section className="office-content office-content--scheduler">
          <QuickViewScheduler
            title={isSuperadmin ? 'Super Admin Quick View' : 'Office Coordinator Quick View'}
            selectorLabel="Driver availability"
            calendars={driverCalendars}
            events={events}
            calendarListLabel="Operations calendars"
            actions={[
              {
                label: 'Travel requests & history',
                icon: 'bi-ticket-perforated',
                onClick: () => navigate('/office/ticket-history'),
              },
              {
                label: 'Booking requests & history',
                icon: 'bi-car-front',
                onClick: () => navigate('/office/driver-history'),
              },
            ]}
            summaryItems={summaryItems}
            loading={loading}
            error={error}
            emptyMessage="No office schedule for this work week."
          />
        </section>
      </div>
    </MainLayout>
  )
}

export default OfficeHome

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
import { API_BASE_URL } from '../config'

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

function buildDriverBookingEvent(booking, calendarId, color) {
  const start = parseApiDate(booking.departure_time)
  if (!start) return null

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
    title: 'Busy',
    meta: formatStatusLabel(booking.status),
    start,
    end,
    color: getBookingEventColor(booking.status, color),
  }
}

function UserHome() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [bookings, setBookings] = useState([])
  const [driverSchedules, setDriverSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setLoading(false)
      setError('Authentication token not found. Please login again.')
      return
    }

    const loadQuickView = async () => {
      setLoading(true)
      setError('')

      try {
        const [ticketsRes, bookingsRes, driverCalendarRes] = await Promise.all([
          fetch(`${API_BASE_URL}/tickets/my`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/bookings/my`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/bookings/driver-calendars`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (!ticketsRes.ok) {
          setError(await getErrorDetail(ticketsRes, 'Failed to load travel requests.'))
          setTickets([])
          setBookings([])
          setDriverSchedules([])
          return
        }

        if (!bookingsRes.ok) {
          setError(await getErrorDetail(bookingsRes, 'Failed to load driver bookings.'))
          setTickets([])
          setBookings([])
          setDriverSchedules([])
          return
        }

        if (!driverCalendarRes.ok) {
          setError(await getErrorDetail(driverCalendarRes, 'Failed to load driver calendars.'))
          setTickets([])
          setBookings([])
          setDriverSchedules([])
          return
        }

        const [ticketsData, bookingsData, driverCalendarData] = await Promise.all([
          ticketsRes.json(),
          bookingsRes.json(),
          driverCalendarRes.json(),
        ])
        setTickets(Array.isArray(ticketsData) ? ticketsData : [])
        setBookings(Array.isArray(bookingsData) ? bookingsData : [])
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
    const allItems = [...tickets, ...bookings]
    const pending = allItems.filter((item) => String(item?.status || '').toLowerCase() === 'pending').length
    const busySchedules = driverSchedules.reduce((total, driver) => {
      const driverBookings = Array.isArray(driver.bookings) ? driver.bookings : []
      return total + driverBookings.length
    }, 0)

    return [
      { label: 'Driver calendars', value: driverSchedules.length },
      { label: 'Busy schedules', value: busySchedules },
      { label: 'My pending requests', value: pending },
    ]
  }, [tickets, bookings, driverSchedules])

  return (
    <MainLayout title="Employee Quick View">
      <div className="user-quick-view user-quick-view--scheduler">
        <QuickViewScheduler
          title="Employee Quick View"
          toolbarLabel=""
          selectorLabel="Driver availability"
          calendars={driverCalendars}
          events={events}
          calendarListLabel="Driver calendars"
          actions={[
            {
              label: 'Go to my booking page',
              icon: 'bi-car-front',
              onClick: () => navigate('/user/booking-driver'),
            },
          ]}
          summaryItems={summaryItems}
          loading={loading}
          error={error}
          emptyMessage="No driver schedule for this work week."
        />
      </div>
    </MainLayout>
  )
}

export default UserHome

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import BookingFormSelect from '../components/BookingFormSelect'
import { DRIVER_SELECT_COLORS } from '../components/driverSelectColors'
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

const tripTypeOptions = [
  { value: 'antar', label: 'Drop-off', icon: 'bi-arrow-right-circle' },
  { value: 'jemput', label: 'Pick-up', icon: 'bi-arrow-left-circle' },
  { value: 'fulltrip', label: 'Full Trip', icon: 'bi-arrow-repeat' },
]

// Driver booking history page for office coordinators (with export + date range).
function OfficeDriverHistory() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const isSuperadmin = localStorage.getItem('authRole') === 'superadmin'
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [drivers, setDrivers] = useState([])
  const [driversLoading, setDriversLoading] = useState(false)
  const [driversError, setDriversError] = useState('')
  const [unavailableDriverIds, setUnavailableDriverIds] = useState([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [assignTarget, setAssignTarget] = useState(null)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [actionMenu, setActionMenu] = useState(null)
  const availabilityRequestIdRef = useRef(0)
  const actionMenuRef = useRef(null)
  const actionMenuTriggerRef = useRef(null)
  const [page, setPage] = useState(1)
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' })
  const [hasLoaded, setHasLoaded] = useState(false)
  const [rangeModalOpen, setRangeModalOpen] = useState(false)
  const [rangeMode, setRangeMode] = useState('all')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [rangeError, setRangeError] = useState('')
  const [activeRange, setActiveRange] = useState({ mode: 'all', start: '', end: '' })

  const pageSize = 10

  // Convert API timestamps into a Date instance.
  const toDate = (value) => {
    if (!value) return null
    if (value?.seconds) return new Date(value.seconds * 1000)
    const dt = new Date(value)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  // Compute total kilometers based on starting/ending mileage.
  const getDistanceNumber = (booking) => {
    const starting = Number(booking?.starting_mileage)
    const ending = Number(booking?.ending_mileage)
    if (!Number.isFinite(starting) || !Number.isFinite(ending)) return null
    if (ending < starting) return null
    return ending - starting
  }

  // Provide a stable sort value per table column.
  const getBookingSortValue = (booking, key) => {
    if (!booking) return ''
    switch (key) {
      case 'requester_name':
        return booking.requester_name || ''
      case 'requester_dept_job_position':
        return booking.requester_dept_job_position || ''
      case 'requester_phone':
        return booking.requester_phone || ''
      case 'requester_email':
        return booking.requester_email || ''
      case 'requester_nik':
        return booking.requester_nik || ''
      case 'pickup_location':
        return booking.pickup_location || ''
      case 'destination':
        return booking.destination || ''
      case 'passenger_count':
        {
          const count = Number(booking.passenger_count)
          return Number.isFinite(count) ? count : null
        }
      case 'day':
        return toDate(booking.departure_time)?.getTime() ?? null
      case 'departure_time':
        return toDate(booking.departure_time)?.getTime() ?? null
      case 'estimated_arrival_time':
        return toDate(booking.estimated_arrival_time)?.getTime() ?? null
      case 'starting_time':
        return toDate(booking.started_at)?.getTime() ?? null
      case 'ending_time':
        return toDate(booking.driver_finished_at || booking.completed_at)?.getTime() ?? null
      case 'total_duration':
        return getDurationMinutes(booking) ?? null
      case 'ot_hour':
        {
          const minutes = getOvertimeMinutes(booking)
          return minutes === null ? null : Math.floor(minutes / 60)
        }
      case 'ot_minutes':
        {
          const minutes = getOvertimeMinutes(booking)
          return minutes === null ? null : minutes % 60
        }
      case 'trip_type':
        return booking.trip_type || ''
      case 'driver':
        return booking.driver_name || booking.driver_id || ''
      case 'starting_mileage':
        {
          const starting = Number(booking.starting_mileage)
          return Number.isFinite(starting) ? starting : null
        }
      case 'ending_mileage':
        {
          const ending = Number(booking.ending_mileage)
          return Number.isFinite(ending) ? ending : null
        }
      case 'total_distance':
        return getDistanceNumber(booking) ?? null
      case 'status':
        return String(booking.status || '').toLowerCase()
      case 'validated_by':
        return booking.validated_by_name || booking.validated_by || ''
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

  // Sort bookings based on the active column/direction.
  const sortedBookings = useMemo(() => {
    if (!sortConfig.key) return bookings

    return bookings
      .map((booking, index) => ({ booking, index }))
      .sort((a, b) => {
        const aValue = getBookingSortValue(a.booking, sortConfig.key)
        const bValue = getBookingSortValue(b.booking, sortConfig.key)
        const base = compareValues(aValue, bValue)

        if (base !== 0) {
          return sortConfig.direction === 'asc' ? base : -base
        }

        return a.index - b.index
      })
      .map((entry) => entry.booking)
  }, [bookings, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedBookings = sortedBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Keep page index within bounds when the list size changes.
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  // Keep the floating Super Admin menu outside the scrollable table.
  useEffect(() => {
    if (!actionMenu) return undefined

    const closeMenu = (event) => {
      if (
        event?.type === 'pointerdown' &&
        (actionMenuRef.current?.contains(event.target) || actionMenuTriggerRef.current?.contains(event.target))
      ) {
        return
      }
      setActionMenu(null)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeMenu(event)
    }

    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [actionMenu])

  const toggleActionMenu = (event, booking) => {
    if (actionLoadingId === booking.id || loading) return
    if (actionMenu?.booking?.id === booking.id) {
      setActionMenu(null)
      return
    }

    const trigger = event.currentTarget
    const triggerRect = trigger.getBoundingClientRect()
    const menuWidth = 190
    const menuHeight = 188
    const viewportGap = 8
    const controlGap = 5
    const hasMoreRoomAbove = triggerRect.top > window.innerHeight - triggerRect.bottom
    const openAbove = window.innerHeight - triggerRect.bottom < menuHeight + controlGap && hasMoreRoomAbove
    const desiredTop = openAbove
      ? triggerRect.top - menuHeight - controlGap
      : triggerRect.bottom + controlGap

    actionMenuTriggerRef.current = trigger
    setActionMenu({
      booking,
      top: Math.max(viewportGap, Math.min(desiredTop, window.innerHeight - menuHeight - viewportGap)),
      left: Math.max(
        viewportGap,
        Math.min(triggerRect.right - menuWidth, window.innerWidth - menuWidth - viewportGap),
      ),
    })
  }

  const closeActionMenu = () => setActionMenu(null)

  // Load drivers once so pending bookings can be reviewed and assigned from this table.
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) return

    const loadDrivers = async () => {
      setDriversLoading(true)
      setDriversError('')
      try {
        const res = await fetch(`${API_BASE_URL}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setDriversError(data?.detail || 'Failed to load drivers.')
          setDrivers([])
          return
        }

        const data = await res.json()
        const allUsers = Array.isArray(data) ? data : []
        setDrivers(
          allUsers.filter(
            (user) => user.role === 'driver' && (isSuperadmin || (user.booking_enabled !== false && !user.disabled))
          )
        )
      } catch {
        setDriversError('Network error. Please try again.')
        setDrivers([])
      } finally {
        setDriversLoading(false)
      }
    }

    loadDrivers()
  }, [isSuperadmin])

  const driverOptions = useMemo(
    () =>
      drivers.map((driver, index) => {
        const isUnavailable = unavailableDriverIds.includes(driver.uid)
        const availabilityStatus = availabilityError ? 'Not checked' : isUnavailable ? 'Unavailable' : 'Available'
        return {
          value: driver.uid,
          label: driver.name || driver.email || 'Driver',
          status: availabilityStatus,
          statusTone:
            availabilityStatus === 'Available'
              ? 'available'
              : availabilityStatus === 'Unavailable'
                ? 'unavailable'
                : 'neutral',
          color: DRIVER_SELECT_COLORS[index % DRIVER_SELECT_COLORS.length],
          disabled: !isSuperadmin && isUnavailable,
        }
      }),
    [availabilityError, drivers, isSuperadmin, unavailableDriverIds]
  )

  // Build the label shown beside the active date range selector.
  const getActiveRangeLabel = () => {
    if (!hasLoaded) return 'Not loaded'
    if (activeRange.mode === 'all') return 'All time'
    if (activeRange.start && activeRange.end) return `${activeRange.start} to ${activeRange.end}`
    return 'Custom range'
  }

  // Open the date range modal and prefill with current range.
  const openRangeModal = () => {
    setRangeError('')
    setRangeMode(activeRange.mode || 'all')
    setRangeStart(activeRange.start || '')
    setRangeEnd(activeRange.end || '')
    setRangeModalOpen(true)
  }

  // Close the range modal unless a fetch is in progress.
  const closeRangeModal = () => {
    if (loading) return
    setRangeError('')
    setRangeModalOpen(false)
  }

  // Convert the date-only range into concrete Date objects for filtering.
  const getRangeBounds = (range) => {
    if (!range || range.mode !== 'range') return { start: null, end: null }
    const start = new Date(`${range.start}T00:00:00`)
    const end = new Date(`${range.end}T23:59:59.999`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { start: null, end: null }
    }
    return { start, end }
  }

  // Load driver booking history and apply optional date filtering client-side.
  const loadBookings = async (range) => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setError('Authentication token not found.')
      setBookings([])
      setHasLoaded(true)
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/history`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        let detail = 'Failed to load driver history.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setError(detail)
        setBookings([])
        return
      }

      const data = await res.json()
      const rawBookings = Array.isArray(data) ? data : []

      if (range?.mode === 'range') {
        const { start, end } = getRangeBounds(range)
        if (start && end) {
          const filtered = rawBookings.filter((booking) => {
            const departureTime = toDate(booking?.departure_time)
            if (!departureTime) return false
            return departureTime >= start && departureTime <= end
          })
          setBookings(filtered)
        } else {
          setBookings([])
        }
      } else {
        setBookings(rawBookings)
      }
    } catch (err) {
      setError('Network error. Please try again.')
      setBookings([])
    } finally {
      setLoading(false)
      setHasLoaded(true)
    }
  }

  // Load the combined request/history table immediately on entry.
  useEffect(() => {
    loadBookings({ mode: 'all', start: '', end: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Validate and apply the current range selection, then reload data.
  const applyRange = async () => {
    setRangeError('')

    const nextRange = { mode: rangeMode, start: rangeStart, end: rangeEnd }

    if (rangeMode === 'range') {
      if (!rangeStart || !rangeEnd) {
        setRangeError('Start date and end date are required.')
        return
      }

      const { start, end } = getRangeBounds(nextRange)
      if (!start || !end) {
        setRangeError('Invalid date range.')
        return
      }

      if (start > end) {
        setRangeError('Start date must be before or equal to end date.')
        return
      }
    }

    setActiveRange(nextRange)
    setPage(1)
    setRangeModalOpen(false)
    await loadBookings(nextRange)
  }

  // Handle sidebar navigation clicks.
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

  // Format a date-only value for table display.
  const formatDate = (value) => {
    const dt = toDate(value)
    return dt ? dt.toLocaleDateString('en-GB') : '-'
  }

  // Format weekday name for exports/table.
  const formatDay = (value) => {
    const dt = toDate(value)
    return dt ? dt.toLocaleDateString('en-US', { weekday: 'short' }) : '-'
  }

  // Format time values for table display.
  const formatTime = (value) => {
    const dt = toDate(value)
    return dt
      ? dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '-'
  }

  // Convert trip type values into user-facing labels.
  const formatTripType = (value) => {
    if (!value) return '-'
    if (value === 'antar') return 'Drop-off'
    if (value === 'jemput') return 'Pick-up'
    if (value === 'fulltrip') return 'Full Trip'
    return value
  }

  // Normalize booking status for UI (approved + started => in_progress).
  const getBookingStatus = (booking) => {
    const raw = String(booking?.status || 'pending').toLowerCase()
    if (raw === 'approved') {
      const hasStarted = booking?.starting_mileage !== null && booking?.starting_mileage !== undefined
      if (hasStarted || booking?.started_at) return 'in_progress'
    }
    return raw
  }

  // Format status strings for display.
  const formatStatusText = (value) => {
    if (!value) return '-'
    return String(value).replace(/_/g, ' ')
  }

  // Determine whether the booking can still be cancelled by the office.
  const canCancelBooking = (booking) => {
    const status = getBookingStatus(booking)
    const hasStarted = booking?.starting_mileage !== null && booking?.starting_mileage !== undefined
    return status === 'approved' && !hasStarted && !booking?.started_at
  }

  // Check driver availability for a booking being reviewed.
  const loadUnavailableDrivers = async (booking) => {
    availabilityRequestIdRef.current += 1
    const requestId = availabilityRequestIdRef.current
    if (!booking?.departure_time) return

    const token = localStorage.getItem('authToken')
    if (!token) return

    setAvailabilityLoading(true)
    setAvailabilityError('')
    setUnavailableDriverIds([])
    try {
      const url = new URL(`${API_BASE_URL}/bookings/unavailable-drivers`)
      url.searchParams.set('departure_time', booking.departure_time)
      if (booking.estimated_arrival_time) {
        url.searchParams.set('estimated_arrival_time', booking.estimated_arrival_time)
      }

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (requestId === availabilityRequestIdRef.current) {
          setAvailabilityError(data?.detail || 'Failed to check driver availability.')
        }
        return
      }

      const data = await res.json()
      if (requestId === availabilityRequestIdRef.current) {
        setUnavailableDriverIds(Array.isArray(data) ? data : [])
      }
    } catch {
      if (requestId === availabilityRequestIdRef.current) {
        setAvailabilityError('Network error. Please try again.')
      }
    } finally {
      if (requestId === availabilityRequestIdRef.current) setAvailabilityLoading(false)
    }
  }

  const openAssignModal = (booking) => {
    setAssignTarget(booking)
    setSelectedDriverId(booking?.driver_id || '')
    setAvailabilityError('')
    setUnavailableDriverIds([])
    setActionError('')
    loadUnavailableDrivers(booking)
  }

  const closeAssignModal = () => {
    availabilityRequestIdRef.current += 1
    setAssignTarget(null)
    setSelectedDriverId('')
    setUnavailableDriverIds([])
    setAvailabilityError('')
    setAvailabilityLoading(false)
  }

  // Approve a booking and optionally reassign its driver from the combined table.
  const handleAssign = async () => {
    if (!assignTarget?.id || !selectedDriverId) {
      setActionError('Please select a driver.')
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setActionLoadingId(assignTarget.id)
    setActionError('')
    setActionMessage('')
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${assignTarget.id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved', driver_id: selectedDriverId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data?.detail || 'Failed to approve and assign driver.')
        return
      }

      const updated = await res.json()
      setBookings((current) => current.map((item) => (item.id === assignTarget.id ? { ...item, ...updated } : item)))
      setActionMessage('Booking approved and driver assigned.')
      window.dispatchEvent(new Event('notifications:refresh'))
      closeAssignModal()
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  const toLocalDateTimeInput = (value) => {
    const date = toDate(value)
    if (!date) return ''
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
    return localDate.toISOString().slice(0, 16)
  }

  const openEditModal = (booking) => {
    setEditTarget(booking)
    setEditForm({
      driver_id: booking.driver_id || '',
      pickup_location: booking.pickup_location || '',
      destination: booking.destination || '',
      trip_type: booking.trip_type || 'antar',
      departure_time: toLocalDateTimeInput(booking.departure_time),
      estimated_arrival_time: toLocalDateTimeInput(booking.estimated_arrival_time),
      passenger_count: booking.passenger_count ?? 1,
    })
    setActionError('')
    loadUnavailableDrivers(booking)
  }

  const closeEditModal = () => {
    availabilityRequestIdRef.current += 1
    setEditTarget(null)
    setEditForm(null)
    setUnavailableDriverIds([])
    setAvailabilityError('')
    setAvailabilityLoading(false)
  }

  const handleEditFormChange = (field) => (event) => {
    setEditForm((current) => ({ ...current, [field]: event.target.value }))
  }

  // Save a Super Admin booking edit without changing its current workflow status.
  const handleSaveEdit = async (event) => {
    event.preventDefault()
    if (!isSuperadmin || !editTarget?.id || !editForm) return

    if (!editForm.driver_id) {
      setActionError('Please select a driver.')
      return
    }

    const departureTime = new Date(editForm.departure_time)
    const estimatedArrivalTime = new Date(editForm.estimated_arrival_time)
    if (
      Number.isNaN(departureTime.getTime()) ||
      Number.isNaN(estimatedArrivalTime.getTime()) ||
      estimatedArrivalTime <= departureTime
    ) {
      setActionError('Estimated arrival time must be later than departure time.')
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setActionLoadingId(editTarget.id)
    setActionError('')
    setActionMessage('')
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${editTarget.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...editForm,
          departure_time: departureTime.toISOString(),
          estimated_arrival_time: estimatedArrivalTime.toISOString(),
          passenger_count: Number(editForm.passenger_count),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data?.detail || 'Failed to update booking.')
        return
      }

      const updated = await res.json()
      setBookings((current) => current.map((item) => (item.id === editTarget.id ? { ...item, ...updated } : item)))
      setActionMessage('Booking updated by Super Admin.')
      closeEditModal()
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  // Cancel an approved booking before it has started.
  const handleCancelBooking = async (booking) => {
    const confirmed = window.confirm('Cancel this approved booking?')
    if (!confirmed) return

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setActionLoadingId(booking.id)
    setActionError('')
    setActionMessage('')

    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${booking.id}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        let detail = 'Failed to cancel booking.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      const updated = await res.json()
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, ...updated } : b)))
      setActionMessage('Booking cancelled.')
    } catch (err) {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  // Validate trips created without a linked Employee account.
  const handleValidateCompletion = async (booking) => {
    const confirmed = window.confirm('Confirm that this unlinked trip has been completed?')
    if (!confirmed) return

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setActionLoadingId(booking.id)
    setActionError('')
    setActionMessage('')
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${booking.id}/validate-completion`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data?.detail || 'Failed to validate trip completion.')
        return
      }

      const updated = await res.json()
      setBookings((prev) => prev.map((item) => (item.id === booking.id ? { ...item, ...updated } : item)))
      setActionMessage('Trip completion validated.')
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  // Reject a booking from the combined table; Super Admin may overwrite any status.
  const handleRejectBooking = async (booking) => {
    if (!booking?.id) return
    const confirmed = window.confirm(`Reject booking ${booking.request_id || booking.id}?`)
    if (!confirmed) return

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setActionLoadingId(booking.id)
    setActionError('')
    setActionMessage('')
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${booking.id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'rejected' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data?.detail || 'Failed to reject booking.')
        return
      }

      const updated = await res.json()
      setBookings((prev) => prev.map((item) => (item.id === booking.id ? { ...item, ...updated } : item)))
      setActionMessage('Booking rejected.')
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  // Compute trip duration in minutes based on started/completed timestamps.
  function getDurationMinutes(booking) {
    const startedAt = toDate(booking?.started_at)
    const completedAt = toDate(booking?.driver_finished_at || booking?.completed_at)
    if (!startedAt || !completedAt) return null
    const diffMs = completedAt.getTime() - startedAt.getTime()
    if (diffMs < 0) return null
    return Math.floor(diffMs / 60000)
  }

  // Format duration into "Xh YYm".
  const formatDuration = (booking) => {
    const minutes = getDurationMinutes(booking)
    if (minutes === null) return '-'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${String(mins).padStart(2, '0')}m`
  }

  // Compute overtime minutes beyond an 8-hour baseline.
  function getOvertimeMinutes(booking) {
    const minutes = getDurationMinutes(booking)
    if (minutes === null) return null
    const overtime = minutes - 8 * 60
    return overtime > 0 ? overtime : 0
  }

  // Format overtime hours for exports/table.
  const formatOvertimeHours = (booking) => {
    const overtimeMinutes = getOvertimeMinutes(booking)
    if (overtimeMinutes === null) return '-'
    return String(Math.floor(overtimeMinutes / 60))
  }

  // Format overtime minutes for exports/table.
  const formatOvertimeMinutes = (booking) => {
    const overtimeMinutes = getOvertimeMinutes(booking)
    if (overtimeMinutes === null) return '-'
    return String(overtimeMinutes % 60)
  }

  // Format distance in kilometers for table display.
  const formatDistance = (booking) => {
    const distance = getDistanceNumber(booking)
    return distance === null ? '-' : String(distance)
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

  // Escape values for the HTML-based Excel export.
  const escapeHtml = (value) => {
    if (value === null || value === undefined) return ''
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // Export the current filtered/sorted view as an Excel-readable HTML table.
  const handleExport = () => {
    if (!sortedBookings.length) return

    const rangeLabel =
      activeRange.mode === 'range' && activeRange.start && activeRange.end
        ? `${activeRange.start}_to_${activeRange.end}`
        : 'all-time'

    const headers = [
      'No',
      'Name',
      'User Dept/Job Position',
      'Phone',
      'Email',
      'National ID',
      'Pickup Location',
      'Destination',
      'Total Passenger',
      'Day',
      'Departure Date',
      'Estimated Arrival Date',
      'Estimated Arrival Time',
      'Starting Time',
      'Ending Time',
      'Total Duration',
      'OT hour',
      'OT minutes',
      'Type of Trip',
      'Driver',
      'Starting Kilometer',
      'Ending Kilometer',
      'Total Distance',
      'Status',
      'Validated By',
    ]

    const rows = sortedBookings.map((booking, index) => [
      index + 1,
      booking.requester_name || '',
      booking.requester_dept_job_position || '',
      booking.requester_phone || '',
      booking.requester_email || '',
      booking.requester_nik || '',
      booking.pickup_location || '',
      booking.destination || '',
      booking.passenger_count ?? '',
      formatDay(booking.departure_time),
      formatDate(booking.departure_time),
      formatDate(booking.estimated_arrival_time),
      formatTime(booking.estimated_arrival_time),
      formatTime(booking.started_at),
      formatTime(booking.driver_finished_at || booking.completed_at),
      formatDuration(booking),
      formatOvertimeHours(booking),
      formatOvertimeMinutes(booking),
      formatTripType(booking.trip_type),
      booking.driver_name || booking.driver_id || '',
      booking.starting_mileage ?? '',
      booking.ending_mileage ?? '',
      formatDistance(booking),
      formatStatusText(getBookingStatus(booking)),
      booking.validated_by_name || booking.validated_by || '',
    ])

    const headerHtml = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`
    const bodyHtml = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('')

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
  </head>
  <body>
    <table border="1">
      <thead>${headerHtml}</thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </body>
</html>`

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `driver_history_${rangeLabel}_${new Date().toISOString().slice(0, 10)}.xls`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <MainLayout title="Driver History">
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
                className={`sidebar-item ${item.label === 'Booking Driver Status & History' ? 'active' : ''}`}
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
            <p className="eyebrow">Booking Driver Status & History</p>
            <h1>Booking Driver Requests & History</h1>
            <p className="muted">All booking requests, statuses, and history in one table</p>
          </header>

          <div className="form-actions">
            <button type="button" className="btn btn-neutral" onClick={openRangeModal} disabled={loading}>
              <i className="bi bi-calendar3" aria-hidden="true" />
              {hasLoaded ? 'Change Date Range' : 'Date Range'}
            </button>
            <button
              type="button"
              className="btn btn-outline-brand"
              onClick={handleExport}
              disabled={!hasLoaded || loading || !bookings.length}
              title={bookings.length ? 'Export to Excel (.xls)' : 'No data to export'}
            >
              <i className="bi bi-file-earmark-excel" />
              Export Excel
            </button>
          </div>

          {hasLoaded ? <p className="muted">Date Range: {getActiveRangeLabel()}</p> : <p className="muted">Date Range: Not loaded</p>}
          {!loading && actionMessage ? <p className="success-text">{actionMessage}</p> : null}
          {!loading && actionError ? <p className="error-text">{actionError}</p> : null}

          <div className="office-table-wrapper">
            <table className="office-table">
              <thead>
                <tr>
                  <th className="table-col-no">No</th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('requester_name')}>
                      Name {renderSortIcon('requester_name')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="table-sort"
                      onClick={() => toggleSort('requester_dept_job_position')}
                    >
                      User Dept/Job Position {renderSortIcon('requester_dept_job_position')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('requester_phone')}>
                      Phone {renderSortIcon('requester_phone')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('requester_email')}>
                      Email {renderSortIcon('requester_email')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('requester_nik')}>
                      National ID {renderSortIcon('requester_nik')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('pickup_location')}>
                      Pickup Location {renderSortIcon('pickup_location')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('destination')}>
                      Destination {renderSortIcon('destination')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('passenger_count')}>
                      Total Passenger {renderSortIcon('passenger_count')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('day')}>
                      Day {renderSortIcon('day')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('departure_time')}>
                      Departure Date {renderSortIcon('departure_time')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('estimated_arrival_time')}>
                      Estimated Arrival Date {renderSortIcon('estimated_arrival_time')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('estimated_arrival_time')}>
                      Estimated Arrival Time {renderSortIcon('estimated_arrival_time')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('starting_time')}>
                      Starting Time {renderSortIcon('starting_time')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('ending_time')}>
                      Ending Time {renderSortIcon('ending_time')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('total_duration')}>
                      Total Duration {renderSortIcon('total_duration')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('ot_hour')}>
                      OT hour {renderSortIcon('ot_hour')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('ot_minutes')}>
                      OT minutes {renderSortIcon('ot_minutes')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('trip_type')}>
                      Type of Trip {renderSortIcon('trip_type')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('driver')}>
                      Driver {renderSortIcon('driver')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('starting_mileage')}>
                      Starting Kilometer {renderSortIcon('starting_mileage')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('ending_mileage')}>
                      Ending Kilometer {renderSortIcon('ending_mileage')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('total_distance')}>
                      Total Distance {renderSortIcon('total_distance')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('status')}>
                      Status {renderSortIcon('status')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('validated_by')}>
                      Validated By {renderSortIcon('validated_by')}
                    </button>
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="26" className="muted">
                      Loading...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="26" className="error-text">
                      {error}
                    </td>
                  </tr>
                ) : !hasLoaded ? (
                  <tr>
                    <td colSpan="26" className="muted">
                      Select a date range to load driver history.
                    </td>
                  </tr>
                ) : bookings.length === 0 ? (
                  <tr>
                    <td colSpan="26" className="muted">
                      No driver history found.
                    </td>
                  </tr>
                ) : (
                  pagedBookings.map((booking, index) => (
                    <tr key={booking.id}>
                      <td className="table-col-no">{(currentPage - 1) * pageSize + index + 1}</td>
                      <td>{booking.requester_name || '-'}</td>
                      <td>{booking.requester_dept_job_position || '-'}</td>
                      <td>{booking.requester_phone || '-'}</td>
                      <td>{booking.requester_email || '-'}</td>
                      <td>{booking.requester_nik || '-'}</td>
                      <td>{booking.pickup_location || '-'}</td>
                      <td>{booking.destination || '-'}</td>
                      <td>{booking.passenger_count ?? '-'}</td>
                      <td>{formatDay(booking.departure_time)}</td>
                      <td>{formatDate(booking.departure_time)}</td>
                      <td>{formatDate(booking.estimated_arrival_time)}</td>
                      <td>{formatTime(booking.estimated_arrival_time)}</td>
                      <td>{formatTime(booking.started_at)}</td>
                      <td>{formatTime(booking.driver_finished_at || booking.completed_at)}</td>
                      <td>{formatDuration(booking)}</td>
                      <td>{formatOvertimeHours(booking)}</td>
                      <td>{formatOvertimeMinutes(booking)}</td>
                      <td>{formatTripType(booking.trip_type)}</td>
                      <td>{booking.driver_name || booking.driver_id || '-'}</td>
                      <td>{booking.starting_mileage ?? '-'}</td>
                      <td>{booking.ending_mileage ?? '-'}</td>
                      <td>{formatDistance(booking)}</td>
                      <td>
                        {booking.status ? (
                          <span className={`status-badge status-${getBookingStatus(booking)}`}>
                            {formatStatusText(getBookingStatus(booking))}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>{booking.validated_by_name || booking.validated_by || '-'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline-brand superadmin-action-dropdown__trigger"
                          aria-haspopup="menu"
                          aria-expanded={actionMenu?.booking?.id === booking.id}
                          disabled={actionLoadingId === booking.id || loading}
                          onClick={(event) => toggleActionMenu(event, booking)}
                        >
                          Actions
                          <i className="bi bi-chevron-down" aria-hidden="true" />
                        </button>
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
              disabled={loading || !hasLoaded || currentPage <= 1 || bookings.length === 0}
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
              disabled={loading || !hasLoaded || currentPage >= totalPages || bookings.length === 0}
              onClick={() => setPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
            >
              Next
            </button>
          </div>

          {actionMenu
            ? createPortal(
                <div
                  ref={actionMenuRef}
                  className="superadmin-action-dropdown__menu"
                  role="menu"
                  aria-label={`Actions for ${actionMenu.booking.request_id || 'booking'}`}
                  style={{ top: actionMenu.top, left: actionMenu.left }}
                >
                  {isSuperadmin ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        const booking = actionMenu.booking
                        closeActionMenu()
                        openEditModal(booking)
                      }}
                    >
                      <i className="bi bi-pencil" aria-hidden="true" />
                      Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!isSuperadmin && getBookingStatus(actionMenu.booking) !== 'pending'}
                    title={
                      !isSuperadmin && getBookingStatus(actionMenu.booking) !== 'pending'
                        ? 'Approve hanya tersedia untuk booking Pending.'
                        : undefined
                    }
                    onClick={() => {
                      const booking = actionMenu.booking
                      closeActionMenu()
                      openAssignModal(booking)
                    }}
                  >
                    <i className="bi bi-check-circle" aria-hidden="true" />
                    {isSuperadmin ? 'Approve / Reassign' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    disabled={!isSuperadmin && getBookingStatus(actionMenu.booking) !== 'pending'}
                    title={
                      !isSuperadmin && getBookingStatus(actionMenu.booking) !== 'pending'
                        ? 'Reject hanya tersedia untuk booking Pending.'
                        : undefined
                    }
                    onClick={() => {
                      const booking = actionMenu.booking
                      closeActionMenu()
                      handleRejectBooking(booking)
                    }}
                  >
                    <i className="bi bi-x-circle" aria-hidden="true" />
                    Reject
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    disabled={!isSuperadmin && !canCancelBooking(actionMenu.booking)}
                    title={
                      !isSuperadmin && !canCancelBooking(actionMenu.booking)
                        ? 'Cancel hanya tersedia sebelum perjalanan dimulai sesuai rules booking.'
                        : undefined
                    }
                    onClick={() => {
                      const booking = actionMenu.booking
                      closeActionMenu()
                      handleCancelBooking(booking)
                    }}
                  >
                    <i className="bi bi-slash-circle" aria-hidden="true" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={
                      !isSuperadmin &&
                      (getBookingStatus(actionMenu.booking) !== 'awaiting_validation' ||
                        Boolean(actionMenu.booking.user_id))
                    }
                    title={
                      !isSuperadmin &&
                      (getBookingStatus(actionMenu.booking) !== 'awaiting_validation' ||
                        Boolean(actionMenu.booking.user_id))
                        ? 'Validate tersedia saat menunggu validasi dan tidak terhubung ke Employee.'
                        : undefined
                    }
                    onClick={() => {
                      const booking = actionMenu.booking
                      closeActionMenu()
                      handleValidateCompletion(booking)
                    }}
                  >
                    <i className="bi bi-person-check" aria-hidden="true" />
                    Validate
                  </button>
                </div>,
                document.body,
              )
            : null}

          {editTarget && editForm ? (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="superadmin-booking-edit-title"
              onClick={() => {
                if (!actionLoadingId) closeEditModal()
              }}
            >
              <form className="modal ticket-details-modal" onSubmit={handleSaveEdit} onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <p className="eyebrow">Super Admin Override</p>
                    <h2 id="superadmin-booking-edit-title">Edit {editTarget.request_id || 'Booking'}</h2>
                  </div>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={closeEditModal}
                    disabled={Boolean(actionLoadingId)}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <div className="field-grid">
                  <label className="inline-label">
                    <span>Departure Date & Time</span>
                    <input
                      type="datetime-local"
                      value={editForm.departure_time}
                      onChange={handleEditFormChange('departure_time')}
                      disabled={Boolean(actionLoadingId)}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>Estimated Arrival Date & Time</span>
                    <input
                      type="datetime-local"
                      value={editForm.estimated_arrival_time}
                      onChange={handleEditFormChange('estimated_arrival_time')}
                      disabled={Boolean(actionLoadingId)}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>Pickup Location</span>
                    <input
                      type="text"
                      value={editForm.pickup_location}
                      onChange={handleEditFormChange('pickup_location')}
                      disabled={Boolean(actionLoadingId)}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>Destination</span>
                    <input
                      type="text"
                      value={editForm.destination}
                      onChange={handleEditFormChange('destination')}
                      disabled={Boolean(actionLoadingId)}
                      required
                    />
                  </label>
                  <div className="inline-label">
                    <span>Trip Type</span>
                    <BookingFormSelect
                      value={editForm.trip_type}
                      options={tripTypeOptions}
                      placeholder="Select trip type..."
                      disabled={Boolean(actionLoadingId)}
                      ariaLabel="Select trip type"
                      onChange={(value) => setEditForm((current) => ({ ...current, trip_type: value }))}
                    />
                  </div>
                  <label className="inline-label">
                    <span>Total Passenger</span>
                    <input
                      type="number"
                      min="1"
                      value={editForm.passenger_count}
                      onChange={handleEditFormChange('passenger_count')}
                      disabled={Boolean(actionLoadingId)}
                      required
                    />
                  </label>
                  <div className="inline-label" style={{ gridColumn: '1 / -1' }}>
                    <span>Driver</span>
                    <BookingFormSelect
                      value={editForm.driver_id}
                      options={driverOptions}
                      placeholder={driversLoading ? 'Loading drivers...' : 'Select driver...'}
                      disabled={driversLoading || availabilityLoading || Boolean(actionLoadingId)}
                      ariaLabel="Select driver"
                      onChange={(value) => setEditForm((current) => ({ ...current, driver_id: value }))}
                    />
                  </div>
                </div>

                {driversError ? <p className="error-text">{driversError}</p> : null}
                {availabilityError ? <p className="error-text">{availabilityError}</p> : null}
                {actionError ? <p className="error-text">{actionError}</p> : null}

                <div className="modal-actions">
                  <button type="submit" className="btn btn-primary" disabled={Boolean(actionLoadingId)}>
                    Save Changes
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={closeEditModal}
                    disabled={Boolean(actionLoadingId)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {assignTarget ? (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="combined-booking-assign-title"
              onClick={() => {
                if (!actionLoadingId) closeAssignModal()
              }}
            >
              <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <p className="eyebrow">Booking Driver Request</p>
                    <h2 id="combined-booking-assign-title">Approve & Assign Driver</h2>
                  </div>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={closeAssignModal}
                    disabled={Boolean(actionLoadingId)}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <p className="muted" style={{ marginTop: 0 }}>
                  {isSuperadmin
                    ? 'Super Admin override is active. Unavailable drivers stay labelled but remain selectable.'
                    : 'Choose an available driver to approve this pending booking.'}
                </p>

                {driversError ? <p className="error-text">{driversError}</p> : null}
                {availabilityError ? <p className="error-text">{availabilityError}</p> : null}
                {actionError ? <p className="error-text">{actionError}</p> : null}

                <div className="inline-label">
                  <span>Driver</span>
                  <BookingFormSelect
                    value={selectedDriverId}
                    options={driverOptions}
                    placeholder={
                      driversLoading
                        ? 'Loading drivers...'
                        : availabilityLoading
                          ? 'Checking availability...'
                          : drivers.length
                            ? 'Select driver...'
                            : 'No drivers available'
                    }
                    disabled={driversLoading || availabilityLoading || Boolean(actionLoadingId)}
                    ariaLabel="Select driver"
                    onChange={setSelectedDriverId}
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAssign}
                    disabled={
                      driversLoading ||
                      availabilityLoading ||
                      !selectedDriverId ||
                      (!isSuperadmin && unavailableDriverIds.includes(selectedDriverId)) ||
                      Boolean(actionLoadingId)
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={closeAssignModal}
                    disabled={Boolean(actionLoadingId)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {rangeModalOpen ? (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="driver-range-title"
              onClick={() => {
                if (!loading) closeRangeModal()
              }}
            >
              <div
                className="modal"
                onClick={(event) => {
                  event.stopPropagation()
                }}
              >
                <div className="modal-header">
                  <h2 id="driver-range-title">Load Driver History</h2>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={closeRangeModal}
                    disabled={loading}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <p className="muted" style={{ marginTop: 0 }}>
                  Choose a departure date range to load and export driver history.
                </p>

                {rangeError ? <p className="error-text">{rangeError}</p> : null}

                <div className="radio-row">
                  <span>Date range</span>
                  <div className="radio-options">
                    <label>
                      <input
                        type="radio"
                        name="driver-range-mode"
                        value="all"
                        checked={rangeMode === 'all'}
                        onChange={() => setRangeMode('all')}
                        disabled={loading}
                      />
                      All time
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="driver-range-mode"
                        value="range"
                        checked={rangeMode === 'range'}
                        onChange={() => setRangeMode('range')}
                        disabled={loading}
                      />
                      Custom range
                    </label>
                  </div>
                </div>

                {rangeMode === 'range' ? (
                  <div className="field-grid">
                    <label className="inline-label">
                      <span>Start date</span>
                      <input
                        type="date"
                        value={rangeStart}
                        onChange={(event) => setRangeStart(event.target.value)}
                        disabled={loading}
                        required
                      />
                    </label>
                    <label className="inline-label">
                      <span>End date</span>
                      <input
                        type="date"
                        value={rangeEnd}
                        onChange={(event) => setRangeEnd(event.target.value)}
                        disabled={loading}
                        required
                      />
                    </label>
                  </div>
                ) : null}

                <div className="modal-actions">
                  <button type="button" className="btn btn-primary" onClick={applyRange} disabled={loading}>
                    {loading ? 'Loading...' : 'Load Data'}
                  </button>
                  <button type="button" className="btn btn-outline-danger" onClick={closeRangeModal} disabled={loading}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </MainLayout>
  )
}

export default OfficeDriverHistory

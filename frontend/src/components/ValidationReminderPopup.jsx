import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { useAuth } from '../hooks/useAuth'
import { useLatestRequest } from '../hooks/useLatestRequest'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { emitRealtime } from '../lib/realtime'

function toTimestampMs(value) {
  if (!value) return null
  const date = new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? null : time
}

function formatDateTime(value) {
  const ms = toTimestampMs(value)
  if (ms === null) return '-'
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function reminderSessionKey(booking) {
  return `${booking.id}:${booking.validation_reminder_id || booking.validation_reminder_sent_at || ''}`
}

export default function ValidationReminderPopup() {
  const { user, loading: authLoading, pagePermissions, permissionsLoaded } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const beginLoad = useLatestRequest()

  const [reminders, setReminders] = useState([])
  const [dismissedState, setDismissedState] = useState({ uid: null, keys: [] })
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [validatingId, setValidatingId] = useState('')
  const [actionError, setActionError] = useState('')

  const uid = user?.uid || null
  const role = user?.role || null
  const isEligibleRole = role === 'user' || role === 'office_coordinator' || role === 'superadmin'
  const isPublicRoute = ['/login', '/forgot-password', '/reset-password'].includes(location.pathname)

  const dismissedKeys = useMemo(
    () => (dismissedState.uid === uid ? new Set(dismissedState.keys) : new Set()),
    [dismissedState, uid]
  )

  const loadReminders = useCallback(async () => {
    if (!uid || !isEligibleRole) {
      setReminders([])
      return
    }
    const signal = beginLoad()
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/validation-reminders/my`, {
        credentials: 'include',
        signal,
      })
      if (!response.ok || signal.aborted) return
      const data = await response.json()
      if (signal.aborted) return
      setNowMs(Date.now())
      setReminders(Array.isArray(data) ? data : [])
    } catch {
      // Silent background check; do not block normal navigation.
    }
  }, [uid, isEligibleRole, beginLoad])

  useEffect(() => {
    if (authLoading || !uid || !isEligibleRole) return
    void loadReminders()
  }, [authLoading, uid, isEligibleRole, loadReminders])

  useRealtimeRefresh(['bookings'], () => {
    if (uid && isEligibleRole) void loadReminders()
  })

  const visibleReminders = useMemo(() => {
    if (!uid || !isEligibleRole) return []
    return reminders.filter((booking) => {
      if (!booking?.id || booking.status !== 'awaiting_validation') return false
      const expiresMs = toTimestampMs(booking.validation_reminder_expires_at)
      if (expiresMs === null || expiresMs <= nowMs) return false
      return !dismissedKeys.has(reminderSessionKey(booking))
    })
  }, [reminders, uid, isEligibleRole, nowMs, dismissedKeys])

  // Automatically drop reminders as soon as their expiry timestamp is reached.
  useEffect(() => {
    if (!visibleReminders.length) return undefined
    const nextExpiryMs = visibleReminders.reduce((earliest, booking) => {
      const expiresMs = toTimestampMs(booking.validation_reminder_expires_at)
      if (expiresMs === null) return earliest
      return earliest === null ? expiresMs : Math.min(earliest, expiresMs)
    }, null)
    if (nextExpiryMs === null) return undefined
    const delay = Math.max(0, Math.min(nextExpiryMs - Date.now() + 50, 2147483647))
    const timer = window.setTimeout(() => setNowMs(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [visibleReminders])

  const dismissCurrent = useCallback(() => {
    if (!uid || !visibleReminders.length) return
    setActionError('')
    setDismissedState((current) => {
      const existing = current.uid === uid ? current.keys : []
      const merged = new Set([...existing, ...visibleReminders.map(reminderSessionKey)])
      return { uid, keys: [...merged] }
    })
  }, [uid, visibleReminders])

  useEffect(() => {
    if (!visibleReminders.length || isPublicRoute) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !validatingId) {
        event.preventDefault()
        dismissCurrent()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visibleReminders.length, isPublicRoute, validatingId, dismissCurrent])

  const hasHistoryPermission = useMemo(() => {
    if (role === 'superadmin') return true
    if (!permissionsLoaded) return false
    return pagePermissions.some((item) => item.page_id === 'page_booking_history' && item.enabled === true)
  }, [role, permissionsLoaded, pagePermissions])

  const historyPath = role === 'user' ? '/user/booking-history' : '/office/driver-history'

  const handleOpenHistory = () => {
    dismissCurrent()
    if (location.pathname !== historyPath) {
      navigate(historyPath)
    }
  }

  const handleValidateNow = async (booking) => {
    if (!booking?.id || validatingId) return
    setValidatingId(booking.id)
    setActionError('')
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/${booking.id}/validate-completion`, {
        method: 'PATCH',
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setActionError(data?.detail || 'Failed to validate trip completion.')
        return
      }
      setReminders((current) => current.filter((item) => item.id !== booking.id))
      emitRealtime(['bookings'])
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setValidatingId('')
    }
  }

  if (authLoading || !uid || !isEligibleRole || isPublicRoute || visibleReminders.length === 0) {
    return null
  }

  return createPortal(
    <div
      className="modal-overlay validation-reminder-popup-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="validation-reminder-popup-title"
      onClick={() => {
        if (!validatingId) dismissCurrent()
      }}
    >
      <div
        className="modal validation-reminder-popup"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Action Required</p>
            <h2 id="validation-reminder-popup-title">Please Validate Completed Trip{visibleReminders.length > 1 ? 's' : ''}</h2>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={dismissCurrent}
            disabled={Boolean(validatingId)}
            aria-label="Close reminder"
          >
            &times;
          </button>
        </div>

        <div className="admin-settings__preview validation-reminder-popup__banner">
          <i className="bi bi-exclamation-circle" aria-hidden="true" />
          <span>
            You have <strong>{visibleReminders.length}</strong> completed driver booking{visibleReminders.length > 1 ? 's' : ''} with status{' '}
            <strong>Awaiting Validation</strong>. Please validate completion so the trip record can be finalized.
          </span>
        </div>

        {actionError ? <p className="error-text" role="alert">{actionError}</p> : null}

        <div className="validation-reminder-popup__list">
          {visibleReminders.map((booking) => {
            const hasMileage = booking.starting_mileage != null && booking.ending_mileage != null
            const distance = hasMileage ? Number(booking.ending_mileage) - Number(booking.starting_mileage) : null
            const canValidateItem = hasHistoryPermission && (role === 'superadmin' || booking.user_id === uid)
            return (
              <article key={booking.id} className="validation-reminder-card">
                <div className="validation-reminder-card__header">
                  <strong>{booking.request_id || 'Driver Booking'}</strong>
                  <span className="status-badge status-awaiting_validation">Awaiting Validation</span>
                </div>
                <dl className="validation-reminder-card__meta">
                  <div>
                    <dt>Driver</dt>
                    <dd>{booking.driver_name || '-'}</dd>
                  </div>
                  <div>
                    <dt>Departure</dt>
                    <dd>{formatDateTime(booking.departure_time)}</dd>
                  </div>
                  <div>
                    <dt>Route</dt>
                    <dd>{booking.pickup_location || '-'} &rarr; {booking.destination || '-'}</dd>
                  </div>
                  <div>
                    <dt>Trip Mileage</dt>
                    <dd>
                      {hasMileage && Number.isFinite(distance) && distance >= 0
                        ? `${booking.starting_mileage} → ${booking.ending_mileage} km (${distance} km)`
                        : '-'}
                    </dd>
                  </div>
                </dl>
                {canValidateItem ? (
                  <div className="validation-reminder-card__actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={Boolean(validatingId)}
                      onClick={() => handleValidateNow(booking)}
                    >
                      <i className="bi bi-person-check" aria-hidden="true" />
                      {validatingId === booking.id ? 'Validating...' : 'Validate Now'}
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>

        <div className="modal-actions">
          {hasHistoryPermission && location.pathname !== historyPath ? (
            <button
              type="button"
              className="btn btn-outline-brand"
              disabled={Boolean(validatingId)}
              onClick={handleOpenHistory}
            >
              <i className="bi bi-clock-history" aria-hidden="true" />
              Open Booking History
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-neutral"
            disabled={Boolean(validatingId)}
            onClick={dismissCurrent}
          >
            Later
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}


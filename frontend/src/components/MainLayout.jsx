import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL, APP_NAME } from '../config'

// Shared page shell with header, notifications, and logout.
function MainLayout({ title, children }) {
  const navigate = useNavigate()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState('')
  const notificationsContainerRef = useRef(null)

  // Keep the browser tab title in sync with the current page.
  useEffect(() => {
    const trimmedTitle = typeof title === 'string' ? title.trim() : ''
    document.title = trimmedTitle ? `${trimmedTitle} | ${APP_NAME}` : APP_NAME
  }, [title])

  const unreadCount = useMemo(
    () => notifications.reduce((count, item) => (item?.read ? count : count + 1), 0),
    [notifications]
  )

  // Format API timestamps into a readable local date/time string.
  const formatTimestamp = (value) => {
    if (!value) return ''
    const dateValue = value?.seconds ? new Date(value.seconds * 1000) : new Date(value)
    if (Number.isNaN(dateValue.getTime())) return ''
    return dateValue.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Fetch latest notifications for the current user.
  const fetchNotifications = async () => {
    const token = localStorage.getItem('authToken')
    if (!token) return

    setNotificationsLoading(true)
    setNotificationsError('')
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/my?limit=25`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        let detail = 'Failed to load notifications.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setNotificationsError(detail)
        setNotifications([])
        return
      }
      const data = await res.json()
      setNotifications(Array.isArray(data) ? data : [])
    } catch {
      setNotificationsError('Network error. Please try again.')
      setNotifications([])
    } finally {
      setNotificationsLoading(false)
    }
  }

  // Mark all notifications as read on the server and in local state.
  const markAllNotificationsRead = async () => {
    const token = localStorage.getItem('authToken')
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/mark-all-read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
    } catch {
      // ignore
    }
  }

  // Poll notifications and listen for manual refresh events.
  useEffect(() => {
    fetchNotifications()

    const intervalId = window.setInterval(() => {
      fetchNotifications()
    }, 30000)

    // Allow other pages to request a refresh without prop-drilling.
    const handleRefresh = () => {
      fetchNotifications()
    }

    window.addEventListener('notifications:refresh', handleRefresh)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('notifications:refresh', handleRefresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close the notifications dropdown on outside click or Escape.
  useEffect(() => {
    if (!notificationsOpen) return

    // Close dropdown when the click/tap happens outside the container.
    const handlePointerDown = (event) => {
      const container = notificationsContainerRef.current
      if (!container) return
      if (container.contains(event.target)) return
      setNotificationsOpen(false)
    }

    // Close dropdown on Escape for better keyboard UX.
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [notificationsOpen])

  // Sign out and return to the login page.
  const handleLogout = async () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('authRole')

    navigate('/login', { replace: true })
  }

  return (
    <div className="layout">
      <header className="navbar">
        <div className="navbar__brand">
          <span className="navbar__title">{APP_NAME}</span>
        </div>
        <div className="navbar__actions">
          <div className="navbar-notifications" ref={notificationsContainerRef}>
            <button
              type="button"
              className="navbar-icon-button"
              aria-label={unreadCount ? `Notifications (${unreadCount} new)` : 'Notifications'}
              title={unreadCount ? `Notifications (${unreadCount} new)` : 'Notifications'}
              onClick={async () => {
                const nextOpen = !notificationsOpen
                setNotificationsOpen(nextOpen)
                if (!nextOpen) return
                await markAllNotificationsRead()
                await fetchNotifications()
              }}
            >
              <i className="bi bi-bell" aria-hidden="true" />
              {unreadCount ? <span className="navbar-notification-dot" aria-hidden="true" /> : null}
            </button>

            {notificationsOpen ? (
              <div className="notifications-dropdown" role="menu" aria-label="Notifications">
                <div className="notifications-dropdown__header">
                  <span>Notifications</span>
                  <button type="button" className="notifications-refresh" onClick={fetchNotifications} disabled={notificationsLoading}>
                    {notificationsLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                {notificationsError ? <p className="error-text">{notificationsError}</p> : null}

                <div className="notifications-dropdown__body">
                  {!notificationsLoading && !notificationsError && notifications.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((item) => (
                      <div key={item.id} className={`notification-item ${item.read ? 'is-read' : 'is-unread'}`}>
                        <p className="notification-item__message">{item.message}</p>
                        {item.created_at ? <p className="notification-item__meta">{formatTimestamp(item.created_at)}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="layout__content">
        {children ? children : <div className="content-placeholder" />}
      </main>
    </div>
  )
}

export default MainLayout

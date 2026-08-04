import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { API_BASE_URL, APP_NAME } from '../config'

const userNavSections = [
  {
    id: 'request',
    label: 'Request',
    icon: 'bi-send',
    items: [
      { label: 'Submit Travel Request', path: '/user/ticket-request', icon: 'bi-ticket-perforated' },
      { label: 'Booking Driver', path: '/user/booking-driver', icon: 'bi-car-front' },
    ],
  },
  {
    id: 'history',
    label: 'Status & History',
    icon: 'bi-clock-history',
    items: [
      { label: 'Travel Status & History', path: '/user/ticket-history', icon: 'bi-card-checklist' },
      { label: 'Booking Driver Status & History', path: '/user/booking-history', icon: 'bi-car-front-fill' },
    ],
  },
]

const officeNavSections = [
  {
    id: 'assign',
    label: 'Assign',
    icon: 'bi-person-check',
    items: [
      { label: 'Travel Assign', path: '/office/travel-accommodation', icon: 'bi-luggage' },
      { label: 'Booking Driver Assign', path: '/office/assign-drivers', icon: 'bi-car-front-fill' },
    ],
  },
  {
    id: 'office-history',
    label: 'Status & History',
    icon: 'bi-clock-history',
    items: [
      { label: 'Travel Status & History', path: '/office/ticket-history', icon: 'bi-card-checklist' },
      { label: 'Booking Driver Status & History', path: '/office/driver-history', icon: 'bi-journal-check' },
    ],
  },
]

const adminSettingsSection = {
  id: 'settings',
  label: 'Settings',
  icon: 'bi-gear',
  items: [
    { label: 'Cancel Booking Driver', path: '/admin/settings/cancel-booking', icon: 'bi-calendar-x' },
    { label: 'Driver Availability', path: '/admin/settings/driver-availability', icon: 'bi-person-check' },
  ],
}

// Shared page shell with header, notifications, and logout.
function MainLayout({ title, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 768px)').matches
  })
  const [openNavGroups, setOpenNavGroups] = useState({
    request: true,
    history: true,
    requests: true,
    assign: true,
    'office-history': true,
    settings: true,
  })
  const notificationsContainerRef = useRef(null)

  const role = localStorage.getItem('authRole')
  const showSideNav = ['/user/', '/driver/', '/office/', '/admin/'].some((prefix) => location.pathname.startsWith(prefix))
  const isEmployee = role === 'user' || location.pathname.startsWith('/user/')
  const isDriver = role === 'driver' || location.pathname.startsWith('/driver/')
  const isSuperadmin = role === 'superadmin' || location.pathname.startsWith('/admin/')
  const baseNavSections = isEmployee ? userNavSections : officeNavSections
  const navSections = isSuperadmin ? [...baseNavSections, adminSettingsSection] : baseNavSections
  const homeItem = isEmployee
    ? { label: 'Quick View', path: '/user/home', icon: 'bi-speedometer2' }
    : isDriver
      ? { label: 'Driver Tasks', path: '/driver/home', icon: 'bi-card-checklist' }
      : { label: 'Quick View', path: isSuperadmin ? '/admin/home' : '/office/home', icon: 'bi-speedometer2' }
  const directItems = !isEmployee && !isDriver
    ? [{ label: 'Manage User', path: isSuperadmin ? '/admin/manage-user' : '/office/manage-user', icon: 'bi-people' }]
    : []

  // Keep the browser tab title in sync with the current page.
  useEffect(() => {
    const trimmedTitle = typeof title === 'string' ? title.trim() : ''
    document.title = trimmedTitle ? `${trimmedTitle} | ${APP_NAME}` : APP_NAME
  }, [title])

  const unreadCount = useMemo(
    () => notifications.reduce((count, item) => (item?.read ? count : count + 1), 0),
    [notifications]
  )

  useEffect(() => {
    if (!showSideNav) return

    if (location.pathname === '/user/ticket-request' || location.pathname === '/user/booking-driver') {
      setOpenNavGroups((prev) => ({ ...prev, request: true }))
    }

    if (location.pathname === '/user/ticket-history' || location.pathname === '/user/booking-history') {
      setOpenNavGroups((prev) => ({ ...prev, history: true }))
    }
  }, [location.pathname, showSideNav])

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

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev)
  }

  const toggleNavGroup = (groupId) => {
    if (isSidebarCollapsed) {
      setIsSidebarCollapsed(false)
      setOpenNavGroups((prev) => ({
        ...prev,
        [groupId]: true,
      }))
      return
    }

    setOpenNavGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }

  const handleSideNavNavigate = (path) => {
    navigate(path)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      setIsSidebarCollapsed(true)
    }
  }

  const renderSideNav = () => (
    <aside className="app-sidebar" aria-label="Main menu">
      <div className="app-sidebar__header">
        <div className="app-sidebar__identity">
          <div className="app-sidebar__brand">
            <span className="app-sidebar__brand-title">Navigation Menu</span>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? 'Open side navigation' : 'Close side navigation'}
          title={isSidebarCollapsed ? 'Open side navigation' : 'Close side navigation'}
        >
          <i className="bi bi-list" aria-hidden="true" />
        </button>
      </div>

      <nav className="app-sidebar__nav">
        <button
          type="button"
          className={`side-nav-link ${location.pathname === homeItem.path ? 'is-active' : ''}`}
          onClick={() => handleSideNavNavigate(homeItem.path)}
          aria-current={location.pathname === homeItem.path ? 'page' : undefined}
          title={homeItem.label}
        >
          <i className={`bi ${homeItem.icon} side-nav-link__icon`} aria-hidden="true" />
          <span className="side-nav-link__label">{homeItem.label}</span>
        </button>

        {!isDriver ? navSections.map((section) => {
          const isOpen = openNavGroups[section.id]
          const isSectionActive = section.items.some((item) => item.path === location.pathname)

          return (
            <div className="side-nav-section" key={section.id}>
              <button
                type="button"
                className={`side-nav-parent ${isSectionActive ? 'is-active' : ''}`}
                onClick={() => toggleNavGroup(section.id)}
                aria-expanded={isOpen}
                title={section.label}
              >
                <i className={`bi ${section.icon} side-nav-link__icon`} aria-hidden="true" />
                <span className="side-nav-link__label">{section.label}</span>
                <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'} side-nav-parent__chevron`} aria-hidden="true" />
              </button>

              {isOpen ? (
                <div className="side-nav-submenu">
                  {section.items.map((item) => {
                    const isActive = item.path === location.pathname

                    return (
                      <button
                        type="button"
                        className={`side-nav-subitem ${isActive ? 'is-active' : ''}`}
                        key={item.path}
                        onClick={() => handleSideNavNavigate(item.path)}
                        aria-current={isActive ? 'page' : undefined}
                        title={item.label}
                      >
                        <i className={`bi ${item.icon} side-nav-subitem__icon`} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        }) : null}

        {directItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <button
              type="button"
              className={`side-nav-link ${isActive ? 'is-active' : ''}`}
              key={item.path}
              onClick={() => handleSideNavNavigate(item.path)}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
            >
              <i className={`bi ${item.icon} side-nav-link__icon`} aria-hidden="true" />
              <span className="side-nav-link__label">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )

  return (
    <div className={`layout ${showSideNav ? 'layout--with-side-nav' : ''} ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      {showSideNav ? renderSideNav() : null}

      <div className="layout__main">
        <header className="navbar">
          <div className="navbar__brand">
            {showSideNav ? (
              <button
                type="button"
                className="navbar-menu-toggle"
                onClick={toggleSidebar}
                aria-label={isSidebarCollapsed ? 'Open side navigation' : 'Close side navigation'}
                title={isSidebarCollapsed ? 'Open side navigation' : 'Close side navigation'}
              >
                <i className="bi bi-list" aria-hidden="true" />
              </button>
            ) : null}
            <img className="navbar__logo" src="/app-logo-blue.png" alt={APP_NAME} />
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
    </div>
  )
}

export default MainLayout

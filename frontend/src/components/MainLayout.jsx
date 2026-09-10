
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { API_BASE_URL, APP_NAME } from '../config'
import { useAuth } from '../hooks/useAuth'

const userNavSections = [
  {
    id: 'request',
    label: 'Request',
    icon: 'bi-send',
    items: [
      {
        label: 'Submit Travel Request',
        path: '/user/ticket-request',
         pageId: 'page_ticket_request',
        icon: 'bi-ticket-perforated',
      },
      {
        label: 'Booking Driver',
        path: '/user/booking-driver',
        pageId: 'page_booking_driver',
        icon: 'bi-car-front',
      },
    ],
  },
  {
    id: 'history',
    label: 'Status & History',
    icon: 'bi-clock-history',
    items: [
      {
        label: 'Travel Status & History',
        path: '/user/ticket-history',
         pageId: 'page_ticket_history',
        icon: 'bi-card-checklist',
      },
      {
        label: 'Booking Driver Status & History',
        path: '/user/booking-history',
         pageId: 'page_booking_history',
        icon: 'bi-car-front-fill',
      },
    ],
  },
]

const officeNavSections = [
  {
    id: 'assign',
    label: 'Assign',
    icon: 'bi-person-check',
    items: [
      {
        label: 'Travel Assign',
        path: '/office/travel-accommodation',
        icon: 'bi-luggage',
      },
      {
        label: 'Booking Driver Assign',
        path: '/office/assign-drivers',
        icon: 'bi-car-front-fill',
      },
    ],
  },
  {
    id: 'office-history',
    label: 'Status & History',
    icon: 'bi-clock-history',
    items: [
      {
        label: 'Travel Status & History',
        path: '/office/ticket-history',
        icon: 'bi-card-checklist',
      },
      {
        label: 'Booking Driver Status & History',
        path: '/office/driver-history',
        icon: 'bi-journal-check',
      },
    ],
  },
]

const adminSettingsSection = {
  id: 'settings',
  label: 'Settings',
  icon: 'bi-gear',
  items: [
    {
      label: 'Cancel Booking Driver',
      path: '/admin/settings/cancel-booking',
      icon: 'bi-calendar-x',
    },
    {
      label: 'Driver Availability',
      path: '/admin/settings/driver-availability',
      icon: 'bi-person-check',
    },
    {
      label: 'Page Permissions',
      path: '/admin/settings/page-permissions',
      icon: 'bi-arrow-through-heart',
    },
  ],
}

const accountSettingsSection = {
  id: 'account-settings',
  label: 'Account',
  icon: 'bi-person-gear',
  items: [
    {
      label: 'Reset Password',
      path: '/reset-password',
      icon: 'bi-key',
    },
  ],
}

function MainLayout({ title, children }) {
  const navigate = useNavigate()
  const location = useLocation()

  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState('')
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const { logout, user, pagePermissions,
  permissionsLoading,
  permissionsLoaded, } = useAuth()

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false

    return window.matchMedia('(max-width: 768px)').matches
  })
const getUserNavSections = () => {
  if (!permissionsLoaded) {
    return []
  }

  return userNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        hasPagePermission(item.pageId)
      ),
    }))
    .filter(
      (section) => section.items.length > 0
    )
}
  const [openNavGroups, setOpenNavGroups] = useState({
    request: true,
    history: true,
    requests: true,
    assign: true,
    'office-history': true,
    settings: true,
    'account-settings': true,
  })

  

  

  const notificationsContainerRef = useRef(null)

  const role = user?.role

  const showSideNav =
    ['/user/', '/driver/', '/office/', '/admin/'].some((prefix) =>
      location.pathname.startsWith(prefix)
    ) ||
    location.pathname === '/reset-password'

  const isEmployee = role === 'user'
  const isDriver = role === 'driver'
  const isSuperadmin = role === 'superadmin'


 const hasPagePermission = (pageId) => {
  const permission = pagePermissions.find(
    (item) => item.page_id === pageId
  )

  return permission?.enabled === true
}


  const filteredUserNavSections = useMemo(() => {
    
    if (!isEmployee) {
      return userNavSections
    }

    if (!permissionsLoaded) {
      return []
    }

    return userNavSections
      .map((section) => ({
        ...section,

        items: section.items.filter((item) =>
          hasPagePermission(item.path)
        ),
      }))
      
      .filter((section) => section.items.length > 0)
  }, [
    isEmployee,
    permissionsLoaded,
    pagePermissions,
  ])


  let navSections = []

  if (isEmployee) {
    navSections = [
      ...getUserNavSections(),
      accountSettingsSection,
    ]
  } else if (isDriver) {
    navSections = [
      accountSettingsSection,
    ]
  } else if (isSuperadmin) {
    navSections = [
      ...officeNavSections,
      adminSettingsSection,
    ]
  } else {
    navSections = [
      ...officeNavSections,
    ]
  }


  const homeItem = isEmployee
    ? {
        label: 'Quick View',
        path: '/user/home',
        icon: 'bi-speedometer2',
      }
    : isDriver
      ? {
          label: 'Driver Tasks',
          path: '/driver/home',
          icon: 'bi-card-checklist',
        }
      : {
          label: 'Quick View',
          path: isSuperadmin
            ? '/admin/home'
            : '/office/home',
          icon: 'bi-speedometer2',
        }

  const directItems =
    !isEmployee && !isDriver
      ? [
          {
            label: 'Manage User',
            path: isSuperadmin
              ? '/admin/manage-user'
              : '/office/manage-user',
            icon: 'bi-people',
          },
        ]
      : []


  useEffect(() => {
    const trimmedTitle =
      typeof title === 'string'
        ? title.trim()
        : ''

    document.title = trimmedTitle
      ? `${trimmedTitle} | ${APP_NAME}`
      : APP_NAME
  }, [title])
 

  const unreadCount = useMemo(
    () =>
      notifications.reduce(
        (count, item) =>
          item?.read
            ? count
            : count + 1,
        0
      ),
    [notifications]
  )

  const fetchNotifications = async () => {
    setNotificationsLoading(true)
    setNotificationsError('')

    try {
      const res = await fetch(
        `${API_BASE_URL}/notifications/my?limit=25`,
        {
          credentials: 'include',
        }
      )

      if (!res.ok) {
        let detail =
          'Failed to load notifications.'

        try {
          const data = await res.json()

          if (data?.detail) {
            detail = data.detail
          }
        } catch {
          // Ignore parse error.
        }

        setNotificationsError(detail)
        setNotifications([])

        return
      }

      const data = await res.json()

      setNotifications(
        Array.isArray(data)
          ? data
          : []
      )
    } catch {
      setNotificationsError(
        'Network error. Please try again.'
      )

      setNotifications([])
    } finally {
      setNotificationsLoading(false)
    }
  }

  const markAllNotificationsRead = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/notifications/mark-all-read`,
        {
          method: 'PATCH',
          credentials: 'include',
        }
      )

      if (!res.ok) return

      setNotifications((prev) =>
        prev.map((item) => ({
          ...item,
          read: true,
        }))
      )
    } catch {
      // Ignore notification errors.
    }
  }

 
  useEffect(() => {
    fetchNotifications()

    const intervalId =
      window.setInterval(() => {
        fetchNotifications()
      }, 30000)

    const handleRefresh = () => {
      fetchNotifications()
    }

    window.addEventListener(
      'notifications:refresh',
      handleRefresh
    )

    return () => {
      window.clearInterval(intervalId)

      window.removeEventListener(
        'notifications:refresh',
        handleRefresh
      )
    }
  }, [])

  useEffect(() => {
    if (!notificationsOpen) return

    const handlePointerDown = (event) => {
      const container =
        notificationsContainerRef.current

      if (!container) return

      if (container.contains(event.target)) {
        return
      }

      setNotificationsOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener(
      'pointerdown',
      handlePointerDown
    )

    document.addEventListener(
      'keydown',
      handleKeyDown
    )

    return () => {
      document.removeEventListener(
        'pointerdown',
        handlePointerDown
      )

      document.removeEventListener(
        'keydown',
        handleKeyDown
      )
    }
  }, [notificationsOpen])

  const handleLogout = async () => {
    await logout()

    navigate('/login', {
      replace: true,
    })
  }

  const toggleSidebar = () => {
    setIsSidebarCollapsed(
      (prev) => !prev
    )
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

    if (
      typeof window !== 'undefined' &&
      window.matchMedia(
        '(max-width: 768px)'
      ).matches
    ) {
      setIsSidebarCollapsed(true)
    }
  }

  useEffect(() => {
    if (!showSideNav) return

    if (
      location.pathname ===
        '/user/ticket-request' ||
      location.pathname ===
        '/user/booking-driver'
    ) {
      setOpenNavGroups((prev) => ({
        ...prev,
        request: true,
      }))
    }

    if (
      location.pathname ===
        '/user/ticket-history' ||
      location.pathname ===
        '/user/booking-history'
    ) {
      setOpenNavGroups((prev) => ({
        ...prev,
        history: true,
      }))
    }
  }, [
    location.pathname,
    showSideNav,
  ])

  const renderSideNav = () => (
    <aside
      className="app-sidebar"
      aria-label="Main menu"
    >
      <div className="app-sidebar__header">
        <div className="app-sidebar__identity">
          <div className="app-sidebar__brand">
            <span className="app-sidebar__brand-title">
              Navigation Menu
            </span>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={
            isSidebarCollapsed
              ? 'Open side navigation'
              : 'Close side navigation'
          }
          title={
            isSidebarCollapsed
              ? 'Open side navigation'
              : 'Close side navigation'
          }
        >
          <i
            className="bi bi-list"
            aria-hidden="true"
          />
        </button>
      </div>

      <nav className="app-sidebar__nav">
        {/* HOME */}
        <button
          type="button"
          className={`side-nav-link ${
            location.pathname === homeItem.path
              ? 'is-active'
              : ''
          }`}
          onClick={() =>
            handleSideNavNavigate(
              homeItem.path
            )
          }
          aria-current={
            location.pathname ===
            homeItem.path
              ? 'page'
              : undefined
          }
          title={homeItem.label}
        >
          <i
            className={`bi ${homeItem.icon} side-nav-link__icon`}
            aria-hidden="true"
          />

          <span className="side-nav-link__label">
            {homeItem.label}
          </span>
        </button>

        {/* GROUPED NAVIGATION */}
        {navSections.map((section) => {
          const isOpen =
            openNavGroups[section.id]

          const isSectionActive =
            section.items.some(
              (item) =>
                item.path ===
                location.pathname
            )

          return (
            <div
              className="side-nav-section"
              key={section.id}
            >
              <button
                type="button"
                className={`side-nav-parent ${
                  isSectionActive
                    ? 'is-active'
                    : ''
                }`}
                onClick={() =>
                  toggleNavGroup(
                    section.id
                  )
                }
                aria-expanded={isOpen}
                title={section.label}
              >
                <i
                  className={`bi ${section.icon} side-nav-link__icon`}
                  aria-hidden="true"
                />

                <span className="side-nav-link__label">
                  {section.label}
                </span>

                <i
                  className={`bi ${
                    isOpen
                      ? 'bi-chevron-up'
                      : 'bi-chevron-down'
                  } side-nav-parent__chevron`}
                  aria-hidden="true"
                />
              </button>

              {isOpen ? (
                <div className="side-nav-submenu">
                  {section.items.map(
                    (item) => {
                      const isActive =
                        item.path ===
                        location.pathname

                      return (
                        <button
                          type="button"
                          className={`side-nav-subitem ${
                            isActive
                              ? 'is-active'
                              : ''
                          }`}
                          key={item.path}
                          onClick={() =>
                            handleSideNavNavigate(
                              item.path
                            )
                          }
                          aria-current={
                            isActive
                              ? 'page'
                              : undefined
                          }
                          title={item.label}
                        >
                          <i
                            className={`bi ${item.icon} side-nav-subitem__icon`}
                            aria-hidden="true"
                          />

                          <span>
                            {item.label}
                          </span>
                        </button>
                      )
                    }
                  )}
                </div>
              ) : null}
            </div>
          )
        })}

        {/* DIRECT ITEMS */}
        {directItems.map((item) => {
          const isActive =
            location.pathname ===
            item.path

          return (
            <button
              type="button"
              className={`side-nav-link ${
                isActive
                  ? 'is-active'
                  : ''
              }`}
              key={item.path}
              onClick={() =>
                handleSideNavNavigate(
                  item.path
                )
              }
              aria-current={
                isActive
                  ? 'page'
                  : undefined
              }
              title={item.label}
            >
              <i
                className={`bi ${item.icon} side-nav-link__icon`}
                aria-hidden="true"
              />

              <span className="side-nav-link__label">
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* SIDEBAR USER */}
      <div className="app-sidebar__user">
       
      </div>
    </aside>
  )


  return (
    <div
      className={`layout ${
        showSideNav
          ? 'layout--with-side-nav'
          : ''
      } ${
        isSidebarCollapsed
          ? 'is-sidebar-collapsed'
          : ''
      }`}
    >
      {showSideNav
        ? renderSideNav()
        : null}

      <div className="layout__main">
        {/* NAVBAR */}
      <header className="navbar">
  <div className="navbar__brand">
    {showSideNav ? (
      <button
        type="button"
        className="navbar-menu-toggle"
        onClick={toggleSidebar}
        aria-label={
          isSidebarCollapsed
            ? 'Open side navigation'
            : 'Close side navigation'
        }
        title={
          isSidebarCollapsed
            ? 'Open side navigation'
            : 'Close side navigation'
        }
      >
        <i
          className="bi bi-list"
          aria-hidden="true"
        />
      </button>
    ) : null}

    <img
      className="navbar__logo"
      src="/app-logo-blue.png"
      alt={APP_NAME}
    />

    <span className="navbar__title">
      {APP_NAME}
    </span>
  </div>

  <div className="navbar__actions">
    {/* 1. NOTIFICATIONS (Moved to the left of User menu) */}
    <div
      className="navbar-notifications"
      ref={
        notificationsContainerRef
      }
    >
      <button
        type="button"
        className="navbar-icon-button"
        aria-label={
          unreadCount
            ? `Notifications (${unreadCount} new)`
            : 'Notifications'
        }
        title={
          unreadCount
            ? `Notifications (${unreadCount} new)`
            : 'Notifications'
        }
        onClick={async () => {
          const nextOpen =
            !notificationsOpen

          setNotificationsOpen(
            nextOpen
          )

          if (!nextOpen) return

          await markAllNotificationsRead()
          await fetchNotifications()
        }}
      >
        <i
          className="bi bi-bell"
          aria-hidden="true"
        />

        {unreadCount ? (
          <span
            className="navbar-notification-dot"
            aria-hidden="true"
          />
        ) : null}
      </button>

      {notificationsOpen ? (
        <div
          className="notifications-dropdown"
          role="menu"
          aria-label="Notifications"
        >
          <div className="notifications-dropdown__header">
            <span>
              Notifications
            </span>

            <button
              type="button"
              className="notifications-refresh"
              onClick={
                fetchNotifications
              }
              disabled={
                notificationsLoading
              }
            >
              {notificationsLoading
                ? 'Loading...'
                : 'Refresh'}
            </button>
          </div>

          {notificationsError ? (
            <p className="error-text">
              {notificationsError}
            </p>
          ) : null}

          <div className="notifications-dropdown__body">
            {!notificationsLoading &&
            !notificationsError &&
            notifications.length ===
              0 ? (
              <p
                className="muted"
                style={{
                  margin: 0,
                }}
              >
                No notifications
                yet.
              </p>
            ) : (
              notifications.map(
                (item) => (
                  <div
                    key={item.id}
                    className={`notification-item ${
                      item.read
                        ? 'is-read'
                        : 'is-unread'
                    }`}
                  >
                    <p className="notification-item__message">
                      {item.message}
                    </p>

                    {item.created_at ? (
                      <p className="notification-item__meta">
                        {formatTimestamp(
                          item.created_at
                        )}
                      </p>
                    ) : null}
                  </div>
                )
              )
            )}
          </div>
        </div>
      ) : null}
    </div>

    {/* 2. USER MENU DROPDOWN (Far right) */}
    <div className="navbar-user-dropdown">
      <button
        type="button"
        className="navbar-user-button"
        onClick={() => setUserDropdownOpen((prev) => !prev)}
        aria-expanded={userDropdownOpen}
      >
        <div className="navbar-user__avatar">
          <i
            className="bi bi-person-fill"
            aria-hidden="true"
          />
        </div>

        <div className="navbar-user__info">
          <span className="navbar-user__name">
            {user?.name ||
              user?.full_name ||
              'User'}
          </span>

          <span className="navbar-user__role">
            {user?.role ||
              'Unknown role'}
          </span>
        </div>
      </button>

      {/* DROPDOWN MENU */}
      {userDropdownOpen ? (
        <div className="user-dropdown-menu" role="menu">
          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            <i className="bi bi-box-arrow-right" aria-hidden="true" />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  </div>
</header>

        {/* PAGE CONTENT */}
        <main className="layout__content">
          {children ? (
            children
          ) : (
            <div className="content-placeholder" />
          )}
        </main>
      </div>
    </div>
  )
}

function formatTimestamp(value) {
  if (!value) return ''

  const dateValue = value?.seconds
    ? new Date(
        value.seconds * 1000
      )
    : new Date(value)

  if (
    Number.isNaN(
      dateValue.getTime()
    )
  ) {
    return ''
  }

  return dateValue.toLocaleString(
    undefined,
    {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }
  )
}

export default MainLayout


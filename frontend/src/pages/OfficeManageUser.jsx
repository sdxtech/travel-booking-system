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

const initialCreate = {
  name: '',
  dept_job_position: '',
  role: 'user',
  nik: '',
  phone: '',
  email: '',
  password: '',
}

// User management page for office coordinators.
function OfficeManageUser() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const isSuperadmin = localStorage.getItem('authRole') === 'superadmin'
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [page, setPage] = useState(1)

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(initialCreate)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState(null)

  const [selectedUser, setSelectedUser] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  const [successModal, setSuccessModal] = useState(null)

  const [passwordModalUser, setPasswordModalUser] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedUsers = users.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Keep page index within bounds when the list size changes.
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const token = localStorage.getItem('authToken')

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

  // Fetch user profiles from the API.
  const loadUsers = async () => {
    if (!token) {
      setLoading(false)
      setError('Authentication token not found.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        let detail = 'Failed to load users.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setError(detail)
        setUsers([])
      } else {
        const data = await res.json()
        setUsers(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      setError('Network error. Please try again.')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  // Initial data fetch.
  useEffect(() => {
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update create form fields.
  const handleCreateChange = (field) => (event) => {
    setCreateForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  // Update edit form fields.
  const handleEditChange = (field) => (event) => {
    setEditForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  // Open the import modal and reset state.
  const openImportModal = () => {
    setImportModalOpen(true)
    setImportFile(null)
    setImportLoading(false)
    setImportError('')
    setImportResult(null)
  }

  // Close the import modal unless an import is in progress.
  const closeImportModal = () => {
    if (importLoading) return
    setImportModalOpen(false)
    setImportError('')
  }

  // Store the selected import file and clear errors/result.
  const handleImportFileChange = (event) => {
    const file = event.target.files?.[0] ?? null
    setImportFile(file)
    setImportError('')
    setImportResult(null)
  }

  // Read a file into base64 for API upload.
  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        const base64 = result.split(',')[1] || ''
        resolve(base64)
      }
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })

  // Download the server-provided import template (.xlsx).
  const downloadImportTemplate = async () => {
    setImportError('')
    try {
      const res = await fetch(`${API_BASE_URL}/users/import/template`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      if (!res.ok) {
        const message = (await res.text()) || 'Failed to download template.'
        setImportError(message)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = 'user_import_template.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setImportError('Failed to download template.')
    }
  }

  // Upload and import users from the selected CSV/XLSX file.
  const handleImportUsers = async () => {
    if (!token) {
      setImportError('Authentication token not found.')
      return
    }

    if (!importFile) {
      setImportError('Please choose a file (.xlsx or .csv).')
      return
    }

    setImportLoading(true)
    setImportError('')
    setImportResult(null)

    try {
      const fileBase64 = await readFileAsBase64(importFile)
      const res = await fetch(`${API_BASE_URL}/users/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: importFile.name,
          file_base64: fileBase64,
        }),
      })

      if (!res.ok) {
        let detail = 'Failed to import users.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setImportError(detail)
        return
      }

      const data = await res.json()
      setImportResult(data)
      await loadUsers()
    } catch (err) {
      setImportError('Network error. Please try again.')
    } finally {
      setImportLoading(false)
    }
  }

  // Select a user and populate the edit form.
  const handleSelectUser = (user) => {
    setSelectedUser(user)
    setEditForm({
      name: user.name || '',
      dept_job_position: user.dept_job_position || '',
      role: user.role || 'user',
      nik: user.nik || '',
      phone: user.phone || '',
      email: user.email || '',
    })
    setEditError('')
  }

  // Create a new user account from the create form.
  const handleCreate = async (event) => {
    event.preventDefault()
    if (!token) return

    setCreateLoading(true)
    setCreateError('')
    setSuccessModal(null)

    try {
      const res = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createForm),
      })
      if (!res.ok) {
        let detail = 'Failed to create user.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setCreateError(detail)
      } else {
        setSuccessModal({
          mode: 'create',
          title: 'Account Created',
          message: 'User account was created successfully.',
        })
        setCreateForm(initialCreate)
        setShowCreate(false)
        await loadUsers()
      }
    } catch (err) {
      setCreateError('Network error. Please try again.')
    } finally {
      setCreateLoading(false)
    }
  }

  // Save changes for the selected user.
  const handleUpdate = async (event) => {
    event.preventDefault()
    if (!token || !selectedUser) return

    setEditLoading(true)
    setEditError('')
    setSuccessModal(null)

    try {
      const updatePayload = { ...editForm }
      if (selectedUser?.role && !['user', 'driver'].includes(selectedUser.role)) {
        delete updatePayload.role
      }

      const res = await fetch(`${API_BASE_URL}/users/${selectedUser.uid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatePayload),
      })
      if (!res.ok) {
        let detail = 'Failed to update user.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setEditError(detail)
      } else {
        setSuccessModal({
          mode: 'update',
          title: 'Changes Saved',
          message: 'User profile was updated successfully.',
        })
        await loadUsers()
      }
    } catch (err) {
      setEditError('Network error. Please try again.')
    } finally {
      setEditLoading(false)
    }
  }

  // Deactivate an account and keep it unavailable for login.
  const handleDeactivate = async (user) => {
    if (!token || !user?.uid) return

    const confirmed = window.confirm(`Deactivate this account?\n\n${user.email || user.name || user.uid}`)
    if (!confirmed) return

    setActionLoadingId(user.uid)
    setActionError('')
    setActionSuccess('')

    try {
      const res = await fetch(`${API_BASE_URL}/users/${user.uid}/deactivate`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        let detail = 'Failed to deactivate user.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      setActionSuccess('User deactivated successfully.')
      await loadUsers()
    } catch (err) {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  // Open the password reset modal for a user.
  const openPasswordModal = (user) => {
    setPasswordModalUser(user)
    setPasswordForm({ password: '', confirm: '' })
    setPasswordError('')
    setActionSuccess('')
    setActionError('')
  }

  // Close the password modal unless a reset is in progress.
  const closePasswordModal = () => {
    if (passwordLoading) return
    setPasswordModalUser(null)
    setPasswordForm({ password: '', confirm: '' })
    setPasswordError('')
  }

  // Update password form fields.
  const handlePasswordChange = (field) => (event) => {
    const value = event.target.value
    setPasswordForm((prev) => ({ ...prev, [field]: value }))
  }

  // Reset a user's password via the API.
  const handleResetPassword = async (event) => {
    event.preventDefault()
    if (!token || !passwordModalUser?.uid) return

    setPasswordError('')

    const nextPassword = passwordForm.password
    if (nextPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.')
      return
    }
    if (nextPassword !== passwordForm.confirm) {
      setPasswordError('Passwords do not match.')
      return
    }

    setPasswordLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/users/${passwordModalUser.uid}/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: nextPassword }),
      })

      if (!res.ok) {
        let detail = 'Failed to reset password.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setPasswordError(detail)
        return
      }

      setActionSuccess('Password was reset successfully.')
      closePasswordModal()
      await loadUsers()
    } catch {
      setPasswordError('Network error. Please try again.')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <MainLayout title="Manage Users">
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
                className={`sidebar-item ${item.label === 'Manage User' ? 'active' : ''}`}
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
            <p className="eyebrow">Manage User</p>
            <h1>Manage Users</h1>
            <p className="muted">Create new accounts and update existing user profiles</p>
          </header>

          {actionSuccess ? <p className="success-text">{actionSuccess}</p> : null}
          {actionError ? <p className="error-text">{actionError}</p> : null}

          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Close Create Form' : 'Create Account'}
            </button>
            <button type="button" className="btn btn-neutral" onClick={openImportModal}>
              Import Excel
            </button>
          </div>

          {showCreate ? (
            <form className="ticket-form" onSubmit={handleCreate}>
              <section className="field-group">
                <div className="field-heading">
                  <div className="heading-icon">+</div>
                  <div>
                    <h2>Create Account</h2>
                    <p className="muted">Create a new account and store the profile in MongoDB</p>
                  </div>
                </div>
                <div className="field-grid">
                  <label className="inline-label">
                    <span>User Name</span>
                    <input
                      placeholder="User Name"
                      value={createForm.name}
                      onChange={handleCreateChange('name')}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>User Dept/Job Position</span>
                    <input
                      placeholder="User Dept/Job Position"
                      value={createForm.dept_job_position}
                      onChange={handleCreateChange('dept_job_position')}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>Role</span>
                    <select value={createForm.role} onChange={handleCreateChange('role')} required>
                      <option value="user">user</option>
                      <option value="driver">driver</option>
                    </select>
                  </label>
                  <label className="inline-label">
                    <span>National ID</span>
                    <input
                      placeholder="National ID"
                      value={createForm.nik}
                      onChange={handleCreateChange('nik')}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>Phone</span>
                    <input placeholder="Phone" value={createForm.phone} onChange={handleCreateChange('phone')} required />
                  </label>
                  <label className="inline-label">
                    <span>Email</span>
                    <input
                      type="email"
                      placeholder="Email"
                      value={createForm.email}
                      onChange={handleCreateChange('email')}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>Password</span>
                    <input
                      type="password"
                      placeholder="Password (min 6 chars)"
                      value={createForm.password}
                      onChange={handleCreateChange('password')}
                      required
                    />
                  </label>
                </div>
              </section>

              {createError ? <p className="error-text">{createError}</p> : null}

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={createLoading}>
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          ) : null}

          {selectedUser && editForm ? (
            <form className="ticket-form" onSubmit={handleUpdate}>
              <section className="field-group">
                <div className="field-heading">
                  <div className="heading-icon" aria-hidden="true">
                    <i className="bi bi-pencil-square" />
                  </div>
                  <div>
                    <h2>Edit User</h2>
                  </div>
                </div>
                <div className="field-grid">
                  <label className="inline-label">
                    <span>User Name</span>
                    <input placeholder="User Name" value={editForm.name} onChange={handleEditChange('name')} required />
                  </label>
                  <label className="inline-label">
                    <span>User Dept/Job Position</span>
                    <input
                      placeholder="User Dept/Job Position"
                      value={editForm.dept_job_position}
                      onChange={handleEditChange('dept_job_position')}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>Role</span>
                    <select
                      value={editForm.role}
                      onChange={handleEditChange('role')}
                      disabled={selectedUser?.role && !['user', 'driver'].includes(selectedUser.role)}
                      required
                    >
                      <option value="user">user</option>
                      <option value="driver">driver</option>
                      {selectedUser?.role && !['user', 'driver'].includes(selectedUser.role) ? (
                        <option value={selectedUser.role}>{selectedUser.role}</option>
                      ) : null}
                    </select>
                  </label>
                  <label className="inline-label">
                    <span>National ID</span>
                    <input placeholder="National ID" value={editForm.nik} onChange={handleEditChange('nik')} required />
                  </label>
                  <label className="inline-label">
                    <span>Phone</span>
                    <input placeholder="Phone" value={editForm.phone} onChange={handleEditChange('phone')} required />
                  </label>
                  <label className="inline-label">
                    <span>Email</span>
                    <input
                      type="email"
                      placeholder="Email"
                      value={editForm.email}
                      onChange={handleEditChange('email')}
                      required
                    />
                  </label>
                </div>
              </section>

              {editError ? <p className="error-text">{editError}</p> : null}

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={editLoading}>
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => {
                    setSelectedUser(null)
                    setEditForm(null)
                    setEditError('')
                    setSuccessModal(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          <div className="office-table-wrapper">
            <table className="office-table">
              <thead>
                <tr>
                  <th className="table-col-no">No</th>
                  <th>User Name</th>
                  <th>User Dept/Job Position</th>
                  <th>Role</th>
                  <th>National ID</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="muted">
                      Loading...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="8" className="error-text">
                      {error}
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="muted">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  pagedUsers.map((user, index) => (
                    <tr
                      key={user.uid}
                      style={{ background: selectedUser?.uid === user.uid ? 'var(--brand-soft)' : undefined }}
                    >
                      <td className="table-col-no">{(currentPage - 1) * pageSize + index + 1}</td>
                      <td>{user.name || '-'}</td>
                      <td>{user.dept_job_position || '-'}</td>
                      <td>{user.role || '-'}</td>
                      <td>{user.nik || '-'}</td>
                      <td>{user.phone || '-'}</td>
                      <td>{user.email || '-'}</td>
                      <td>
                        <div className="office-row-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={actionLoadingId === user.uid || user.disabled}
                            onClick={() => handleSelectUser(user)}
                          >
                            Update
                          </button>
                          <button
                            type="button"
                            className="btn btn-neutral"
                            disabled={
                              actionLoadingId === user.uid ||
                              user.disabled ||
                              !user.role ||
                              !['user', 'driver'].includes(user.role)
                            }
                            onClick={() => openPasswordModal(user)}
                            title={
                              user.role && ['user', 'driver'].includes(user.role)
                                ? 'Reset password'
                                : 'Password reset is only available for users and drivers.'
                            }
                          >
                            Reset Password
                          </button>
                          {!user.disabled ? (
                            <button
                              type="button"
                              className="btn btn-danger"
                              disabled={actionLoadingId === user.uid}
                              onClick={() => handleDeactivate(user)}
                            >
                              {actionLoadingId === user.uid ? 'Deactivating...' : 'Deactivate'}
                            </button>
                          ) : (
                            <span className="status-badge status-cancelled">Deactivated</span>
                          )}
                        </div>
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
              disabled={loading || currentPage <= 1 || users.length === 0}
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
              disabled={loading || currentPage >= totalPages || users.length === 0}
              onClick={() => setPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
            >
              Next
            </button>
          </div>

          {successModal ? (
            <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="user-success-title">
              <div className="modal success-modal">
                <div className="success-modal-icon" aria-hidden="true">
                  <i className="bi bi-check-lg" />
                </div>
                <h2 id="user-success-title" className="success-modal-title">
                  {successModal.title}
                </h2>
                <p className="success-modal-message">{successModal.message}</p>
                <div className="success-modal-actions">
                  {successModal.mode === 'create' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-brand"
                        onClick={() => {
                          setSuccessModal(null)
                          setShowCreate(true)
                        }}
                      >
                        Create Another
                      </button>
                      <button type="button" className="btn btn-outline-brand" onClick={() => setSuccessModal(null)}>
                        Back to List
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-brand" onClick={() => setSuccessModal(null)}>
                        OK
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-brand"
                        onClick={() => {
                          setSuccessModal(null)
                          setSelectedUser(null)
                          setEditForm(null)
                          setEditError('')
                        }}
                      >
                        Close Editor
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {passwordModalUser ? (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-password-title"
              onClick={() => {
                if (!passwordLoading) closePasswordModal()
              }}
            >
              <div
                className="modal"
                onClick={(event) => {
                  event.stopPropagation()
                }}
              >
                <div className="modal-header">
                  <h2 id="reset-password-title">Reset Password</h2>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={closePasswordModal}
                    disabled={passwordLoading}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <p className="muted" style={{ marginTop: 0 }}>
                  Set a new password for <strong>{passwordModalUser.email || passwordModalUser.uid}</strong>.
                </p>

                <form className="modal-form" onSubmit={handleResetPassword}>
                  <label className="inline-label">
                    <span>New password</span>
                    <input
                      type="password"
                      value={passwordForm.password}
                      onChange={handlePasswordChange('password')}
                      disabled={passwordLoading}
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={handlePasswordChange('confirm')}
                      disabled={passwordLoading}
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                  </label>

                  {passwordError ? <p className="error-text">{passwordError}</p> : null}

                  <div className="modal-actions">
                    <button type="submit" className="btn btn-primary" disabled={passwordLoading}>
                      {passwordLoading ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      onClick={closePasswordModal}
                      disabled={passwordLoading}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {importModalOpen ? (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-import-title"
              onClick={() => {
                if (!importLoading) closeImportModal()
              }}
            >
              <div
                className="modal"
                onClick={(event) => {
                  event.stopPropagation()
                }}
              >
                <div className="modal-header">
                  <h2 id="user-import-title">Import Accounts</h2>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={closeImportModal}
                    disabled={importLoading}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <p className="muted" style={{ marginTop: 0 }}>
                  Upload an Excel (.xlsx) or CSV (.csv) file to create multiple users. Allowed roles: <code>user</code>, <code>driver</code> (role is optional;
                  default is <code>user</code>).
                </p>

                <label className="inline-label">
                  <span>File</span>
                  <input type="file" accept=".xlsx,.csv" onChange={handleImportFileChange} disabled={importLoading} />
                </label>

                <p className="muted" style={{ marginTop: 0 }}>
                  Required columns: <code>name</code>, <code>dept_job_position</code>, <code>nik</code>, <code>phone</code>
                  , <code>email</code>, <code>password</code>. Optional: <code>role</code>.
                </p>

                {importError ? <p className="error-text">{importError}</p> : null}

                {importResult ? (
                  <>
                    <p className="success-text" style={{ marginTop: 0 }}>
                      Created: {importResult.created ?? 0} | Updated: {importResult.updated ?? 0} | Failed:{' '}
                      {importResult.failed ?? 0}
                    </p>
                    {Array.isArray(importResult.errors) && importResult.errors.length ? (
                      <div
                        style={{
                          maxHeight: 220,
                          overflow: 'auto',
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          padding: 12,
                        }}
                      >
                        {importResult.errors.map((item, index) => (
                          <p key={`${item.row}-${index}`} className="muted" style={{ margin: '0 0 10px 0' }}>
                            Row {item.row}
                            {item.email ? ` (${item.email})` : ''}: {item.message}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleImportUsers}
                    disabled={importLoading || !importFile}
                  >
                    {importLoading ? 'Importing...' : 'Import'}
                  </button>
                  <button type="button" className="btn btn-neutral" onClick={downloadImportTemplate} disabled={importLoading}>
                    Download Template Excel
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={closeImportModal}
                    disabled={importLoading}
                  >
                    Close
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

export default OfficeManageUser

import { useEffect, useState } from "react"


import { API_BASE_URL } from '../config'
import MainLayout from "../components/MainLayout"

const AdminPagePermissions = () => {
  const selectedRole = "user"

  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const fetchPermissions = async (role) => {
  try {
    setLoading(true)
    setError("")
    setSuccess("")

    const response = await fetch(
      `${API_BASE_URL}/pages/permissions/${role}`,
      {
        credentials: "include",
      }
    )

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))

      setError(
        data?.detail ||
        "Failed to load page permissions."
      )

      return
    }

    const data = await response.json()

    setPages(data)
  } catch (err) {
    console.error(err)

    setError(
      "Network error. Please try again."
    )
  } finally {
    setLoading(false)
  }
}

  useEffect(() => {
    fetchPermissions(selectedRole)
  }, [selectedRole])

  const togglePermission = async (page) => {
  const nextEnabled = !page.enabled
  setUpdatingId(page.page_id)
  setError('')
  setSuccess('')

  try {
    const response = await fetch(
      `${API_BASE_URL}/pages/permissions`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          role: selectedRole,
          page_id: page.page_id,
          enabled: nextEnabled,
        }),
      }
    )

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))

      setError(
        data?.detail ||
        'Failed to update page permission.'
      )

      return
    }

    const updated = await response.json()

    setPages((current) =>
      current.map((item) =>
        item.page_id === updated.page_id
          ? {
              ...item,
              enabled: updated.enabled,
            }
          : item
      )
    )

    setSuccess(
      `${page.name} permission is now ${
        updated.enabled ? 'On' : 'Off'
      }.`
    )
  } catch {
    setError(
      'Network error. Please try again.'
    )
  } finally {
    setUpdatingId('')
  }
}

  return (
    <MainLayout title="Page Permission Settings">
      <section className="office-content admin-settings driver-availability-settings">
        <header className="office-header">
          <p className="eyebrow">Settings</p>

          <h1>Page Permissions</h1>

          <p className="muted">
            Control which pages can be accessed.
          </p>
        </header>

        <div className="admin-settings__preview">
          <i
            className="bi bi-info-circle"
            aria-hidden="true"
          />

          <span>
            Turning a page off prevents users from accessing that page.
          </span>
        </div>
{/*
        <div className="page-permission-role-selector">
          <label htmlFor="permission-role">
            Role
          </label>

          <select
            id="permission-role"
            value={selectedRole}
            className="permission-role-selector"
            onChange={(event) =>
              setSelectedRole(event.target.value)
            }
          >
            {roles.map((role) => (
              <option
                key={role}
                value={role}
              >
                {formatRoleName(role)}
              </option>
            ))}
          </select>
        </div>
        */}

        <div
          className="driver-availability-feedback"
          aria-live="polite"
        >
          {error ? (
            <p className="error-text">
              {error}
            </p>
          ) : null}

          {!error && success ? (
            <p className="success-text">
              {success}
            </p>
          ) : null}
        </div>

        {loading ? (
          <p className="muted">
            Loading page permissions...
          </p>
        ) : null}

        {!loading && !error ? (
          <div className="table-wrapper">
            <table className="simple-table history-summary-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Path</th>
                  <th>Permission</th>
                </tr>
              </thead>

              <tbody>
                {pages.length === 0 ? (
                  <tr>
                    <td
                      colSpan="3"
                      className="muted"
                    >
                      No pages found.
                    </td>
                  </tr>
                ) : (
                  pages.map((page) => {
                    const isUpdating =
                      updatingId === page.page_id

                    const isEnabled =
                      page.enabled

                    return (
                      <tr key={page.page_id}>
                        <td>
                          <div className="page-permission-page">
                            <strong>
                              {page.name}
                            </strong>

                            {page.description ? (
                              <span className="muted">
                                {page.description}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td>
                          <code>
                            {page.path}
                          </code>
                        </td>

                        <td>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isEnabled}
                            className={`driver-availability-toggle ${
                              isEnabled
                                ? "is-on"
                                : "is-off"
                            }`}
                            onClick={() =>
                              togglePermission(page)
                            }
                            disabled={Boolean(updatingId)}
                            title={
                              isEnabled
                                ? `Turn ${page.name} Off`
                                : `Turn ${page.name} On`
                            }
                            aria-busy={isUpdating}
                          >
                            <i
                              className={`bi ${
                                isEnabled
                                  ? "bi-toggle-on"
                                  : "bi-toggle-off"
                              }`}
                              aria-hidden="true"
                            />

                            <span>
                              {isEnabled
                                ? "On"
                                : "Off"}
                            </span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </MainLayout>
  )
}

{/*
const formatRoleName = (role) => {
  return role
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ")
}
    */}

export default AdminPagePermissions

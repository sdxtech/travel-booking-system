import { useEffect, useState } from 'react'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

function getError(response, fallback) {
  return response.json().then((data) => data?.detail || fallback).catch(() => fallback)
}

function AdminLocationPoints() {
  const [locations, setLocations] = useState([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadLocations = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/locations`, { credentials: 'include' })
      if (!response.ok) throw new Error(await getError(response, 'Failed to load locations.'))
      const data = await response.json()
      setLocations(Array.isArray(data) ? data : [])
    } catch (requestError) {
      setError(requestError.message || 'Network error. Please try again.')
      setLocations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLocations() }, [])

  const saveLocation = async (event) => {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/locations`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      if (!response.ok) throw new Error(await getError(response, 'Failed to add location.'))
      setNewName('')
      setMessage('Location added.')
      await loadLocations()
    } catch (requestError) {
      setError(requestError.message || 'Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const updateLocation = async (locationId) => {
    const name = editingName.trim()
    if (!name) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/locations/${locationId}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      if (!response.ok) throw new Error(await getError(response, 'Failed to update location.'))
      setEditingId('')
      setEditingName('')
      setMessage('Location updated.')
      await loadLocations()
    } catch (requestError) {
      setError(requestError.message || 'Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const deleteLocation = async (location) => {
    if (!window.confirm(`Delete location "${location.name}"?`)) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/locations/${location.id}`, { method: 'DELETE', credentials: 'include' })
      if (!response.ok) throw new Error(await getError(response, 'Failed to delete location.'))
      setMessage('Location deleted.')
      await loadLocations()
    } catch (requestError) {
      setError(requestError.message || 'Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout title="Location Points">
      <section className="office-content admin-settings driver-availability-settings location-points-settings">
        <header className="office-header"><h1>Location Points</h1></header>
        <form className="location-points-add" onSubmit={saveLocation}>
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Add location point" maxLength="160" required />
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add Location'}</button>
        </form>
        <div className="office-table-wrapper">
          <table className="office-table"><thead><tr><th>No</th><th>Location</th><th>Action</th></tr></thead><tbody>
            {loading ? <tr><td colSpan="3" className="muted">Loading...</td></tr> : null}
            {!loading && locations.length === 0 ? <tr><td colSpan="3" className="muted">No locations added yet.</td></tr> : null}
            {!loading && locations.map((location, index) => <tr key={location.id}>
              <td>{index + 1}</td>
              <td>{editingId === location.id ? <input value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength="160" aria-label="Location name" /> : location.name}</td>
              <td><div className="table-action-buttons">
                {editingId === location.id ? <><button type="button" className="btn btn-primary" onClick={() => updateLocation(location.id)} disabled={saving}>Save</button><button type="button" className="btn btn-outline-danger" onClick={() => { setEditingId(''); setEditingName('') }} disabled={saving}>Cancel</button></> : <><button type="button" className="btn btn-secondary" onClick={() => { setEditingId(location.id); setEditingName(location.name) }} disabled={saving}>Edit</button><button type="button" className="btn btn-outline-danger" onClick={() => deleteLocation(location)} disabled={saving}>Delete</button></>}
              </div></td>
            </tr>)}
          </tbody></table>
        </div>
        <div className="driver-availability-feedback">{error ? <p className="error-text">{error}</p> : message ? <p className="success-text">{message}</p> : null}</div>
      </section>
    </MainLayout>
  )
}

export default AdminLocationPoints

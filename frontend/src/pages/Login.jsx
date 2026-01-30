import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL, APP_NAME } from '../config'

const roleRouteMap = {
  user: '/user/home',
  driver: '/driver/home',
  office_coordinator: '/office/home',
  superadmin: '/admin/home',
}

const LOGO_SOURCES = ['/app-logo-blue.png', '/app-logo-black.png', '/app-logo-white.png', '/app-logo.png']

// Map API errors into user-friendly login messages.
const getLoginErrorMessage = (message) => {
  if (!message) {
    return 'Login failed. Please check your email and password.'
  }
  const normalized = message.toLowerCase()
  if (normalized.includes('disabled')) {
    return 'Your account has been disabled. Please contact an administrator.'
  }
  if (normalized.includes('invalid email or password')) {
    return 'Invalid email or password. If this account was imported, please ask an administrator to reset the password.'
  }
  return message
}

// Login page for all roles; redirects after fetching the user's role.
function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoIndex, setLogoIndex] = useState(0)

  const navigate = useNavigate()

  // Set a consistent document title for the login page.
  useEffect(() => {
    document.title = `Login | ${APP_NAME}`
  }, [])

  // Sign in with the API and fetch the role.
  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      })

      if (!loginRes.ok) {
        let detail = 'Login failed. Please check your email and password.'
        try {
          const data = await loginRes.json()
          if (data?.detail) {
            detail = data.detail
          }
        } catch (e) {
          // ignore parse error
        }
        throw new Error(detail)
      }

      const loginData = await loginRes.json()
      const token = loginData.access_token
      if (!token) {
        throw new Error('Login failed. Missing access token.')
      }

      localStorage.setItem('authToken', token)

      const response = await fetch(`${API_BASE_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        let detail = 'Failed to fetch user role'
        try {
          const data = await response.json()
          if (data?.detail) {
            detail = data.detail
          }
        } catch (e) {
          // ignore parse error
        }
        throw new Error(detail)
      }

      const data = await response.json()
      localStorage.setItem('authRole', data.role || '')
      const destination = roleRouteMap[data.role] || '/login'

      navigate(destination, { replace: true })
    } catch (err) {
      console.error('Login error', err)
      localStorage.removeItem('authToken')
      localStorage.removeItem('authRole')
      setError(getLoginErrorMessage(err?.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrapper">
        <div className="login-logo">
          <div className="login-logo__circle">
            {LOGO_SOURCES[logoIndex] ? (
              <img
                className="login-logo__image"
                src={LOGO_SOURCES[logoIndex]}
                alt={APP_NAME}
                onError={() => setLogoIndex((prev) => prev + 1)}
              />
            ) : (
              <span className="login-logo__fallback">APP LOGO</span>
            )}
          </div>
        </div>

        <div className="login-card login-card-branded">
          <h1 className="login-title">LOGIN</h1>
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </label>
            <label className="form-field">
              <span>Password</span>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="********"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  <i className={`bi ${showPassword ? 'bi-eye-slash-fill' : 'bi-eye-fill'}`} aria-hidden="true" />
                </button>
              </div>
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login

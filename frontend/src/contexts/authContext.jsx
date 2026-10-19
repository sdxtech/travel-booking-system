
import { useCallback, useEffect, useState } from 'react'

import { API_BASE_URL } from '../config'
import AuthContext from './AuthContext'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [pagePermissions, setPagePermissions] = useState([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)


  const fetchCurrentUser = useCallback(async () => {
    const response = await fetch(
      `${API_BASE_URL}/users/me`,
      {
        credentials: 'include',
      }
    )

    if (!response.ok) {
      if ([401, 403].includes(response.status)) setUser(null)
      return null
    }

    const userData = await response.json()

    setUser(userData)

    return userData
  }, [])


  const fetchPagePermissions = useCallback(async (role, background = false) => {

    if (!['user', 'office_coordinator'].includes(role)) {
      setPagePermissions([])
      setPermissionsLoaded(true)
      return []
    }

    try {
      if (!background) {
        setPermissionsLoading(true)
        setPermissionsLoaded(false)
      }

      const response = await fetch(
        `${API_BASE_URL}/pages/permissions/${role}`,
        {
          credentials: 'include',
        }
      )

      if (!response.ok) {
        if (background && ![401, 403].includes(response.status)) return []
        const data = await response.json().catch(() => ({}))

        console.error(
          'Failed to load page permissions:',
          data?.detail || response.statusText
        )

        setPagePermissions([])

        return []
      }

      const data = await response.json()

      const permissions = Array.isArray(data)
        ? data
        : Array.isArray(data?.permissions)
          ? data.permissions
          : Array.isArray(data?.pages)
            ? data.pages
            : []

      setPagePermissions(permissions)

      return permissions
    } catch (error) {
      if (background) return []
      console.error(
        'Failed to load page permissions:',
        error
      )

      setPagePermissions([])

      return []
    } finally {
      setPermissionsLoading(false)
      setPermissionsLoaded(true)
    }
  }, [])

  useRealtimeRefresh(['profile'], async () => {
    if (!user) return
    const profile = await fetchCurrentUser()
    if (profile && profile.role !== user.role) await fetchPagePermissions(profile.role, true)
  })
  useRealtimeRefresh(['permissions'], () => user && fetchPagePermissions(user.role, true))

  useEffect(() => {
    const refresh = () => { fetchCurrentUser().catch(() => {}) }
    window.addEventListener('auth:refresh', refresh)
    return () => window.removeEventListener('auth:refresh', refresh)
  }, [fetchCurrentUser])


  const login = async (email, password, rememberMe = false) => {
    const loginRes = await fetch(
      `${API_BASE_URL}/auth/login`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        credentials: 'include',

        body: JSON.stringify({
          email,
          password,
          remember_me: rememberMe
        }),
      }
    )

    if (!loginRes.ok) {
      const data = await loginRes
        .json()
        .catch(() => null)

      throw new Error(
        data?.detail ||
          'Login failed. Please check your email and password.'
      )
    }
    const userData = await fetchCurrentUser()

    if (!userData) {
      throw new Error(
        'Failed to fetch user data'
      )
    }


    await fetchPagePermissions(
      userData.role
    )

    return userData
  }


  const logout = async () => {
    try {
      await fetch(
        `${API_BASE_URL}/auth/logout`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )
    } finally {
      setUser(null)


      setPagePermissions([])
      setPermissionsLoaded(false)
      setPermissionsLoading(false)
    }
  }


  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const userData =
          await fetchCurrentUser()

        if (userData) {
          await fetchPagePermissions(
            userData.role
          )
        }
      } catch (error) {
        console.error(
          'Failed to initialize authentication:',
          error
        )

        setUser(null)
        setPagePermissions([])
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [fetchCurrentUser, fetchPagePermissions])



  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,

        loading,

        login,
        logout,
        fetchCurrentUser,
        pagePermissions,
        permissionsLoading,
        permissionsLoaded,
        fetchPagePermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}


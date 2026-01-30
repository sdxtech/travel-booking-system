import { Navigate } from 'react-router-dom'

// Simple auth gate that redirects to login when the token is missing.
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('authToken')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute

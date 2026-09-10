
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function ProtectedRoute({
  children,
  allowedRoles,
  pageId,
}) {
  const {
    user,
    loading,
    pagePermissions,
    permissionsLoading,
    permissionsLoaded,
  } = useAuth()


  if (loading) {
    return <div>Loading...</div>
  }


  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    )
  }


  if (
    allowedRoles &&
    !allowedRoles.includes(user.role)
  ) {
    return (
      <Navigate
        to="/unauthorized"
        replace
      />
    )
  }


  if (user.role === 'superadmin') {
    return children
  }


  if (!pageId) {
    return children
  }


  if (
    permissionsLoading ||
    !permissionsLoaded
  ) {
    return <div>Loading...</div>
  }

 

  const currentPermission =
    pagePermissions.find(
      (item) =>
        item.page_id === pageId
    )


  if (
    !currentPermission ||
    currentPermission.enabled !== true
  ) {
    return (
      <Navigate
        to="/unauthorized"
        replace
      />
    )
  }


  return children
}

export default ProtectedRoute

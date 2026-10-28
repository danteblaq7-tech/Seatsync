import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RoleProtectedRoute ({ allowedRoles = [], children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className='loading-screen'>Loading SeatSync...</div>
  }

  if (!user) {
    return <Navigate to='/login' replace />
  }

  const userRoles = Array.isArray(user.roles)
    ? user.roles
    : [user.roles].filter(Boolean)
  const hasAccess = allowedRoles.some(role => userRoles.includes(role))

  if (!hasAccess) {
    return <Navigate to='/unauthorized' replace />
  }

  return children
}

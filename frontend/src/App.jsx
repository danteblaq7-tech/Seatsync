import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import RoleProtectedRoute from './components/RoleProtectedRoute'
import Sidebar from './components/Sidebar'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import DashboardPage from './pages/DashboardPage'
import TimetablePage from './pages/TimetablePage'
import VenuesPage from './pages/VenuesPage'
import ExamsPage from './pages/ExamsPage'
import NotificationsPage from './pages/NotificationsPage'
import AdminUsersPage from './pages/AdminUsersPage'
import CoursesPage from './pages/CoursesPage'
import CohortsPage from './pages/CohortsPage'
import StudentsPage from './pages/StudentsPage'
import LecturersPage from './pages/LecturersPage'
import AcademicSetupPage from './pages/AcademicSetupPage'
import ReportsPage from './pages/ReportsPage'
import LecturerProfilePage from './pages/LecturerProfilePage'
import { api } from './api/client'
import './App.css'
import ProfileCompletionModal from './components/ProfileCompletionModal'
import { SOCKET_BASE_URL } from './config.js'

function ProtectedLayout () {
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const socket = io(SOCKET_BASE_URL, { transports: ['websocket'] })
    const refreshScheduleData = payload => {
      console.info('[REALTIME] timetable:changed received', payload)
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
      queryClient.invalidateQueries({ queryKey: ['timetable-exams'] })
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({
        queryKey: ['venue-timetable-allocations']
      })
    }

    socket.on('timetable:changed', refreshScheduleData)
    socket.on('audit:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
    })
    return () => socket.disconnect()
  }, [queryClient])

  const { data: profileStatus } = useQuery({
    queryKey: ['profile-status', user?.id],
    queryFn: async () => (await api.get('/api/auth/profile-status')).data,
    enabled: Boolean(user?.id)
  })

  const handleToggleSidebar = () => {
    if (window.innerWidth <= 1024) {
      setMobileNavOpen(false)
      return
    }
    setSidebarCollapsed(value => !value)
  }

  const handleToggleMobileNav = () => {
    setSidebarCollapsed(false)
    setMobileNavOpen(value => !value)
  }

  const handleNavSelect = () => {
    if (window.innerWidth <= 1024) {
      setMobileNavOpen(false)
    }
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileNavOpen && (
        <button
          type='button'
          className='mobile-nav-backdrop'
          aria-label='Close navigation menu'
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <Sidebar
        user={user}
        onLogout={logout}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileNavOpen}
        onToggleCollapse={handleToggleSidebar}
        onNavSelect={handleNavSelect}
      />
      <main className='main-content'>
        <div className='mobile-topbar'>
          <button
            type='button'
            className='mobile-menu-button'
            aria-label={
              mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'
            }
            aria-expanded={mobileNavOpen}
            onClick={handleToggleMobileNav}
          >
            <span />
            <span />
            <span />
          </button>
          <strong>SeatSync</strong>
        </div>
        <Routes>
          <Route path='/dashboard' element={<DashboardPage />} />
          <Route path='/timetable' element={<TimetablePage />} />
          <Route
            path='/venues'
            element={
              <RoleProtectedRoute
                allowedRoles={['ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP']}
              >
                <VenuesPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path='/courses'
            element={
              <RoleProtectedRoute allowedRoles={['ADMIN', 'LECTURER']}>
                <CoursesPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path='/cohorts'
            element={
              <RoleProtectedRoute allowedRoles={['ADMIN', 'CLASS_REP']}>
                <CohortsPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path='/students'
            element={
              <RoleProtectedRoute allowedRoles={['ADMIN']}>
                <StudentsPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path='/lecturers'
            element={
              <RoleProtectedRoute allowedRoles={['ADMIN']}>
                <LecturersPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path='/academic/setup'
            element={
              <RoleProtectedRoute allowedRoles={['ADMIN']}>
                <AcademicSetupPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path='/reports'
            element={
              <RoleProtectedRoute allowedRoles={['ADMIN']}>
                <ReportsPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path='/lecturer/profile'
            element={
              <RoleProtectedRoute allowedRoles={['LECTURER']}>
                <LecturerProfilePage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path='/exams'
            element={
              <RoleProtectedRoute
                allowedRoles={['ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP']}
              >
                <ExamsPage />
              </RoleProtectedRoute>
            }
          />
          <Route path='/notifications' element={<NotificationsPage />} />
          <Route
            path='/admin/users'
            element={
              <RoleProtectedRoute allowedRoles={['ADMIN']}>
                <AdminUsersPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path='/settings'
            element={
              <div className='page-shell'>
                <section className='content-panel'>
                  <h1>Settings</h1>
                  <p>
                    System preferences and account controls are available here.
                  </p>
                </section>
              </div>
            }
          />
          <Route path='/unauthorized' element={<UnauthorizedPage />} />
          <Route path='*' element={<Navigate to='/dashboard' replace />} />
        </Routes>
      </main>
      {profileStatus && !profileStatus.complete && (
        <ProfileCompletionModal role={profileStatus.role} />
      )}
    </div>
  )
}

export default function App () {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className='loading-screen'>Loading SeatSync...</div>
  }

  return (
    <Routes>
      <Route
        path='/login'
        element={user ? <Navigate to='/dashboard' replace /> : <LoginPage />}
      />
      <Route
        path='/register'
        element={user ? <Navigate to='/dashboard' replace /> : <RegisterPage />}
      />
      <Route path='/unauthorized' element={<UnauthorizedPage />} />
      <Route
        path='/*'
        element={
          <ProtectedRoute>
            <ProtectedLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

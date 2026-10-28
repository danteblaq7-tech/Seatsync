/**
 * Single source of truth for the sidebar and role access.
 * Mirrors navByRole / groupOrder in the web Sidebar and the RoleProtectedRoute lists in App.jsx.
 * `icon` names are FontAwesome 5 solid names (same glyph family the web uses via FontAwesome).
 */
export const navByRole = {
  ADMIN: [
    { group: 'Overview', label: 'Dashboard', icon: 'chart-pie', to: 'Dashboard' },
    { group: 'Overview', label: 'Users', icon: 'users-cog', to: 'AdminUsers' },
    { group: 'Academic', label: 'Academic setup', icon: 'school', to: 'AcademicSetup' },
    { group: 'Academic', label: 'Cohorts', icon: 'users', to: 'Cohorts' },
    { group: 'Academic', label: 'Units', icon: 'book-open', to: 'Courses' },
    { group: 'Academic', label: 'Lecturers', icon: 'users-cog', to: 'Lecturers' },
    { group: 'Academic', label: 'Students', icon: 'user-graduate', to: 'Students' },
    { group: 'Scheduling', label: 'Timetable', icon: 'th', to: 'Timetable' },
    { group: 'Scheduling', label: 'Exams', icon: 'clipboard-list', to: 'Exams' },
    { group: 'Scheduling', label: 'Venues', icon: 'building', to: 'Venues' },
    { group: 'Reports', label: 'Reports', icon: 'chart-bar', to: 'Reports' },
    { group: 'Communications', label: 'Notifications', icon: 'bell', to: 'Notifications' }
  ],
  LECTURER: [
    { group: 'Overview', label: 'Dashboard', icon: 'chart-pie', to: 'Dashboard' },
    { group: 'Academic', label: 'My teaching profile', icon: 'users-cog', to: 'LecturerProfile' },
    { group: 'Academic', label: 'My units', icon: 'book-open', to: 'Courses' },
    { group: 'Scheduling', label: 'Timetable', icon: 'th', to: 'Timetable' },
    { group: 'Scheduling', label: 'Exams', icon: 'clipboard-list', to: 'Exams' },
    { group: 'Scheduling', label: 'Venues', icon: 'building', to: 'Venues' },
    { group: 'Communications', label: 'Notifications', icon: 'bell', to: 'Notifications' }
  ],
  STUDENT: [
    { group: 'Overview', label: 'Dashboard', icon: 'chart-pie', to: 'Dashboard' },
    { group: 'Scheduling', label: 'Timetable', icon: 'th', to: 'Timetable' },
    { group: 'Scheduling', label: 'Exams', icon: 'clipboard-list', to: 'Exams' },
    { group: 'Scheduling', label: 'Venues', icon: 'building', to: 'Venues' },
    { group: 'Communications', label: 'Notifications', icon: 'bell', to: 'Notifications' }
  ],
  CLASS_REP: [
    { group: 'Overview', label: 'Dashboard', icon: 'chart-pie', to: 'Dashboard' },
    { group: 'Scheduling', label: 'Timetable', icon: 'th', to: 'Timetable' },
    { group: 'Academic', label: 'Cohorts', icon: 'users', to: 'Cohorts' },
    { group: 'Scheduling', label: 'Exams', icon: 'clipboard-list', to: 'Exams' },
    { group: 'Scheduling', label: 'Venues', icon: 'building', to: 'Venues' },
    { group: 'Communications', label: 'Notifications', icon: 'bell', to: 'Notifications' }
  ]
}

export const groupOrder = [
  'Overview',
  'Academic',
  'Scheduling',
  'Reports',
  'Communications',
  'Administration'
]

/** Roles allowed per screen. `null` = any signed-in user. (Matches RoleProtectedRoute in App.jsx) */
export const screenRoles = {
  Dashboard: null,
  Timetable: null,
  Notifications: null,
  Settings: null,
  Unauthorized: null,
  Venues: ['ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'],
  Courses: ['ADMIN', 'LECTURER'],
  Cohorts: ['ADMIN', 'CLASS_REP'],
  Students: ['ADMIN'],
  Lecturers: ['ADMIN'],
  AcademicSetup: ['ADMIN'],
  Reports: ['ADMIN'],
  LecturerProfile: ['LECTURER'],
  Exams: ['ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'],
  AdminUsers: ['ADMIN']
}

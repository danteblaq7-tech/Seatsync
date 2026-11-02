import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { api } from '../api/client'
import {
  faAngleDown,
  faBars,
  faBell,
  faBookOpen,
  faBuilding,
  faChartColumn,
  faChartPie,
  faClipboardList,
  faGear,
  faRightFromBracket,
  faSchool,
  faTableCells,
  faUserGraduate,
  faUsers,
  faUsersCog,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

const navByRole = {
  ADMIN: [
    {
      group: 'Overview',
      label: 'Dashboard',
      icon: faChartPie,
      to: '/dashboard'
    },
    {
      group: 'Overview',
      label: 'Users',
      icon: faUsersCog,
      to: '/admin/users'
    },
    {
      group: 'Academic',
      label: 'Academic setup',
      icon: faSchool,
      to: '/academic/setup'
    },
    { group: 'Academic', label: 'Cohorts', icon: faUsers, to: '/cohorts' },
    {
      group: 'Academic',
      label: 'Units',
      icon: faBookOpen,
      to: '/courses'
    },
    {
      group: 'Academic',
      label: 'Lecturers',
      icon: faUsersCog,
      to: '/lecturers'
    },
    {
      group: 'Academic',
      label: 'Students',
      icon: faUserGraduate,
      to: '/students'
    },
    {
      group: 'Scheduling',
      label: 'Timetable',
      icon: faTableCells,
      to: '/timetable'
    },
    {
      group: 'Scheduling',
      label: 'Exams',
      icon: faClipboardList,
      to: '/exams'
    },
    { group: 'Scheduling', label: 'Venues', icon: faBuilding, to: '/venues' },
    { group: 'Reports', label: 'Reports', icon: faChartColumn, to: '/reports' },
    {
      group: 'Communications',
      label: 'Notifications',
      icon: faBell,
      to: '/notifications'
    }
  ],
  LECTURER: [
    {
      group: 'Overview',
      label: 'Dashboard',
      icon: faChartPie,
      to: '/dashboard'
    },
    {
      group: 'Academic',
      label: 'My teaching profile',
      icon: faUsersCog,
      to: '/lecturer/profile'
    },
    { group: 'Academic', label: 'My units', icon: faBookOpen, to: '/courses' },
    {
      group: 'Scheduling',
      label: 'Timetable',
      icon: faTableCells,
      to: '/timetable'
    },
    {
      group: 'Scheduling',
      label: 'Exams',
      icon: faClipboardList,
      to: '/exams'
    },
    { group: 'Scheduling', label: 'Venues', icon: faBuilding, to: '/venues' },
    {
      group: 'Communications',
      label: 'Notifications',
      icon: faBell,
      to: '/notifications'
    }
  ],
  STUDENT: [
    {
      group: 'Overview',
      label: 'Dashboard',
      icon: faChartPie,
      to: '/dashboard'
    },
    {
      group: 'Academic',
      label: 'My academic information',
      icon: faUserGraduate,
      to: '/academic/profile'
    },
    {
      group: 'Scheduling',
      label: 'Timetable',
      icon: faTableCells,
      to: '/timetable'
    },
    {
      group: 'Scheduling',
      label: 'Exams',
      icon: faClipboardList,
      to: '/exams'
    },
    { group: 'Scheduling', label: 'Venues', icon: faBuilding, to: '/venues' },
    {
      group: 'Communications',
      label: 'Notifications',
      icon: faBell,
      to: '/notifications'
    }
  ],
  CLASS_REP: [
    {
      group: 'Overview',
      label: 'Dashboard',
      icon: faChartPie,
      to: '/dashboard'
    },
    {
      group: 'Academic',
      label: 'My academic information',
      icon: faUserGraduate,
      to: '/academic/profile'
    },
    {
      group: 'Scheduling',
      label: 'Timetable',
      icon: faTableCells,
      to: '/timetable'
    },
    { group: 'Academic', label: 'Cohorts', icon: faUsers, to: '/cohorts' },
    {
      group: 'Scheduling',
      label: 'Exams',
      icon: faClipboardList,
      to: '/exams'
    },
    { group: 'Scheduling', label: 'Venues', icon: faBuilding, to: '/venues' },
    {
      group: 'Communications',
      label: 'Notifications',
      icon: faBell,
      to: '/notifications'
    }
  ]
}

const groupOrder = [
  'Overview',
  'Academic',
  'Scheduling',
  'Reports',
  'Communications',
  'Administration'
]

export default function Sidebar ({
  user,
  onLogout,
  collapsed,
  mobileOpen = false,
  onToggleCollapse,
  onNavSelect
}) {
  const userRoles = useMemo(() => user?.roles || [], [user?.roles])
  const canReviewCohortRequests = userRoles.some(role =>
    ['ADMIN', 'CLASS_REP'].includes(role)
  )
  const {
    data: cohortRequestCounts,
    isError: cohortRequestCountError
  } = useQuery({
    queryKey: ['cohort-request-counts', user?.id],
    queryFn: async () =>
      (await api.get('/api/academic/cohort-request-counts')).data,
    enabled: Boolean(user?.id && canReviewCohortRequests),
    refetchInterval: 30000
  })
  const {
    data: notifications = [],
    isError: notificationCountError
  } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const response = await api.get('/api/notifications')
      return Array.isArray(response?.data) ? response.data : []
    },
    enabled: Boolean(user?.id),
    refetchInterval: 30000
  })
  const unreadNotificationCount = notifications.filter(
    notification =>
      !(notification.isRead ?? notification.is_read ?? notification.read)
  ).length
  const [expandedGroups, setExpandedGroups] = useState({
    Overview: true,
    Academic: true,
    Scheduling: true,
    Reports: true,
    Communications: true,
    Administration: true
  })

  const visibleNav = useMemo(() => {
    const items = userRoles.length
      ? userRoles.flatMap(role => navByRole[role] || [])
      : navByRole.STUDENT

    return Array.from(new Map(items.map(item => [item.to, item])).values())
  }, [userRoles])

  const navGroups = useMemo(
    () =>
      groupOrder
        .map(groupName => ({
          key: groupName,
          label: groupName,
          items: visibleNav.filter(item => item.group === groupName)
        }))
        .filter(group => group.items.length),
    [visibleNav]
  )

  const toggleGroup = groupKey => {
    setExpandedGroups(current => ({
      ...current,
      [groupKey]: !current[groupKey]
    }))
  }

  return (
    <aside
      className={`sidebar ${collapsed ? 'collapsed' : ''} ${
        mobileOpen ? 'mobile-open' : ''
      }`}
    >
      <div className='brand-block'>
        <button
          type='button'
          className='menu-toggle'
          onClick={onToggleCollapse}
          aria-label='Toggle sidebar'
        >
          <FontAwesomeIcon icon={collapsed ? faBars : faXmark} />
        </button>

        {!collapsed && (
          <div className='brand-copy'>
            <p className='eyebrow'>Campus control</p>
            <h2>SeatSync</h2>
          </div>
        )}
      </div>

      <nav className='sidebar-nav' aria-label='Main navigation'>
        {navGroups.map(group => {
          const isExpanded = expandedGroups[group.key] !== false

          return (
            <div key={group.key} className='nav-group'>
              {!collapsed && (
                <button
                  type='button'
                  className='nav-group-toggle'
                  onClick={() => toggleGroup(group.key)}
                >
                  <span>{group.label}</span>
                  <FontAwesomeIcon
                    icon={faAngleDown}
                    className={`nav-group-chevron ${
                      isExpanded ? 'expanded' : ''
                    }`}
                  />
                </button>
              )}

              {(isExpanded || collapsed) && (
                <div className='nav-group-items'>
                  {group.items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className='nav-item'
                      end={item.to === '/dashboard'}
                      onClick={() => {
                        if (typeof onNavSelect === 'function') {
                          onNavSelect()
                        }
                      }}
                      title={
                        item.to === '/cohorts'
                          ? cohortRequestCountError
                            ? 'Pending cohort request count unavailable'
                            : cohortRequestCounts?.total
                            ? `${item.label}: ${cohortRequestCounts.total} pending requests`
                            : item.label
                          : item.to === '/notifications'
                          ? notificationCountError
                            ? 'Unread notification count unavailable'
                            : `${unreadNotificationCount} unread notifications`
                          : item.label
                      }
                    >
                      <FontAwesomeIcon icon={item.icon} />
                      {!collapsed && <span>{item.label}</span>}
                      {item.to === '/cohorts' && cohortRequestCountError && (
                        <span
                          className='nav-count-badge'
                          aria-label='Pending cohort request count unavailable'
                        >
                          !
                        </span>
                      )}
                      {item.to === '/cohorts' &&
                        !cohortRequestCountError &&
                        Number(cohortRequestCounts?.total) > 0 && (
                          <span
                            className='nav-count-badge'
                            aria-label={`${cohortRequestCounts.total} pending cohort requests`}
                          >
                            {cohortRequestCounts.total > 99
                              ? '99+'
                              : cohortRequestCounts.total}
                          </span>
                        )}
                      {item.to === '/notifications' &&
                        notificationCountError && (
                          <span
                            className='nav-count-badge notification-count-badge'
                            aria-label='Unread notification count unavailable'
                          >
                            !
                          </span>
                        )}
                      {item.to === '/notifications' &&
                        !notificationCountError &&
                        unreadNotificationCount > 0 && (
                          <span
                            className='nav-count-badge notification-count-badge'
                            aria-label={`${unreadNotificationCount} unread notifications`}
                          >
                            {unreadNotificationCount > 99
                              ? '99+'
                              : unreadNotificationCount}
                          </span>
                        )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <NavLink to='/settings' className='nav-item settings-link'>
          <FontAwesomeIcon icon={faGear} />
          {!collapsed && <span>Settings</span>}
        </NavLink>
      </nav>

      <div className='sidebar-footer'>
        {!collapsed && (
          <div className='profile-pill'>
            <strong>{user?.firstName || 'User'}</strong>
            <span>{(userRoles || []).join(', ') || 'Member'}</span>
          </div>
        )}
        <button type='button' className='logout-button' onClick={onLogout}>
          <FontAwesomeIcon icon={faRightFromBracket} />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </aside>
  )
}

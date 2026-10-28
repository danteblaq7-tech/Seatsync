import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
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
  faMoon,
  faSun,
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
  const userRoles = user?.roles || []
  const { theme, toggleTheme } = useTheme()
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
            <h2>
              Seat<span className='brand-accent'>Sync</span>
            </h2>
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
                    >
                      <FontAwesomeIcon icon={item.icon} />
                      {!collapsed && <span>{item.label}</span>}
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
        <button
          type='button'
          className='theme-toggle-button'
          onClick={toggleTheme}
          aria-label={
            theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          }
        >
          <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
          {!collapsed && (theme === 'dark' ? 'Light mode' : 'Dark mode')}
        </button>
        <button type='button' className='logout-button' onClick={onLogout}>
          <FontAwesomeIcon icon={faRightFromBracket} />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </aside>
  )
}

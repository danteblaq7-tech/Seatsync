import React, { useEffect, useState } from 'react'
import { Pressable, StatusBar, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import useRealtime from '../realtime/useRealtime'
import { colors, layout, radius, type } from '../theme'
import { Text } from '../components/Typography'
import { screenRoles } from './navConfig'
import Sidebar from '../components/Sidebar'
import ProfileCompletionModal from '../components/ProfileCompletionModal'
import { Loading } from '../components/ui'

import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import UnauthorizedScreen from '../screens/UnauthorizedScreen'
import DashboardScreen from '../screens/DashboardScreen'
import TimetableScreen from '../screens/TimetableScreen'
import VenuesScreen from '../screens/VenuesScreen'
import ExamsScreen from '../screens/ExamsScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import AdminUsersScreen from '../screens/AdminUsersScreen'
import CoursesScreen from '../screens/CoursesScreen'
import CohortsScreen from '../screens/CohortsScreen'
import StudentsScreen from '../screens/StudentsScreen'
import LecturersScreen from '../screens/LecturersScreen'
import AcademicSetupScreen from '../screens/AcademicSetupScreen'
import ReportsScreen from '../screens/ReportsScreen'
import LecturerProfileScreen from '../screens/LecturerProfileScreen'
import SettingsScreen from '../screens/SettingsScreen'

export const navigationRef = createNavigationContainerRef()
const AuthStack = createNativeStackNavigator()
const AppStack = createNativeStackNavigator()

/** RoleProtectedRoute: redirect to Unauthorized when the signed-in user lacks every allowed role. */
const guarded = (Component, name) =>
  function Guarded (props) {
    const { user } = useAuth()
    const allowed = screenRoles[name]
    const ok = !allowed || (user?.roles || []).some(role => allowed.includes(role))
    useEffect(() => {
      if (!ok) props.navigation.replace('Unauthorized')
    }, [ok, props.navigation])
    return ok ? <Component {...props} /> : null
  }

const screens = {
  Dashboard: DashboardScreen,
  Timetable: TimetableScreen,
  Venues: guarded(VenuesScreen, 'Venues'),
  Courses: guarded(CoursesScreen, 'Courses'),
  Cohorts: guarded(CohortsScreen, 'Cohorts'),
  Students: guarded(StudentsScreen, 'Students'),
  Lecturers: guarded(LecturersScreen, 'Lecturers'),
  AcademicSetup: guarded(AcademicSetupScreen, 'AcademicSetup'),
  Reports: guarded(ReportsScreen, 'Reports'),
  LecturerProfile: guarded(LecturerProfileScreen, 'LecturerProfile'),
  Exams: guarded(ExamsScreen, 'Exams'),
  Notifications: NotificationsScreen,
  AdminUsers: guarded(AdminUsersScreen, 'AdminUsers'),
  Settings: SettingsScreen,
  Unauthorized: UnauthorizedScreen
}

function themed (Component) {
  return function ThemeAwareScreen (props) {
    useTheme()
    return <Component {...props} />
  }
}

const themedScreens = Object.fromEntries(
  Object.entries(screens).map(([name, Component]) => [name, themed(Component)])
)
const ThemedLoginScreen = themed(LoginScreen)
const ThemedRegisterScreen = themed(RegisterScreen)
const ThemedUnauthorizedScreen = themed(UnauthorizedScreen)

/** .mobile-topbar: 42x42 hamburger + "SeatSync", 48px min height, 14px gap below */
function MobileTopbar ({ open, onToggle }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingTop: insets.top + layout.screenPadding,
        paddingHorizontal: layout.screenPadding,
        marginBottom: 14
      }}
    >
      <View style={{ minHeight: layout.topbarMinHeight, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={open ? 'Close navigation menu' : 'Open navigation menu'}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{
          width: layout.menuButton,
          height: layout.menuButton,
          padding: 10,
          justifyContent: 'center',
          gap: 4,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.input,
          backgroundColor: colors.surface
        }}
      >
        {[0, 1, 2].map(i => (
          <View key={i} style={{ height: 2, borderRadius: 2, backgroundColor: colors.primary }} />
        ))}
      </Pressable>
      <Text style={type.brand}>SeatSync</Text>
      </View>
    </View>
  )
}

function AppShell () {
  const { user, logout } = useAuth()
  useTheme()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('Dashboard')
  useRealtime()

  const { data: profileStatus } = useQuery({
    queryKey: ['profile-status', user?.id],
    queryFn: async () => (await api.get('/api/auth/profile-status')).data,
    enabled: Boolean(user?.id)
  })

  const go = name => {
    setOpen(false)
    if (navigationRef.isReady()) navigationRef.navigate(name)
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MobileTopbar open={open} onToggle={() => setOpen(v => !v)} />
      <AppStack.Navigator
        initialRouteName='Dashboard'
        screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: colors.bg } }}
        screenListeners={{ focus: () => setActive(navigationRef.getCurrentRoute()?.name) }}
      >
        {Object.entries(themedScreens).map(([name, component]) => (
          <AppStack.Screen key={name} name={name} component={component} />
        ))}
      </AppStack.Navigator>

      <Sidebar
        user={user}
        open={open}
        activeRoute={active}
        onClose={() => setOpen(false)}
        onNavigate={go}
        onLogout={async () => {
          setOpen(false)
          await logout()
        }}
      />

      {profileStatus && !profileStatus.complete && <ProfileCompletionModal role={profileStatus.role} />}
    </View>
  )
}

function AuthFlow () {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <AuthStack.Screen name='Login' component={ThemedLoginScreen} />
      <AuthStack.Screen name='Register' component={ThemedRegisterScreen} />
      <AuthStack.Screen name='Unauthorized' component={ThemedUnauthorizedScreen} />
    </AuthStack.Navigator>
  )
}

export default function AppNavigator () {
  const { user, loading: authLoading } = useAuth()
  const { loading: themeLoading, theme } = useTheme()
  if (authLoading || themeLoading) return <Loading />
  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      {user ? <AppShell /> : <AuthFlow />}
    </NavigationContainer>
  )
}

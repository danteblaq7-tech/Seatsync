import React from 'react'
import { View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { AuthHeader, AuthShell, LinkButton } from '../components/AuthLayout'

export default function UnauthorizedScreen ({ navigation }) {
  const { user, logout } = useAuth()
  return (
    <AuthShell>
      <AuthHeader
        eyebrow='Access denied'
        title='Unauthorized'
        description='You do not have the required permissions to view this page.'
      />
      <View style={{ gap: 18 }}>
        {user ? (
          <LinkButton title='Return to dashboard' onPress={() => navigation.navigate('Dashboard')} />
        ) : null}
        <LinkButton
          title='Log in with another account'
          onPress={async () => {
            if (user) await logout()
            else navigation.navigate('Login')
          }}
        />
      </View>
    </AuthShell>
  )
}

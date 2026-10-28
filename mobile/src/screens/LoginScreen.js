import React, { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import useAutoClear from '../hooks/useAutoClear'
import { AuthHeader, AuthShell, AuthSubmit, AuthSwitcher } from '../components/AuthLayout'
import { Field, FormError, TextField } from '../components/ui'

export default function LoginScreen ({ navigation }) {
  const { login } = useAuth()
  const [form, setForm] = useState({ email: 'admin@seatsync.local', password: 'admin123' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useAutoClear(error, useCallback(() => setError(''), []))

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      await login(form)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <AuthHeader
        eyebrow='Welcome back'
        title='SeatSync'
        description='Sign in to manage campus scheduling, rooms, and academic planning.'
      />
      <AuthSwitcher active='login' onSignup={() => navigation.navigate('Register')} />
      <View style={{ gap: 18 }}>
        <Field label='Email' tone='text'>
          <TextField
            value={form.email}
            onChangeText={email => setForm(c => ({ ...c, email }))}
            placeholder='you@university.edu'
            keyboardType='email-address'
            autoComplete='email'
          />
        </Field>
        <Field label='Password' tone='text'>
          <TextField
            value={form.password}
            onChangeText={password => setForm(c => ({ ...c, password }))}
            placeholder='Enter password'
            secureTextEntry
            autoComplete='password'
          />
        </Field>
        <FormError>{error}</FormError>
        <AuthSubmit title={loading ? 'Signing in...' : 'Log in'} onPress={handleSubmit} disabled={loading} />
      </View>
    </AuthShell>
  )
}

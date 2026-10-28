import React, { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import useAutoClear from '../hooks/useAutoClear'
import { AuthHeader, AuthShell, AuthSubmit, AuthSwitcher } from '../components/AuthLayout'
import { Field, FormError, TextField } from '../components/ui'
import Select from '../components/Select'

const roleOptions = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'CLASS_REP', label: 'Class representative' },
  { value: 'LECTURER', label: 'Lecturer' }
]

export default function RegisterScreen ({ navigation }) {
  const { register } = useAuth()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneNumber: '',
    role: 'STUDENT'
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useAutoClear(error, useCallback(() => setError(''), []))

  const set = key => value => setForm(current => ({ ...current, [key]: value }))

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      setError('First name, last name, email, and password are required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await register({ ...form })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <AuthHeader
        eyebrow='Create account'
        title='SeatSync'
        description='Register to start managing campus access and academic schedules.'
      />
      <AuthSwitcher active='signup' onLogin={() => navigation.navigate('Login')} />
      <View style={{ gap: 18 }}>
        <Field label='First name' tone='text'>
          <TextField value={form.firstName} onChangeText={set('firstName')} placeholder='Your first name' autoCapitalize='words' />
        </Field>
        <Field label='Last name' tone='text'>
          <TextField value={form.lastName} onChangeText={set('lastName')} placeholder='Your last name' autoCapitalize='words' />
        </Field>
        <Field label='Email' tone='text'>
          <TextField value={form.email} onChangeText={set('email')} placeholder='you@university.edu' keyboardType='email-address' autoComplete='email' />
        </Field>
        <Field label='Phone number' tone='text'>
          <TextField value={form.phoneNumber} onChangeText={set('phoneNumber')} placeholder='080xxxxxxxx' keyboardType='phone-pad' />
        </Field>
        <Field label='Password' tone='text'>
          <TextField value={form.password} onChangeText={set('password')} placeholder='Create password' secureTextEntry />
        </Field>
        <Field label='Role' tone='text'>
          <Select value={form.role} options={roleOptions} onChange={set('role')} searchable={false} />
        </Field>
        <FormError>{error}</FormError>
        <AuthSubmit title={loading ? 'Creating account...' : 'Create account'} onPress={handleSubmit} disabled={loading} />
      </View>
    </AuthShell>
  )
}

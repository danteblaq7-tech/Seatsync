import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage () {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneNumber: '',
    role: 'STUDENT'
  })
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  useEffect(() => {
    if (!error) return undefined
    const timeout = setTimeout(() => setError(''), 5000)
    return () => clearTimeout(timeout)
  }, [error])
  const [loading, setLoading] = useState(false)

  const handleChange = event => {
    const { name, value, type, checked } = event.target
    setForm(current => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        phoneNumber: form.phoneNumber,
        role: form.role
      })
      navigate('/dashboard', { replace: true })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='auth-shell'>
      <div className='auth-card'>
        <div className='auth-header'>
          <p className='eyebrow'>Create account</p>
          <h1>SeatSync</h1>
          <p className='muted'>
            Register to start managing campus access and academic schedules.
          </p>
        </div>

        <div className='auth-switcher'>
          <Link to='/login' className='auth-switch'>
            Login
          </Link>
          <button type='button' className='auth-switch active'>
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className='auth-form'>
          <label>
            First name
            <input
              type='text'
              name='firstName'
              value={form.firstName}
              onChange={handleChange}
              placeholder='Your first name'
              required
            />
          </label>

          <label>
            Last name
            <input
              type='text'
              name='lastName'
              value={form.lastName}
              onChange={handleChange}
              placeholder='Your last name'
              required
            />
          </label>

          <label>
            Email
            <input
              type='email'
              name='email'
              value={form.email}
              onChange={handleChange}
              placeholder='you@university.edu'
              required
            />
          </label>

          <label>
            Phone number
            <input
              type='tel'
              name='phoneNumber'
              value={form.phoneNumber}
              onChange={handleChange}
              placeholder='080xxxxxxxx'
            />
          </label>

          <label>
            Password
            <div className='password-field'>
              <input
                type={showPassword ? 'text' : 'password'}
                name='password'
                value={form.password}
                onChange={handleChange}
                placeholder='Create password'
                required
              />
              <button
                type='button'
                className='password-toggle'
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(value => !value)}
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
              </button>
            </div>
          </label>

          <label>
            Role
            <select name='role' value={form.role} onChange={handleChange}>
              <option value='STUDENT'>Student</option>
              <option value='CLASS_REP'>Class representative</option>
              <option value='LECTURER'>Lecturer</option>
            </select>
          </label>

          {error && <p className='form-error'>{error}</p>}

          <button type='submit' disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}

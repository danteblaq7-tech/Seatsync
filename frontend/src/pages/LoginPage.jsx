import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { useAuth } from '../context/AuthContext'

export default function LoginPage () {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: 'admin@seatsync.local',
    password: 'admin123'
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
    const { name, value } = event.target
    setForm(current => ({ ...current, [name]: value }))
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      await login(form)
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
          <p className='eyebrow'>Welcome back</p>
          <h1>SeatSync</h1>
          <p className='muted'>
            Sign in to manage campus scheduling, rooms, and academic planning.
          </p>
        </div>

        <div className='auth-switcher'>
          <button type='button' className='auth-switch active'>
            Login
          </button>
          <Link to='/register' className='auth-switch'>
            Sign up
          </Link>
        </div>

        <form onSubmit={handleSubmit} className='auth-form'>
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
            Password
            <div className='password-field'>
              <input
                type={showPassword ? 'text' : 'password'}
                name='password'
                value={form.password}
                onChange={handleChange}
                placeholder='Enter password'
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

          {error && <p className='form-error'>{error}</p>}

          <button type='submit' disabled={loading}>
            {loading ? 'Signing in...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}

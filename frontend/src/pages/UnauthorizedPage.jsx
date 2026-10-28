import { Link } from 'react-router-dom'

export default function UnauthorizedPage () {
  return (
    <div className='auth-shell'>
      <div className='auth-card'>
        <div className='auth-header'>
          <p className='eyebrow'>Access denied</p>
          <h1>Unauthorized</h1>
          <p className='muted'>
            You do not have the required permissions to view this page.
          </p>
        </div>

        <div className='auth-form'>
          <Link to='/dashboard' className='cta-link'>
            Return to dashboard
          </Link>
          <Link to='/login' className='secondary-link'>
            Log in with another account
          </Link>
        </div>
      </div>
    </div>
  )
}

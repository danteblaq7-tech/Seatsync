import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import ProfileCompletionModal from '../components/ProfileCompletionModal'

export default function StudentAcademicProfilePage () {
  const { user } = useAuth()
  const roles = Array.isArray(user?.roles) ? user.roles : []
  const role = roles.includes('CLASS_REP') ? 'CLASS_REP' : 'STUDENT'
  const {
    data: status,
    isLoading: statusLoading,
    error: statusError
  } = useQuery({
    queryKey: ['profile-status', user?.id],
    queryFn: async () => (await api.get('/api/auth/profile-status')).data,
    enabled: Boolean(user?.id)
  })
  const {
    data: academicProfile,
    isLoading: profileLoading,
    error
  } = useQuery({
    queryKey: ['student-academic-profile', user?.id],
    queryFn: async () => (await api.get('/api/auth/student-profile')).data,
    enabled: Boolean(user?.id && status?.complete)
  })

  if (statusLoading || (status?.complete && profileLoading)) {
    return (
      <div className='page-shell'>
        <section className='content-panel'>Loading academic information...</section>
      </div>
    )
  }
  if (statusError || error) {
    return (
      <div className='page-shell'>
        <section className='content-panel'>
          <p className='form-error'>
            {statusError?.message ||
              error?.message ||
              'Unable to load your academic information.'}
          </p>
        </section>
      </div>
    )
  }

  if (!status?.complete) {
    return (
      <div className='page-shell'>
        <div className='page-header'>
          <div>
            <p className='eyebrow'>Complete academic profile</p>
            <h1>My academic details</h1>
            <p>Complete these details before using the academic workspace.</p>
          </div>
        </div>
        {status?.needsResubmission && (
          <section className='content-panel'>
            <p>
              Your previous request was not approved. Update your academic
              information in the profile dialog and submit it again.
            </p>
          </section>
        )}
      </div>
    )
  }

  const details = academicProfile || {}
  const student = details.student || {}
  const pendingRequest =
    role === 'CLASS_REP'
      ? details.cohortProfileRequest
      : details.membershipRequest
  const profileSource =
    pendingRequest?.status === 'PENDING' ||
    pendingRequest?.status === 'REJECTED'
      ? pendingRequest
      : student
  const initialProfile = profileSource
    ? {
        facultyId: profileSource.faculty_id,
        departmentId: profileSource.department_id,
        programmeId: profileSource.programme_id,
        academicYearId: profileSource.academic_year_id,
        intakeYear: profileSource.intake_year,
        cohortTypeId: profileSource.cohort_type_id,
        studentCount:
          profileSource.student_count ?? profileSource.cohort_student_count
      }
    : undefined

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Complete academic profile</p>
          <h1>My academic details</h1>
          <p>
            Update your faculty, programme, cohort, intake year, and current
            academic period.
          </p>
        </div>
      </div>
      {pendingRequest?.status === 'PENDING' && (
        <section className='content-panel'>
          <p>
            {role === 'CLASS_REP'
              ? 'Your cohort profile is awaiting administrator approval.'
              : 'Your cohort membership/profile changes are awaiting approval.'}
          </p>
        </section>
      )}
      {pendingRequest?.status === 'REJECTED' && (
        <section className='content-panel'>
          <p>
            Your request was not approved. Update the details below and submit
            them again.
          </p>
        </section>
      )}
      <ProfileCompletionModal
        role={role}
        variant='page'
        initialProfile={initialProfile}
        editing
        lockCohortIdentity={Boolean(role === 'CLASS_REP' && student.cohort_id)}
      />
    </div>
  )
}

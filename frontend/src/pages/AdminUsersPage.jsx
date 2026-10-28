import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import ConfirmActionModal from '../components/ConfirmActionModal'
import PaginationControls from '../components/PaginationControls'

const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

export default function AdminUsersPage () {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('name')
  const [direction, setDirection] = useState('asc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [userToBlock, setUserToBlock] = useState(null)
  const [blockError, setBlockError] = useState('')

  const {
    data: result = {},
    isLoading,
    error
  } = useQuery({
    queryKey: [
      'admin-users',
      search,
      role,
      status,
      sort,
      direction,
      page,
      limit
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        search,
        role: role === 'all' ? '' : role,
        status: status === 'all' ? '' : status,
        sort,
        direction,
        page: String(page),
        limit: String(limit)
      })
      return api.get(`/api/users?${params}`)
    }
  })
  const users = Array.isArray(result.data) ? result.data : toArray(result)
  const pagination = result.pagination || {}

  const blockMutation = useMutation({
    mutationFn: async ({ id, isActive }) =>
      api.patch(`/api/users/${id}/status`, { is_active: isActive }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
      ])
      setUserToBlock(null)
    },
    onError: error =>
      setBlockError(error.message || 'Unable to update account access.')
  })

  const updateFilter = setter => event => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <div className='page-shell'>
      <div className='page-header'>
        <div>
          <p className='eyebrow'>Administration</p>
          <h1>User management</h1>
          <p>Search, filter, sort, paginate, and manage account access.</p>
        </div>
      </div>

      <section className='content-panel table-panel'>
        <div className='filter-row academic-list-filters'>
          <input
            type='search'
            value={search}
            onChange={updateFilter(setSearch)}
            placeholder='Search name, email, or phone'
          />
          <select value={role} onChange={updateFilter(setRole)}>
            <option value='all'>All roles</option>
            {['ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'].map(value => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <select value={status} onChange={updateFilter(setStatus)}>
            <option value='all'>All account statuses</option>
            <option value='active'>Active</option>
            <option value='blocked'>Blocked</option>
          </select>
          <select value={sort} onChange={updateFilter(setSort)}>
            <option value='name'>Sort by name</option>
            <option value='email'>Sort by email</option>
            <option value='role'>Sort by role</option>
            <option value='status'>Sort by status</option>
            <option value='created'>Sort by created date</option>
          </select>
          <button
            type='button'
            className='secondary-button'
            onClick={() => {
              setDirection(value => (value === 'asc' ? 'desc' : 'asc'))
              setPage(1)
            }}
          >
            {direction === 'asc' ? 'Ascending' : 'Descending'}
          </button>
        </div>
        {isLoading ? (
          <p>Loading users...</p>
        ) : error ? (
          <p className='form-error'>Unable to load users.</p>
        ) : (
          <div className='academic-records-scroll user-records-scroll'>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length ? (
                  users.map(user => (
                    <tr key={user.id ?? user.email}>
                      <td>
                        {`${user.firstName || user.first_name || ''} ${
                          user.lastName || user.last_name || ''
                        }`.trim() || 'Unknown user'}
                      </td>
                      <td>{user.email || 'N/A'}</td>
                      <td>
                        {Array.isArray(user.roles) && user.roles.length
                          ? user.roles.join(', ')
                          : user.role || 'USER'}
                      </td>
                      <td>
                        {user.isActive ?? user.is_active ? 'Active' : 'Blocked'}
                      </td>
                      <td>
                        <button
                          type='button'
                          className={
                            user.isActive ?? user.is_active
                              ? 'table-action danger'
                              : 'table-action'
                          }
                          disabled={
                            blockMutation.isPending ||
                            Number(user.id) === Number(currentUser?.id)
                          }
                          onClick={() => setUserToBlock(user)}
                          title={
                            Number(user.id) === Number(currentUser?.id)
                              ? 'You cannot block your own account'
                              : undefined
                          }
                        >
                          {user.isActive ?? user.is_active
                            ? 'Block'
                            : 'Unblock'}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan='5'>No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={pagination.page || page}
          pageSize={pagination.limit || limit}
          totalItems={pagination.totalItems || 0}
          totalPages={pagination.totalPages || 1}
          onPageChange={setPage}
          onPageSizeChange={size => {
            setLimit(size)
            setPage(1)
          }}
        />
      </section>
      {userToBlock &&
        (() => {
          const isActive = Boolean(
            userToBlock.isActive ?? userToBlock.is_active
          )
          const displayName =
            `${userToBlock.firstName || userToBlock.first_name || ''} ${
              userToBlock.lastName || userToBlock.last_name || ''
            }`.trim() || userToBlock.email
          return (
            <ConfirmActionModal
              title={`${isActive ? 'Block' : 'Unblock'} this user?`}
              eyebrow='Account access change'
              message={
                isActive
                  ? `${displayName} will be signed out from future sessions and will not be able to sign in until unblocked.`
                  : `${displayName} will be able to sign in again.`
              }
              confirmLabel={isActive ? 'Block account' : 'Unblock account'}
              errorMessage={blockError}
              isPending={blockMutation.isPending}
              onCancel={() => {
                setUserToBlock(null)
                setBlockError('')
              }}
              onConfirm={() => {
                setBlockError('')
                blockMutation.mutate({
                  id: userToBlock.id,
                  isActive: !isActive
                })
              }}
            />
          )
        })()}
    </div>
  )
}

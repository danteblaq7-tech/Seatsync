import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { qs, toArray } from '../utils/data'
import ConfirmActionModal from '../components/ConfirmActionModal'
import DataTable from '../components/DataTable'
import PaginationControls from '../components/PaginationControls'
import Select from '../components/Select'
import {
  FilterRow,
  FormError,
  P,
  PageHeader,
  Panel,
  Screen,
  SecondaryButton,
  TableAction,
  DangerAction,
  TextField
} from '../components/ui'

const roles = ['ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP']

export default function AdminUsersScreen () {
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

  const { data: result = {}, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['admin-users', search, role, status, sort, direction, page, limit],
    queryFn: () =>
      api.get(
        `/api/users?${qs({
          search,
          role: role === 'all' ? '' : role,
          status: status === 'all' ? '' : status,
          sort,
          direction,
          page,
          limit
        })}`
      )
  })
  const users = Array.isArray(result.data) ? result.data : toArray(result)
  const pagination = result.pagination || {}

  const blockMutation = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/api/users/${id}/status`, { is_active: isActive }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
      ])
      setUserToBlock(null)
    },
    onError: err => setBlockError(err.message || 'Unable to update account access.')
  })

  const filter = setter => value => {
    setter(value)
    setPage(1)
  }

  const isActiveOf = u => Boolean(u.isActive ?? u.is_active)
  const nameOf = u =>
    `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || 'Unknown user'

  const columns = [
    { key: 'name', label: 'Name', width: 170, value: nameOf },
    { key: 'email', label: 'Email', width: 220, value: u => u.email || 'N/A' },
    {
      key: 'role',
      label: 'Role',
      width: 140,
      value: u => (Array.isArray(u.roles) && u.roles.length ? u.roles.join(', ') : u.role || 'USER')
    },
    { key: 'status', label: 'Status', width: 100, value: u => (isActiveOf(u) ? 'Active' : 'Blocked') },
    {
      key: 'actions',
      label: 'Actions',
      width: 110,
      render: u => {
        const isSelf = Number(u.id) === Number(currentUser?.id)
        const Btn = isActiveOf(u) ? DangerAction : TableAction
        return (
          <Btn
            title={isActiveOf(u) ? 'Block' : 'Unblock'}
            disabled={blockMutation.isPending || isSelf}
            onPress={() => setUserToBlock(u)}
          />
        )
      }
    }
  ]

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader
        eyebrow='Administration'
        title='User management'
        description='Search, filter, sort, paginate, and manage account access.'
      />

      <Panel>
        <FilterRow style={{ marginBottom: 16 }}>
          <TextField value={search} onChangeText={filter(setSearch)} placeholder='Search name, email, or phone' />
          <Select
            value={role}
            onChange={filter(setRole)}
            searchable={false}
            options={[{ value: 'all', label: 'All roles' }, ...roles.map(r => ({ value: r, label: r.replaceAll('_', ' ') }))]}
          />
          <Select
            value={status}
            onChange={filter(setStatus)}
            searchable={false}
            options={[
              { value: 'all', label: 'All account statuses' },
              { value: 'active', label: 'Active' },
              { value: 'blocked', label: 'Blocked' }
            ]}
          />
          <Select
            value={sort}
            onChange={filter(setSort)}
            searchable={false}
            options={[
              { value: 'name', label: 'Sort by name' },
              { value: 'email', label: 'Sort by email' },
              { value: 'role', label: 'Sort by role' },
              { value: 'status', label: 'Sort by status' },
              { value: 'created', label: 'Sort by created date' }
            ]}
          />
          <SecondaryButton
            title={direction === 'asc' ? 'Ascending' : 'Descending'}
            onPress={() => {
              setDirection(v => (v === 'asc' ? 'desc' : 'asc'))
              setPage(1)
            }}
          />
        </FilterRow>

        {isLoading ? (
          <P>Loading users...</P>
        ) : error ? (
          <FormError style={{ marginVertical: 16 }}>Unable to load users.</FormError>
        ) : (
          <DataTable columns={columns} rows={users} rowKey={u => u.id ?? u.email} emptyText='No users found.' maxHeight={520} showsHorizontalScrollIndicator={false} />
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
      </Panel>

      {userToBlock && (() => {
        const isActive = isActiveOf(userToBlock)
        const displayName = nameOf(userToBlock) === 'Unknown user' ? userToBlock.email : nameOf(userToBlock)
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
              blockMutation.mutate({ id: userToBlock.id, isActive: !isActive })
            }}
          />
        )
      })()}
    </Screen>
  )
}

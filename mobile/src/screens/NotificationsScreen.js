import React, { useMemo, useState } from 'react'
import { View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { colors, type } from '../theme'
import { toArray } from '../utils/data'
import { Text } from '../components/Typography'
import {
  Badge,
  FilterRow,
  FormError,
  P,
  PageHeader,
  Panel,
  Screen,
  SecondaryButton,
  TextField
} from '../components/ui'

export default function NotificationsScreen () {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const { data = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => toArray(await api.get('/api/notifications'))
  })

  const filteredRows = useMemo(
    () =>
      (data || []).filter(item =>
        `${item.title || ''} ${item.message || ''}`.toLowerCase().includes(search.toLowerCase())
      ),
    [data, search]
  )

  const markRead = async id => {
    try {
      await api.patch(`/api/notifications/${id}/read`, {})
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch (err) {
      console.error('Failed to mark notification read:', err)
    }
  }

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader eyebrow='Communication' title='Notifications' />

      <Panel>
        <FilterRow>
          <TextField value={search} onChangeText={setSearch} placeholder='Search notifications' />
        </FilterRow>
      </Panel>

      <Panel>
        {isLoading ? (
          <P>Loading notifications...</P>
        ) : error ? (
          <FormError style={{ marginVertical: 16 }}>Unable to load notifications.</FormError>
        ) : filteredRows.length ? (
          <View style={{ marginTop: 4 }}>
            {filteredRows.map((item, index) => (
              <View
                key={item.id ?? item.title ?? item.message}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  paddingVertical: 12,
                  borderBottomWidth: index === filteredRows.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[type.body, { fontWeight: '700' }]}>{item.title || item.type || 'Notification'}</Text>
                  <Text style={type.body}>{item.message || 'No detail provided.'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 7 }}>
                  <Badge tone={item.read ? 'ok' : 'warn'}>{item.read ? 'Read' : 'New'}</Badge>
                  {!item.read && <SecondaryButton title='Mark read' onPress={() => markRead(item.id)} />}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ gap: 4, paddingVertical: 12 }}>
            <Text style={[type.body, { fontWeight: '700' }]}>No notifications</Text>
            <Text style={type.body}>There are no notifications to display.</Text>
          </View>
        )}
      </Panel>
    </Screen>
  )
}

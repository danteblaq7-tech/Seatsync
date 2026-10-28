import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { toObject } from '../utils/data'
import {
  FormError,
  H2,
  P,
  PageHeader,
  Panel,
  Screen,
  SimpleList,
  SimpleListItem,
  StatCard,
  StatsGrid
} from '../components/ui'

export default function DashboardScreen () {
  const { user } = useAuth()
  const {
    data: summary = {},
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['dashboard-summary', user?.roles?.join(',')],
    queryFn: async () => {
      const response = await api.get('/api/dashboard')
      return toObject(response?.data ?? response)
    }
  })

  const cards = Array.isArray(summary.stats) ? summary.stats : []
  const lists = summary.lists || {}

  const renderList = (items = [], emptyLabel = 'No data') => {
    if (!items.length) return <SimpleListItem title={emptyLabel} value='--' last />
    const visible = items.slice(0, 5)
    return visible.map((item, index) => {
      const title =
        (item.action
          ? `${String(item.action).replaceAll('_', ' ')} · ${String(item.entity_type || item.entityType || 'record').replaceAll('_', ' ')}`
          : null) ||
        item.title ||
        item.name ||
        item.course_name ||
        item.courseName ||
        item.message ||
        `Item ${index + 1}`
      const value =
        (item.action
          ? `${[item.first_name, item.last_name].filter(Boolean).join(' ') || 'System'} · ${
              item.created_at ? new Date(item.created_at).toLocaleString() : ''
            }`
          : null) ||
        item.value ||
        item.venue_name ||
        item.venueName ||
        item.start_time ||
        item.startTime ||
        item.exam_date ||
        item.examDate ||
        item.day_of_week ||
        item.dayOfWeek ||
        'N/A'
      return (
        <SimpleListItem
          key={`${title}-${value}-${index}`}
          title={title}
          value={String(value)}
          last={index === visible.length - 1}
        />
      )
    })
  }

  const isLecturer = summary.role === 'LECTURER'

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <PageHeader eyebrow='Overview' title='Dashboard' />

      {isLoading ? (
        <Panel><P>Loading dashboard data...</P></Panel>
      ) : error ? (
        <Panel><FormError>Unable to load dashboard data.</FormError></Panel>
      ) : (
        <>
          <StatsGrid>
            {cards.map(card => (
              <StatCard key={card.label} label={card.label} value={card.value} />
            ))}
          </StatsGrid>

          <Panel>
            <H2>{isLecturer ? "Today's classes" : 'Recent items'}</H2>
            <SimpleList>
              {renderList(
                isLecturer ? lists.todaysClasses || [] : lists.recentTimetableChanges || lists.upcomingClasses || [],
                isLecturer ? 'No classes scheduled today' : 'No recent items'
              )}
            </SimpleList>
          </Panel>
          <Panel>
            <H2>{isLecturer ? 'Upcoming teaching' : 'Upcoming exams'}</H2>
            <SimpleList>
              {renderList(
                isLecturer ? lists.upcomingClasses || [] : lists.upcomingExams || [],
                isLecturer ? 'No upcoming teaching' : 'No upcoming exams'
              )}
            </SimpleList>
          </Panel>
          {isLecturer && (
            <>
              <Panel>
                <H2>Available venues</H2>
                <SimpleList>
                  {renderList(lists.venueAvailability || [], 'No venues are available right now')}
                </SimpleList>
              </Panel>
              <Panel>
                <H2>Occupied venues</H2>
                <SimpleList>
                  {renderList(lists.occupiedVenues || [], 'No venues are occupied right now')}
                </SimpleList>
              </Panel>
            </>
          )}
        </>
      )}
    </Screen>
  )
}

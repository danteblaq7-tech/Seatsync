import React from 'react'
import { View } from 'react-native'
import { colors, type } from '../theme'
import { Text } from './Typography'
import { SecondaryButton } from './ui'
import Select from './Select'

/** Phone layout of .pagination-controls: stacked, 14px gap, inner row spaced between */
export default function PaginationControls ({
  page = 1,
  pageSize = 20,
  totalItems = 0,
  totalPages = 1,
  onPageChange,
  onPageSizeChange
}) {
  const label =
    totalItems === 0
      ? 'No records'
      : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalItems)} of ${totalItems}`

  return (
    <View style={{ marginTop: 16, gap: 14, alignItems: 'flex-start' }}>
      <Text style={[type.body, { color: colors.muted }]}>{label}</Text>
      <View style={{ alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[type.body, { color: colors.muted, fontSize: 13.12 }]}>Rows</Text>
          <Select
            compact
            value={String(pageSize)}
            searchable={false}
            options={[10, 20, 50, 100].map(size => ({ value: String(size), label: String(size) }))}
            onChange={value => onPageSizeChange(Number(value))}
            style={{ minWidth: 80 }}
          />
        </View>
        <SecondaryButton title='Previous' onPress={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} />
        <Text style={[type.body, { color: colors.muted, fontSize: 13.12 }]}>
          Page {page} of {totalPages}
        </Text>
        <SecondaryButton title='Next' onPress={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} />
      </View>
    </View>
  )
}

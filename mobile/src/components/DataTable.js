import React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { colors, layout, type } from '../theme'
import { Text } from './Typography'

/**
 * Port of the web `.table-panel table`:
 *  - scrolls horizontally, min width 700
 *  - cells padded 12 / 10 with a 1px bottom border
 *  - long values are truncated on one line (web: max-width 260 + ellipsis)
 *
 * columns: [{ key, label, width = 150, render?(row, index), value?(row), align? }]
 * `maxHeight` reproduces `.academic-records-scroll` (sticky header, internal vertical scroll).
 */
export default function DataTable ({
  columns = [],
  rows = [],
  rowKey,
  minWidth = layout.tableMinWidth,
  maxHeight,
  emptyText = 'No records found.',
  headVariant = 'bold',
  showsHorizontalScrollIndicator = true,
  rowBackground
}) {
  const total = Math.max(
    minWidth,
    columns.reduce((sum, c) => sum + (c.width ?? 150), 0)
  )
  const scale = total / columns.reduce((sum, c) => sum + (c.width ?? 150), 0)

  const head = (
    <View style={[styles.row, { backgroundColor: colors.tableHeadBg, borderBottomColor: colors.border }]}>
      {columns.map(column => (
        <View key={column.key} style={[styles.cell, { width: (column.width ?? 150) * scale }]}>
          <Text
            numberOfLines={1}
            style={headVariant === 'caps' ? type.tableHead : [type.body, { fontWeight: '700' }]}
          >
            {column.label}
          </Text>
        </View>
      ))}
    </View>
  )

  const body = rows.length ? (
    rows.map((row, index) => (
      <View
        key={rowKey ? rowKey(row, index) : row.id ?? index}
        style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }, rowBackground ? { backgroundColor: rowBackground(row) } : null]}
      >
        {columns.map(column => {
          const content = column.render
            ? column.render(row, index)
            : column.value
            ? column.value(row)
            : row[column.key]
          const isNode = React.isValidElement(content)
          const text = content === null || content === undefined || content === '' ? '—' : String(content)
          return (
            <View key={column.key} style={[styles.cell, { width: (column.width ?? 150) * scale }, column.cellStyle]}>
              {isNode ? (
                content
              ) : (
                <Text numberOfLines={column.lines ?? 1} style={[type.body, column.align === 'right' && { textAlign: 'right' }]}>
                  {text}
                </Text>
              )}
            </View>
          )
        })}
      </View>
    ))
  ) : (
    <View style={[styles.row, { width: '100%' }]}>
      <View style={[styles.cell, { width: total }]}>
        <Text style={type.body}>{emptyText}</Text>
      </View>
    </View>
  )

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      style={{ maxWidth: '100%' }}
      contentContainerStyle={{ minWidth: '100%' }}
    >
      <View style={{ width: total }}>
        {maxHeight ? (
          <ScrollView nestedScrollEnabled style={{ maxHeight }} stickyHeaderIndices={[0]} showsVerticalScrollIndicator={false}>
            {head}
            <View>{body}</View>
          </ScrollView>
        ) : (
          <>
            {head}
            {body}
          </>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  cell: {
    paddingVertical: layout.tableCellPad.v,
    paddingHorizontal: layout.tableCellPad.h,
    justifyContent: 'center'
  }
})

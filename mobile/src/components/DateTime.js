import React, { useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, layout, radius, shadow, type } from '../theme'
import { Text } from './Typography'

/**
 * Replacements for <input type='date'> and <input type='time'>.
 * They keep the web's string formats so API payloads are unchanged:
 *   DateField -> 'YYYY-MM-DD'      TimeField -> 'HH:MM'
 */

const pad = n => String(n).padStart(2, '0')

const parseDate = value => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!m) return new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
}
const parseTime = value => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''))
  const d = new Date()
  d.setHours(m ? Number(m[1]) : 8, m ? Number(m[2]) : 0, 0, 0)
  return d
}
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`

function PickerField ({ mode, value, onChange, placeholder, disabled, style, minuteInterval }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const insets = useSafeAreaInsets()
  const current = mode === 'date' ? parseDate(value) : parseTime(value)
  const format = mode === 'date' ? fmtDate : fmtTime

  const handleChange = (event, selected) => {
    if (Platform.OS === 'android') {
      setOpen(false)
      if (event?.type === 'set' && selected) onChange(format(selected))
      return
    }
    if (selected) setDraft(selected)
  }

  return (
    <>
      <Pressable
        accessibilityRole='button'
        disabled={disabled}
        onPress={() => {
          setDraft(current)
          setOpen(true)
        }}
        style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }, disabled && { opacity: 0.55 }, style]}
      >
        <Text style={[styles.fieldText, { color: value ? colors.text : colors.muted }]}>
          {value || placeholder || (mode === 'date' ? 'Select date' : 'Select time')}
        </Text>
        <Text style={styles.icon}>{mode === 'date' ? '📅' : '🕒'}</Text>
      </Pressable>

      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={current}
          mode={mode}
          is24Hour
          minuteInterval={minuteInterval}
          onChange={handleChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType='slide' onRequestClose={() => setOpen(false)}>
          <View style={[styles.backdrop, { backgroundColor: colors.backdrop }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
            <View style={[styles.sheet, { paddingBottom: 12 + insets.bottom, backgroundColor: colors.surface, ...shadow }]}>
              <DateTimePicker
                value={draft || current}
                mode={mode}
                display='spinner'
                is24Hour
                minuteInterval={minuteInterval}
                onChange={handleChange}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => {
                    onChange('')
                    setOpen(false)
                  }}
                  style={[styles.sheetButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                >
                  <Text style={[type.button, { color: colors.text }]}>Clear</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onChange(format(draft || current))
                    setOpen(false)
                  }}
                  style={[styles.sheetButton, { backgroundColor: colors.primaryActionBg, borderColor: colors.primaryActionBg }]}
                >
                  <Text style={[type.button, { color: colors.primaryActionText }]}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  )
}

export const DateField = props => <PickerField mode='date' {...props} />
export const TimeField = props => <PickerField mode='time' {...props} />

const styles = StyleSheet.create({
  field: {
    minHeight: layout.inputMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.input,
    paddingVertical: layout.inputPad.v,
    paddingHorizontal: layout.inputPad.h
  },
  fieldText: {
    flex: 1,
    fontFamily: 'Lexend_400Regular',
    fontSize: layout.inputFont,
    lineHeight: 20,
    color: colors.text
  },
  icon: { fontSize: 14 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 12,
    gap: 8,
    ...shadow
  },
  sheetButton: {
    flex: 1,
    minHeight: layout.buttonMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.button
  }
})

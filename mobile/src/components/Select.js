import React, { useMemo, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, layout, radius, shadow, type } from '../theme'
import { Text } from './Typography'

/**
 * Replaces <select>, ScrollableSelect and SearchableSelect.
 * Opens a bottom sheet with an optional search box (like the web's dropdown menu).
 *
 * options: [{ value, label, searchText? }]
 *   emptyLabel   – adds a first row that clears the value (the web's <option value=''>…)
 *   searchable   – defaults to true when there are more than 7 options
 *   multiple     – value is an array of strings (SearchableSelect `multiple`)
 *   variant      – 'field' (<select> look) | 'scrollable' (.scrollable-select-trigger look)
 */
export default function Select ({
  value = '',
  options = [],
  onChange,
  placeholder = 'Select an option',
  emptyLabel,
  searchPlaceholder = 'Search options',
  searchable,
  multiple = false,
  disabled = false,
  variant = 'field',
  title,
  style,
  compact = false
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const selectedValues = multiple
    ? (Array.isArray(value) ? value : []).map(String)
    : [String(value ?? '')]
  const selectedOptions = options.filter(o => selectedValues.includes(String(o.value)))
  const canSearch = searchable ?? options.length > 7

  const needle = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      needle
        ? options.filter(o => `${o.label ?? ''} ${o.searchText ?? ''}`.toLowerCase().includes(needle))
        : options,
    [options, needle]
  )

  const triggerLabel = multiple
    ? selectedOptions.length
      ? selectedOptions.map(o => o.label).join(', ')
      : placeholder
    : selectedOptions[0]?.label || emptyLabel || placeholder

  const close = () => {
    setOpen(false)
    setSearch('')
  }

  const pick = option => {
    const v = String(option.value)
    if (multiple) {
      onChange(selectedValues.includes(v) ? selectedValues.filter(x => x !== v) : [...selectedValues, v])
      return
    }
    onChange(v)
    close()
  }

  const rows = emptyLabel !== undefined && !multiple ? [{ value: '', label: emptyLabel, __empty: true }, ...visible] : visible
  const isPlaceholder = !selectedOptions.length

  return (
    <>
      <Pressable
        accessibilityRole='combobox'
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          variant === 'scrollable' ? styles.triggerScrollable : styles.triggerField,
          { backgroundColor: colors.surface, borderColor: colors.border },
          compact && { minWidth: 72 },
          disabled && { opacity: 0.55 },
          style
        ]}
      >
        <Text numberOfLines={1} style={[styles.triggerText, { color: isPlaceholder ? colors.muted : colors.text }]}>
          {triggerLabel}
        </Text>
        <Text style={[styles.chevron, { color: colors.muted }]}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType='slide' onRequestClose={close} statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.backdrop, { backgroundColor: colors.backdrop }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel='Close options' />
            <View style={[styles.sheet, {
              maxHeight: height * 0.7,
              paddingBottom: 8 + insets.bottom,
              backgroundColor: colors.surface,
              ...shadow
            }]}>
              {!!title && <Text style={[type.h3, { marginBottom: 8 }]}>{title}</Text>}
              {canSearch && (
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={colors.muted}
                  autoCorrect={false}
                  autoCapitalize='none'
                  style={[styles.search, {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.surface,
                    fontFamily: 'Lexend_400Regular'
                  }]}
                />
              )}
              <FlatList
                data={rows}
                keyExtractor={(item, index) => `${item.value}-${index}`}
                keyboardShouldPersistTaps='handled'
                style={{ maxHeight: Math.max(layout.selectMenuMax, height * 0.45) }}
                ListEmptyComponent={
                  <Text style={[type.body, { color: colors.muted, padding: 8 }]}>No matching options.</Text>
                }
                renderItem={({ item }) => {
                  const selected = item.__empty
                    ? !selectedOptions.length
                    : selectedValues.includes(String(item.value))
                  return (
                    <Pressable
                      accessibilityRole='menuitem'
                      accessibilityState={{ selected }}
                      onPress={() => (item.__empty ? (onChange(''), close()) : pick(item))}
                      style={[styles.option, selected && { backgroundColor: colors.surfaceMuted }]}
                    >
                      {multiple && <Text style={[styles.optionTick, { color: colors.accent }]}>{selected ? '☑' : '☐'}</Text>}
                      <Text style={[type.body, { flex: 1 }]}>{item.label}</Text>
                      {!multiple && selected && <Text style={[styles.optionTick, { color: colors.accent }]}>✓</Text>}
                    </Pressable>
                  )
                }}
              />
              {multiple && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable
                    disabled={!selectedValues.length}
                    onPress={() => onChange([])}
                    style={[styles.sheetButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, !selectedValues.length && { opacity: 0.75 }]}
                  >
                    <Text style={[type.button, { color: colors.text }]}>Clear selection</Text>
                  </Pressable>
                  <Pressable onPress={close} style={[styles.sheetButton, { backgroundColor: colors.primaryActionBg, borderColor: colors.primaryActionBg }]}>
                    <Text style={[type.button, { color: colors.primaryActionText }]}>Done</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}

const trigger = {
  minHeight: layout.inputMinHeight,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  backgroundColor: colors.surface,
  borderWidth: 1
}

const styles = StyleSheet.create({
  triggerField: {
    ...trigger,
    borderColor: colors.line,
    borderRadius: radius.input,
    paddingVertical: layout.inputPad.v,
    paddingHorizontal: layout.inputPad.h
  },
  triggerScrollable: {
    ...trigger,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  triggerText: { flex: 1, fontFamily: 'Lexend_400Regular', fontSize: layout.inputFont, lineHeight: 20, color: colors.text },
  chevron: { fontSize: 14, color: colors.muted },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 8,
    ...shadow
  },
  search: {
    minHeight: layout.inputMinHeight,
    margin: 0,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingVertical: layout.inputPad.v,
    paddingHorizontal: layout.inputPad.h,
    fontFamily: 'Lexend_400Regular',
    fontSize: layout.inputFont,
    color: colors.text,
    backgroundColor: colors.surface
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 8
  },
  optionTick: { fontSize: 16, color: colors.text },
  sheetButton: {
    flex: 1,
    minHeight: layout.buttonMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.button,
    paddingVertical: layout.buttonPad.v
  }
})

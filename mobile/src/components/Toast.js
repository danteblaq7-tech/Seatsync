import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, shadow, type } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { Text } from './Typography'

/**
 * Drop-in for react-toastify's `toast.success / error / info` calls.
 * Mount <ToastHost /> once near the root; call `toast.success('Saved')` anywhere.
 */
let enqueue = null
const push = (kind, message) => {
  if (typeof enqueue === 'function') enqueue(kind, String(message ?? ''))
}
export const toast = {
  success: m => push('success', m),
  error: m => push('error', m),
  info: m => push('info', m)
}

export function ToastHost ({ duration = 4000 }) {
  const insets = useSafeAreaInsets()
  useTheme()
  const [items, setItems] = useState([])
  const counter = useRef(0)

  const remove = useCallback(id => setItems(current => current.filter(item => item.id !== id)), [])

  useEffect(() => {
    enqueue = (kind, message) => {
      const id = ++counter.current
      setItems(current => [...current.slice(-2), { id, kind, message }])
      setTimeout(() => remove(id), duration)
    }
    return () => {
      enqueue = null
    }
  }, [duration, remove])

  return (
    <View pointerEvents='box-none' style={[styles.host, { top: insets.top + 8 }]}>
      {items.map(item => (
        <ToastItem key={item.id} item={item} onClose={() => remove(item.id)} />
      ))}
    </View>
  )
}

function ToastItem ({ item, onClose }) {
  const opacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start()
  }, [opacity])
  return (
    <Animated.View style={[
      styles.toast,
      {
        opacity,
        borderLeftColor: item.kind === 'success' ? colors.success : item.kind === 'error' ? colors.danger : colors.accent,
        backgroundColor: colors.surface,
        ...shadow
      }
    ]}>
      <Pressable onPress={onClose}>
        <Text style={[type.bodySm, { color: colors.text }]}>{item.message}</Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, gap: 8, zIndex: 999 },
  toast: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderLeftWidth: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...shadow,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  }
})

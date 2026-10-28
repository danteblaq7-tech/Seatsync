import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, BackHandler, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FontAwesome5 } from '@expo/vector-icons'
import { colors, layout, radius, type } from '../theme'
import { groupOrder, navByRole } from '../navigation/navConfig'
import { Text } from './Typography'

/**
 * The web's off-canvas mobile sidebar:
 *   width min(300, screen - 56), slides in from the left in 0.22s, dim backdrop (rgba 15,23,42,.48)
 */
export default function Sidebar ({ user, open, activeRoute, onClose, onNavigate, onLogout }) {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const drawerWidth = Math.min(layout.drawerWidth, width - layout.drawerGutter)
  const translate = useRef(new Animated.Value(-drawerWidth - 40)).current
  const fade = useRef(new Animated.Value(0)).current
  const [mounted, setMounted] = useState(open)
  const [expanded, setExpanded] = useState({})

  const roles = user?.roles || []
  const items = useMemo(() => {
    const all = roles.length ? roles.flatMap(role => navByRole[role] || []) : navByRole.STUDENT
    return Array.from(new Map(all.map(item => [item.to, item])).values())
  }, [roles])

  const groups = useMemo(
    () =>
      groupOrder
        .map(name => ({ key: name, label: name, items: items.filter(item => item.group === name) }))
        .filter(group => group.items.length),
    [items]
  )

  useEffect(() => {
    if (open) setMounted(true)
    Animated.parallel([
      Animated.timing(translate, { toValue: open ? 0 : -drawerWidth - 40, duration: 220, useNativeDriver: true }),
      Animated.timing(fade, { toValue: open ? 1 : 0, duration: 220, useNativeDriver: true })
    ]).start(() => {
      if (!open) setMounted(false)
    })
  }, [open, drawerWidth, translate, fade])

  useEffect(() => {
    if (!open) return undefined
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => sub.remove()
  }, [open, onClose])

  if (!mounted) return null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.drawerBackdrop, opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel='Close navigation menu' />
      </Animated.View>

      <Animated.View
        style={[
          styles.sidebar,
          {
            width: drawerWidth,
            paddingTop: 18 + insets.top,
            paddingBottom: 18 + insets.bottom,
            backgroundColor: colors.sidebarBg,
            borderRightColor: colors.sidebarBorder,
            transform: [{ translateX: translate }]
          }
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, gap: 14 }}>
          <View style={[styles.brandBlock, { borderBottomColor: colors.sidebarBorder }]}>
            <Pressable accessibilityLabel='Toggle sidebar' onPress={onClose}             style={[styles.menuToggle, { borderColor: colors.sidebarBorder, backgroundColor: colors.sidebarHover }]}>
            <FontAwesome5 name='times' size={16} color={colors.sidebarText} />
            </Pressable>
            <View style={{ flexShrink: 1 }}>
              <Text style={[type.eyebrow, { marginBottom: 4, color: colors.sidebarMuted }]}>Campus control</Text>
              <Text style={[type.brand, { color: colors.sidebarText }]}>SeatSync</Text>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            {groups.map(group => {
              const isExpanded = expanded[group.key] !== false
              return (
                <View key={group.key} style={{ gap: 6 }}>
                  <Pressable
                    onPress={() => setExpanded(current => ({ ...current, [group.key]: !isExpanded }))}
                    style={styles.groupToggle}
                  >
                    <Text style={[type.navGroup, { color: colors.accentBright }]}>{group.label}</Text>
                    <FontAwesome5
                      name='angle-down'
                      size={14}
                      color={colors.accentBright}
                      style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                    />
                  </Pressable>
                  {isExpanded && (
                    <View style={{ gap: 6 }}>
                      {group.items.map(item => (
                        <NavItem
                          key={item.to}
                          icon={item.icon}
                          label={item.label}
                          active={activeRoute === item.to}
                          onPress={() => onNavigate(item.to)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )
            })}
            <NavItem icon='cog' label='Settings' active={activeRoute === 'Settings'} onPress={() => onNavigate('Settings')} />
          </View>

          <View style={{ marginTop: 'auto', gap: 12 }}>
            <View style={[styles.profilePill, { backgroundColor: colors.sidebarHover, borderColor: colors.sidebarBorder }]}>
                <Text style={[type.body, { fontWeight: '700', color: colors.sidebarText }]}>{user?.firstName || 'User'}</Text>
                <Text style={[type.small, { color: colors.sidebarMuted, fontSize: 12 }]}>{roles.join(', ') || 'Member'}</Text>
            </View>
            <Pressable accessibilityRole='button' onPress={onLogout} style={[styles.logout, { borderColor: colors.sidebarBorder, backgroundColor: colors.sidebarHover }]}>
              <FontAwesome5 name='sign-out-alt' size={14} color={colors.sidebarText} />
              <Text style={[type.button, { color: colors.sidebarText }]}>Logout</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  )
}

function NavItem ({ icon, label, active, onPress }) {
  return (
    <Pressable
      accessibilityRole='link'
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.navItem, (active || pressed) && { backgroundColor: colors.sidebarHover }]}
    >
      <View style={{ minWidth: 16, alignItems: 'center' }}>
        <FontAwesome5 name={icon} size={14} color={colors.sidebarText} solid />
      </View>
      <Text style={[type.body, { flexShrink: 1, color: colors.sidebarText }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 14,
    backgroundColor: colors.sidebarBg,
    borderRightWidth: 1,
    borderRightColor: colors.sidebarBorder,
    shadowColor: '#0f172a',
    shadowOffset: { width: 18, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  menuToggle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceMuted
  },
  groupToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.input
  },
  profilePill: {
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  logout: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input
  }
})

import React from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, layout, radius, shadow, type } from '../theme'
import { Eyebrow, Muted } from './ui'
import { Text } from './Typography'

/** .auth-shell + .auth-card (phone: 16px shell padding, 20/18 card padding, 22px radius) */
export function AuthShell ({ children }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps='handled'
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: layout.authShellPadding }}
        >
          <View style={[styles.card, {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            ...shadow
          }]}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function AuthHeader ({ eyebrow, title, description }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Text accessibilityRole='header' style={[type.authTitle, { marginBottom: 10 }]}>{title}</Text>
      <Muted style={{ marginTop: 16 }}>{description}</Muted>
    </View>
  )
}

/** .auth-switcher: pill toggle between Login / Sign up */
export function AuthSwitcher ({ active, onLogin, onSignup }) {
  return (
    <View style={[styles.switcher, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
      <Pressable onPress={onLogin} style={[styles.switch, active === 'login' && styles.switchActive, active === 'login' && { backgroundColor: colors.surface }]}>
        <Text style={[type.button, { color: active === 'login' ? colors.text : colors.muted }]}>Login</Text>
      </Pressable>
      <Pressable onPress={onSignup} style={[styles.switch, active === 'signup' && styles.switchActive, active === 'signup' && { backgroundColor: colors.surface }]}>
        <Text style={[type.button, { color: active === 'signup' ? colors.text : colors.muted }]}>Sign up</Text>
      </Pressable>
    </View>
  )
}

/** .auth-form button */
export function AuthSubmit ({ title, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole='button'
      onPress={onPress}
      disabled={disabled}
      style={[styles.submit, {
        backgroundColor: colors.primaryActionBg,
        borderColor: colors.primaryActionBg
      }, disabled && { opacity: 0.75 }]}
    >
      <Text style={[type.button, { color: colors.primaryActionText }]}>{title}</Text>
    </Pressable>
  )
}

/** .cta-link / .secondary-link */
export function LinkButton ({ title, onPress, primary = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.button,
        paddingVertical: 12.8,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted
      }}
    >
      <Text style={type.button}>{title}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.auth,
    paddingVertical: layout.authPadding.v,
    paddingHorizontal: layout.authPadding.h,
    ...shadow
  },
  switcher: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 8,
    padding: 5.6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceMuted
  },
  switch: {
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9.6,
    paddingHorizontal: 16,
    borderRadius: radius.chip
  },
  switchActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2
  },
  submit: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  }
})

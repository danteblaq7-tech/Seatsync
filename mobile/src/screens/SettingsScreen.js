import React from 'react'
import { Pressable, View } from 'react-native'
import { Body, H1, Panel, Screen } from '../components/ui'
import { useTheme } from '../context/ThemeContext'
import { colors, radius, type } from '../theme'
import { Text } from '../components/Typography'

export default function SettingsScreen () {
  const { theme, setTheme } = useTheme()

  return (
    <Screen>
      <Panel>
        <H1>Settings</H1>
        <Body style={{ marginTop: 12, marginBottom: 24 }}>
          Personalize how SeatSync looks on this device.
        </Body>
        <Text style={[type.h3, { marginBottom: 12 }]}>Appearance</Text>
        <Body style={{ color: colors.muted, marginBottom: 12 }}>
          Choose a light or dark theme.
        </Body>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {['light', 'dark'].map(mode => {
            const selected = theme === mode
            return (
              <Pressable
                key={mode}
                accessibilityRole='button'
                accessibilityState={{ selected }}
                onPress={() => setTheme(mode)}
                style={{
                  flex: 1,
                  minHeight: 46,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: selected ? colors.accent : colors.border,
                  borderRadius: radius.button,
                  backgroundColor: selected ? colors.accentSoft : colors.surfaceMuted
                }}
              >
                <Text style={[type.button, { color: colors.text }]}>
                  {mode === 'light' ? 'Light' : 'Dark'}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Panel>
    </Screen>
  )
}

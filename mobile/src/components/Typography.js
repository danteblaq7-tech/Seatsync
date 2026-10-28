import React from 'react'
import { Text as NativeText } from 'react-native'
import { colors } from '../theme'

export function Text ({ style, ...props }) {
  return (
    <NativeText
      {...props}
      style={[{ fontFamily: 'Lexend_400Regular', color: colors.text }, style]}
    />
  )
}

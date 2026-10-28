import React from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, layout, shadow } from '../theme'

/**
 * .profile-modal-backdrop + .profile-modal on phones:
 * backdrop rgba(15,23,42,.55), modal pinned to the bottom with 10px outer padding,
 * radius 18/18/12/12, 16px inner padding, max height min(92%, 900).
 */
export default function Sheet ({
  visible = true,
  onClose,
  children,
  dismissable = true,
  maxWidth = 720,
  contentStyle,
  padded = true,
  scroll = true
}) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const maxHeight = Math.min(height * layout.modalMaxHeightRatio, layout.modalMaxHeight)

  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={dismissable ? onClose : undefined} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.backdrop, { paddingBottom: 10 + insets.bottom, backgroundColor: colors.backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined} accessibilityLabel='Close dialog' />
          <View style={[
            styles.modal,
            { maxHeight, maxWidth, backgroundColor: colors.surface, borderColor: colors.border, ...shadow },
            padded && { padding: layout.modalPadding },
            contentStyle
          ]}>
            {scroll ? (
              <ScrollView keyboardShouldPersistTaps='handled' showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 10,
    backgroundColor: colors.backdrop
  },
  modal: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    ...shadow
  }
})

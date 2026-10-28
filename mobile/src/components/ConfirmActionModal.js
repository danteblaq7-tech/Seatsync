import React from 'react'
import { View } from 'react-native'
import Sheet from './Sheet'
import { Body, DangerAction, Eyebrow, FormError, H2, SecondaryButton, ToolbarActions } from './ui'

export default function ConfirmActionModal ({
  title = 'Confirm deletion',
  message,
  confirmLabel = 'Delete',
  eyebrow = 'This action cannot be undone',
  errorMessage = '',
  isPending = false,
  onConfirm,
  onCancel
}) {
  return (
    <Sheet visible onClose={isPending ? undefined : onCancel} maxWidth={520}>
      <View>
        <Eyebrow>{eyebrow}</Eyebrow>
        <H2>{title}</H2>
      </View>
      <Body>{message}</Body>
      <FormError>{errorMessage}</FormError>
      <ToolbarActions>
        <DangerAction
          title={isPending ? 'Deleting...' : confirmLabel}
          onPress={onConfirm}
          disabled={isPending}
        />
        <SecondaryButton title='Cancel' onPress={onCancel} disabled={isPending} />
      </ToolbarActions>
    </Sheet>
  )
}

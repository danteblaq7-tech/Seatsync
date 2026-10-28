import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { badge, colors, layout, radius, shadow, type } from '../theme'
import { Text } from './Typography'

/* ------------------------------------------------------------------ */
/* Typography (browser-default heading sizes + the web's .eyebrow etc) */
/* ------------------------------------------------------------------ */

export const Eyebrow = ({ children, small = false, style }) => (
  <Text style={[small ? type.eyebrowSmall : type.eyebrow, { marginBottom: small ? 6 : 4 }, style]}>
    {children}
  </Text>
)
export const H1 = ({ children, style, ...rest }) => (
  <Text accessibilityRole='header' style={[type.h1, style]} {...rest}>{children}</Text>
)
export const H2 = ({ children, style, ...rest }) => (
  <Text accessibilityRole='header' style={[type.h2, style]} {...rest}>{children}</Text>
)
export const H3 = ({ children, style, ...rest }) => (
  <Text accessibilityRole='header' style={[type.h3, { marginBottom: 8 }, style]} {...rest}>{children}</Text>
)
/** Plain <p> without browser margins */
export const Body = ({ children, style, ...rest }) => (
  <Text style={[type.body, style]} {...rest}>{children}</Text>
)
/** Plain <p> WITH the browser's default 1em vertical margins (what the web shows for bare <p>) */
export const P = ({ children, style, ...rest }) => (
  <Text style={[type.body, { marginVertical: 16 }, style]} {...rest}>{children}</Text>
)
export const Muted = ({ children, style, ...rest }) => (
  <Text style={[type.body, { color: colors.muted }, style]} {...rest}>{children}</Text>
)
export const Small = ({ children, style, ...rest }) => (
  <Text style={[type.small, { color: colors.muted }, style]} {...rest}>{children}</Text>
)
export const FormError = ({ children, style }) =>
  children ? <Text style={[type.body, { color: colors.dangerText, fontWeight: '400' }, style]}>{children}</Text> : null
export const SuccessMessage = ({ children, style }) =>
  children ? <Text style={[type.body, { color: colors.successText, fontWeight: '600' }, style]}>{children}</Text> : null

/* ------------------------------------------------------------------ */
/* Responsive helper (web breakpoints)                                 */
/* ------------------------------------------------------------------ */

export const useBreakpoint = () => {
  const { width, height } = useWindowDimensions()
  return { width, height, isNarrow: width <= 480, isPhone: width <= 760, isTablet: width > 760 }
}

/* ------------------------------------------------------------------ */
/* Page scaffolding                                                    */
/* ------------------------------------------------------------------ */

/** .main-content + .page-shell: padded, scrollable page with 24px gap between sections */
export function Screen ({ children, onRefresh, refreshing = false, contentStyle, scroll = true, edges }) {
  const screenStyle = { backgroundColor: colors.bg }
  if (!scroll) {
    return (
      <SafeAreaView style={[styles.flex, screenStyle]} edges={edges || ['left', 'right']}>
        <View style={[styles.screenContent, contentStyle]}>{children}</View>
      </SafeAreaView>
    )
  }
  return (
    <SafeAreaView style={[styles.flex, screenStyle]} edges={edges || ['left', 'right']}>
      <ScrollView
        style={[styles.flex, screenStyle]}
        contentContainerStyle={[styles.screenContent, contentStyle]}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

/** .page-header (phone: column, 12px gap, left aligned) */
export function PageHeader ({ eyebrow, title, description, children }) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderTitleBlock}>
        {!!eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        {!!title && <H1>{title}</H1>}
        {!!description && <P>{description}</P>}
      </View>
      {children}
    </View>
  )
}

/** .content-panel */
export function Panel ({ children, style, padded = true }) {
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: colors.surface, borderColor: colors.border, ...shadow },
        !padded && { padding: 0 },
        style
      ]}
    >
      {children}
    </View>
  )
}

export const FilterRow = ({ children, style }) => <View style={[styles.filterRow, style]}>{children}</View>

/** .toolbar-actions: wrapping row, 7px gap on phones */
export const ToolbarActions = ({ children, style }) => (
  <View style={[styles.toolbarActions, style]}>{children}</View>
)

export const Loading = ({ label = 'Loading SeatSync...' }) => (
  <View style={[styles.loadingScreen, { backgroundColor: colors.bg }]}>
    <ActivityIndicator color={colors.text} />
    <Text style={[type.body, { fontSize: 19.2, fontWeight: '700', marginTop: 12 }]}>{label}</Text>
  </View>
)

export const EmptyState = ({ title, message }) => (
  <View style={styles.emptyState}>
    {!!title && <Text style={[type.body, { fontWeight: '700', color: colors.muted }]}>{title}</Text>}
    {!!message && <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{message}</Text>}
  </View>
)

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

/**
 * variant: 'primary' | 'secondary' | 'action' | 'danger'
 *   primary   = .primary-button
 *   secondary = .secondary-button
 *   action    = .table-action
 *   danger    = .table-action.danger
 */
export function Button ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  full = false,
  children
}) {
  const v = buttonVariants(variant)
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        v.container,
        full && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.75 },
        pressed && !disabled && { opacity: 0.85 },
        style
      ]}
    >
      {children || <Text style={[type.button, v.text, textStyle]}>{title}</Text>}
    </Pressable>
  )
}
export const PrimaryButton = props => <Button variant='primary' {...props} />
export const SecondaryButton = props => <Button variant='secondary' {...props} />
export const TableAction = props => <Button variant='action' {...props} />
export const DangerAction = props => <Button variant='danger' {...props} />

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export function TextField ({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  editable = true,
  style,
  inputStyle,
  borderColor = colors.line,
  ...rest
}) {
  return (
    <TextInput
      value={value ?? ''}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      editable={editable}
      multiline={multiline}
      autoCapitalize={rest.autoCapitalize ?? 'none'}
      autoCorrect={false}
      style={[
        styles.input,
        { color: colors.text, backgroundColor: colors.surface },
        { borderColor },
        multiline && { minHeight: 100, textAlignVertical: 'top' },
        !editable && { backgroundColor: colors.surfaceMuted, color: colors.muted },
        style,
        inputStyle
      ]}
      {...rest}
    />
  )
}

/** <label> wrapper used in .form-grid (label above control, 8px gap, muted 600 text) */
export function Field ({ label, children, style, tone = 'muted' }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {!!label && (
        <Text style={[type.label, { color: tone === 'muted' ? colors.muted : colors.text }]}>{label}</Text>
      )}
      {children}
    </View>
  )
}

/** .form-grid > label:has(> select) : a bordered box that wraps label + select */
export function BoxedField ({ label, children, style }) {
  return (
    <View style={[styles.boxedField, { borderColor: colors.border }, style]}>
      {!!label && <Text style={[type.label, { color: colors.muted }]}>{label}</Text>}
      {children}
    </View>
  )
}

/** .form-grid (phone = a single column, 12px gap) */
export const FormGrid = ({ children, style }) => <View style={[{ gap: 12 }, style]}>{children}</View>
/** .stack-form (18-20px between groups, 12px inside compact sections) */
export const StackForm = ({ children, style, gap = 20 }) => <View style={[{ gap }, style]}>{children}</View>

export function Checkbox ({ checked, onChange, label, disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole='checkbox'
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange && onChange(!checked)}
      style={[styles.checkboxOption, disabled && { opacity: 0.6 }, style]}
      hitSlop={6}
    >
      <View
        style={[
          styles.checkboxBox,
          checked && styles.checkboxBoxChecked,
          {
            borderColor: checked ? colors.accent : colors.border,
            backgroundColor: checked ? colors.accent : colors.surface
          }
        ]}
      >
        {checked ? <Text style={[styles.checkboxTick, { color: colors.accentForeground }]}>✓</Text> : null}
      </View>
      {typeof label === 'string' ? (
        <Text style={[type.body, { fontWeight: '500', flex: 1, flexShrink: 1 }]}>{label}</Text>
      ) : (
        <View style={{ flex: 1 }}>{label}</View>
      )}
    </Pressable>
  )
}

/** .selection-container / fieldset with a <legend> sitting on the top border */
export function Fieldset ({ legend, children, style }) {
  return (
    <View style={[styles.fieldset, { borderColor: colors.border }, style]}>
      {!!legend && (
        <Text style={[styles.legend, { backgroundColor: colors.surface, color: colors.muted }]}>{legend}</Text>
      )}
      <View style={{ gap: 8, paddingTop: 6 }}>{children}</View>
    </View>
  )
}

/** .checkbox-list : scrolls internally after 180px */
export function CheckboxList ({ children, maxHeight = layout.checkboxListMax, style }) {
  return (
    <ScrollView
      nestedScrollEnabled
      style={[{ maxHeight }, style]}
      contentContainerStyle={{ gap: 8, padding: 4 }}
      keyboardShouldPersistTaps='handled'
    >
      {children}
    </ScrollView>
  )
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export function Badge ({ children, tone = 'default', style }) {
  const t = badge[tone] || badge.default
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      <Text style={[type.badge, { color: t.fg }]}>{children}</Text>
    </View>
  )
}

/** .stat-card (single column at <= 480px, two columns above) */
export function StatCard ({ label, value, style }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, ...shadow }, style]}>
      <Text style={type.stat}>{label}</Text>
      <Text style={[type.statValue, { marginTop: 10 }]}>{String(value ?? '')}</Text>
    </View>
  )
}

export function StatsGrid ({ children }) {
  const { isNarrow } = useBreakpoint()
  const items = React.Children.toArray(children)
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: layout.statGap }}>
      {items.map((child, index) => (
        <View key={child.key ?? index} style={{ width: isNarrow ? '100%' : '48.5%', flexGrow: 1 }}>
          {child}
        </View>
      ))}
    </View>
  )
}

/** ul.simple-list / li */
export const SimpleList = ({ children, style }) => <View style={[{ marginTop: 18, gap: 12 }, style]}>{children}</View>
export function SimpleListItem ({ title, value, last = false }) {
  return (
    <View style={[styles.listItem, { borderBottomColor: colors.border }, last && { borderBottomWidth: 0 }]}>
      <Text style={[type.body, { flex: 1, flexShrink: 1 }]}>{title}</Text>
      <Text style={[type.body, { fontWeight: '700', flexShrink: 1, textAlign: 'right', maxWidth: '55%' }]}>
        {value}
      </Text>
    </View>
  )
}

/** <dl> cell used in the timetable/audit details modals */
export function DetailCell ({ label, value, borderColor = colors.line }) {
  return (
    <View style={[styles.detailCell, { borderColor: borderColor || colors.border }]}>
      <Text style={type.dt}>{label}</Text>
      <Text style={[type.body, { fontWeight: '600', marginTop: 4 }]}>{value}</Text>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const buttonVariants = variant => {
  const variants = {
    primary: {
      container: { backgroundColor: colors.primaryActionBg, borderColor: colors.primaryActionBg, borderRadius: radius.button },
      text: { color: colors.primaryActionText }
    },
    secondary: {
      container: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.button },
      text: { color: colors.text }
    },
    action: {
      container: { backgroundColor: colors.buttonBg, borderColor: colors.border, borderRadius: radius.cell },
      text: { color: colors.text, fontWeight: '400' }
    },
    danger: {
      container: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.cell },
      text: { color: colors.danger, fontWeight: '400' }
    }
  }
  return variants[variant] || variants.primary
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  screenContent: {
    // The 16px page padding sits on the shell (topbar + screens); the topbar supplies the top gap.
    paddingHorizontal: layout.screenPadding,
    paddingTop: 0,
    gap: layout.pageGap,
    paddingBottom: layout.screenPadding + 24
  },
  pageHeader: { flexDirection: 'column', alignItems: 'flex-start', gap: 12 },
  pageHeaderTitleBlock: { alignSelf: 'stretch' },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.panel,
    padding: layout.panelPadding,
    ...shadow
  },
  filterRow: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  toolbarActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  emptyState: { minHeight: 120, justifyContent: 'center', alignItems: 'center', gap: 8 },
  button: {
    minHeight: layout.buttonMinHeight,
    paddingVertical: layout.buttonPad.v,
    paddingHorizontal: layout.buttonPad.h,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  input: {
    minHeight: layout.inputMinHeight,
    paddingVertical: layout.inputPad.v,
    paddingHorizontal: layout.inputPad.h,
    fontFamily: 'Lexend_400Regular',
    fontSize: layout.inputFont,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.input
  },
  boxedField: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.input,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  checkboxOption: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#767676',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkboxBoxChecked: { backgroundColor: colors.black, borderColor: colors.black },
  checkboxTick: { color: '#fff', fontSize: 12, lineHeight: 14, fontWeight: '700' },
  fieldset: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.input,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  legend: {
    position: 'absolute',
    top: -12,
    left: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600'
  },
  badge: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.chip, alignSelf: 'flex-start' },
  statCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.statCard,
    paddingVertical: layout.statPadding.v,
    paddingHorizontal: layout.statPadding.h,
    ...shadow
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  detailCell: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: radius.cell
  }
})

export { styles as uiStyles }

/* ---------- Schedule staging helpers (.schedule-conflict-alert / .staging-card) ---------- */

export function ConflictAlert ({ title = 'Schedule conflict', message, style }) {
  if (!message) return null
  return (
    <View
      accessibilityRole='alert'
      style={[
        {
          gap: 4,
          borderWidth: 1,
          borderLeftWidth: 4,
          borderColor: colors.conflictBorder,
          borderLeftColor: colors.danger,
          borderRadius: 10,
          paddingVertical: 11,
          paddingHorizontal: 13,
          backgroundColor: colors.conflictBg
        },
        style
      ]}
    >
      <Text style={[type.body, { color: colors.conflictTitle, fontSize: 14.4, fontWeight: '700' }]}>{title}</Text>
      <Text style={[type.body, { color: colors.conflictText, lineHeight: 23.2 }]}>{message}</Text>
    </View>
  )
}

/** .exam-staging-card / .event-staging-card on phones (single column) */
export function StagingCard ({ type: kind, description, note, children }) {
  return (
    <View
      style={{
        gap: 14,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: colors.surface,
        shadowColor: colors.shadowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 1
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.primary, fontSize: 10.88, lineHeight: 16, fontWeight: '800', letterSpacing: 0.98, textTransform: 'uppercase' }}>
          {kind}
        </Text>
        <Text style={[type.body, { fontWeight: '700' }]}>{description}</Text>
        {!!note && <Text style={[type.small, { color: colors.muted, fontSize: 13.6 }]}>{note}</Text>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>{children}</View>
    </View>
  )
}

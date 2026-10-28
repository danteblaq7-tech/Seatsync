const roleAccents = {
  admin: { light: '#8a0a6e', dark: '#e46ac4' },
  lecturer: { light: '#22a352', dark: '#4ade80' },
  student: { light: '#06b2c5', dark: '#22d3ee' },
  class_rep: { light: '#06b2c5', dark: '#22d3ee' }
}

function createPalette (mode = 'light', role = 'student') {
  const dark = mode === 'dark'
  const accent = roleAccents[role]?.[dark ? 'dark' : 'light'] || (dark ? '#4aa3e8' : '#0868b7')

  return {
    bg: dark ? '#031e3b' : '#ffffd0',
    surface: dark ? '#0a2f52' : '#ffffff',
    surfaceMuted: dark ? '#0d3a63' : '#fbf8e3',
    border: dark ? 'rgba(255,255,255,0.12)' : '#e3dcb4',
    line: dark ? 'rgba(255,255,255,0.12)' : '#e3dcb4',
    text: dark ? '#f3efd0' : '#031e3b',
    muted: dark ? '#9fb3c8' : '#5f6f7e',
    heading: dark ? '#d6cd88' : '#05436c',
    buttonBg: dark ? '#0d3a63' : '#f3efcf',
    buttonHover: dark ? '#124a7d' : '#e9e3b8',
    toggleBg: dark ? '#0d3a63' : '#f3efcf',
    primary: accent,
    accent,
    accentForeground: dark || role !== 'admin' ? '#031e3b' : '#ffffff',
    primaryActionBg: dark ? '#b99a45' : '#05436c',
    primaryActionText: dark ? '#031e3b' : '#ffffff',
    accentBright: role === 'admin'
      ? '#e46ac4'
      : role === 'lecturer'
        ? '#4ade80'
        : role === 'student' || role === 'class_rep'
          ? '#22d3ee'
          : '#4aa3e8',
    accentSoft: role === 'admin'
      ? dark ? 'rgba(228,106,196,0.18)' : 'rgba(138,10,110,0.14)'
      : role === 'lecturer'
        ? dark ? 'rgba(74,222,128,0.16)' : 'rgba(34,163,82,0.14)'
        : dark ? 'rgba(34,211,238,0.16)' : 'rgba(6,178,197,0.14)',
    success: dark ? '#4ade80' : '#15803d',
    successText: dark ? '#4ade80' : '#15803d',
    warning: dark ? '#fbbf24' : '#b45309',
    danger: dark ? '#f87171' : '#b91c1c',
    dangerText: dark ? '#f87171' : '#b91c1c',
    white: '#ffffff',
    black: dark ? '#b99a45' : '#05436c',
    backdrop: 'rgba(3,30,59,0.58)',
    drawerBackdrop: 'rgba(3,30,59,0.58)',
    conflictBg: dark ? '#3b2630' : '#fff7f7',
    conflictBorder: dark ? '#9f5660' : '#fca5a5',
    conflictText: dark ? '#ffd2d2' : '#7f1d1d',
    conflictTitle: dark ? '#ffb3b3' : '#991b1b',
    conflictSoftBorder: dark ? '#75434c' : '#fecaca',
    codeBg: '#0f172a',
    codeText: '#e2e8f0',
    tableHeadBg: dark ? '#0d3a63' : '#fbf8e3',
    pendingBorder: dark ? '#276082' : '#bfdbfe',
    pendingBg: dark ? '#0d3a63' : '#eff6ff',
    sidebarBg: dark ? '#021a33' : '#05436c',
    sidebarText: '#e8f0f7',
    sidebarMuted: '#9bb8cf',
    sidebarBorder: 'rgba(255,255,255,0.14)',
    sidebarHover: 'rgba(214,205,136,0.18)',
    shadowColor: dark ? '#000000' : '#05436c'
  }
}

let activePalette = createPalette()
let activeMode = 'light'

export function setActivePalette (mode, role) {
  activeMode = mode
  activePalette = createPalette(mode, role)
}

export const colors = new Proxy(activePalette, {
  get: (_target, key) => activePalette[key]
})

const badgesFor = () => ({
  default: { bg: activeMode === 'dark' ? '#0d3a63' : '#f3efcf', fg: colors.text },
  ok: { bg: activeMode === 'dark' ? '#124a3c' : '#e5f4e9', fg: colors.success },
  warn: { bg: activeMode === 'dark' ? '#55451e' : '#fff1d6', fg: colors.warning },
  muted: { bg: colors.surfaceMuted, fg: colors.text }
})
export const badge = new Proxy({}, { get: (_target, key) => badgesFor()[key] })

export const eventTypeColors = {
  exam: '#ef4444',
  lecture: '#2563eb',
  tutorial: '#16a34a',
  seminar: '#d97706',
  lab: '#a855f7'
}

export const radius = {
  input: 12,
  button: 12,
  panel: 15,
  card: 16,
  statCard: 18,
  auth: 22,
  chip: 999,
  cell: 10,
  sheet: 18
}

export const layout = {
  screenPadding: 16,
  pageGap: 24,
  panelPadding: 14,
  statPadding: { v: 14, h: 16 },
  statGap: 12,
  authPadding: { v: 20, h: 18 },
  authShellPadding: 16,
  inputMinHeight: 42,
  inputPad: { v: 9.92, h: 12.48 },
  inputFont: 16,
  buttonMinHeight: 38,
  buttonPad: { v: 8.8, h: 12.48 },
  buttonFont: 14.4,
  tableCellPad: { v: 12, h: 10 },
  tableMinWidth: 700,
  drawerWidth: 300,
  drawerGutter: 56,
  menuButton: 42,
  topbarMinHeight: 48,
  modalMaxHeightRatio: 0.92,
  modalMaxHeight: 900,
  modalPadding: 16,
  selectMenuMax: 240,
  checkboxListMax: 180
}

const lexendFamilies = {
  400: 'Lexend_400Regular',
  500: 'Lexend_500Medium',
  600: 'Lexend_600SemiBold',
  700: 'Lexend_700Bold'
}
const orbitronFamilies = {
  400: 'Orbitron_400Regular',
  500: 'Orbitron_500Medium',
  600: 'Orbitron_600SemiBold',
  700: 'Orbitron_700Bold'
}

const t = (size, weight = '400', extra = {}, heading = false) => ({
  fontFamily: (heading ? orbitronFamilies : lexendFamilies)[weight] || lexendFamilies[400],
  fontSize: size,
  lineHeight: Math.round(size * 1.5 * 100) / 100,
  fontWeight: weight,
  color: colors.text,
  ...extra
})

const typeForPalette = () => ({
  body: t(16),
  bodySm: t(14),
  small: t(12.8),
  h1: t(32, '700', { color: colors.heading }, true),
  h2: t(24, '700', { color: colors.heading }, true),
  h3: t(18.72, '700', { color: colors.heading }, true),
  authTitle: t(32, '700', { letterSpacing: -1.28, color: colors.heading }, true),
  eyebrow: t(10, '700', { letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted }),
  eyebrowSmall: t(9, '700', { letterSpacing: 1.08, textTransform: 'uppercase', color: colors.muted }),
  label: t(16, '600'),
  stat: t(12, '400', { letterSpacing: 0.96, textTransform: 'uppercase', color: colors.muted }),
  statValue: t(26.4, '700', { color: colors.heading }, true),
  brand: t(17.28, '700', { letterSpacing: 1.73, textTransform: 'uppercase' }, true),
  navGroup: t(10.88, '600', { letterSpacing: 0.44, textTransform: 'uppercase' }),
  badge: t(12, '700'),
  tableHead: t(12.16, '700', { letterSpacing: 0.49, textTransform: 'uppercase', color: colors.muted }, true),
  button: t(14.4, '600', { letterSpacing: 0.3 }, true),
  tableAction: t(13.6),
  dt: t(12, '700', { textTransform: 'uppercase', color: colors.muted })
})
export const type = new Proxy({}, {
  get: (_target, key) => typeForPalette()[key],
  ownKeys: () => Reflect.ownKeys(typeForPalette()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true })
})

const shadowsForPalette = () => ({
  shadow: {
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: activeMode === 'dark' ? 0.3 : 0.1,
    shadowRadius: 25,
    elevation: 3
  },
  softShadow: {
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: activeMode === 'dark' ? 0.2 : 0.06,
    shadowRadius: 6,
    elevation: 1
  }
})

const shadowKeys = {
  shadowColor: colors.shadowColor,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0
}
export const shadow = new Proxy(shadowKeys, {
  get: (_target, key) => shadowsForPalette().shadow[key]
})
export const softShadow = new Proxy(shadowKeys, {
  get: (_target, key) => shadowsForPalette().softShadow[key]
})

export default { colors, radius, layout, type, shadow, badge, eventTypeColors }

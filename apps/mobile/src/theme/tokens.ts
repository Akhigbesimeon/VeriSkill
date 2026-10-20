// Design tokens — mirror the web CSS custom properties; single source of
// truth for the mobile visual identity.

export const colors = {
  bg:           '#f6f6f3',
  surface:      '#fcfbf8',
  surface2:     '#ececea',
  border:       '#e3e2dd',
  borderStrong: '#c9c7bf',
  borderFocus:  '#4f46b8',

  textPrimary:   '#141418',
  textSecondary: '#5e5d66',
  textDisabled:  '#a8a7af',
  textInverse:   '#fcfbf8',

  accent:        '#4f46b8',
  accentHover:   '#3f379b',
  accentSubtle:  '#eceafa',

  success:       '#2f7a4a',
  successSubtle: '#ebf4ee',
  warning:       '#a86a1b',
  warningSubtle: '#f7f0e2',
  danger:        '#b63737',
  dangerSubtle:  '#f6ebeb',
  info:          '#3458a2',
  infoSubtle:    '#ecf0f8',
} as const

export const typography = {
  fontFamily: 'Geist_400Regular',   // ThemedText swaps to the matching variant per fontWeight
  xs:   12,
  sm:   14,
  base: 16,
  lg:   18,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
  weightNormal:   '400' as const,
  weightMedium:   '500' as const,
  weightSemibold: '600' as const,
  weightBold:     '700' as const,
}

export const spacing = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
}

export const radius = {
  sm:   4,
  md:   8,
  lg:   14,
  xl:   20,
  full: 9999,
}

export const shadow = {
  sm: {
    shadowColor: '#1f1b55',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#1f1b55',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 3,
  },
}

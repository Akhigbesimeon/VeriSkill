import { Text as RNText, StyleSheet, type TextProps } from 'react-native'

// Map RN fontWeight to the Geist variant family name registered by useFonts
// in app/_layout.tsx. iOS can synthesise weight, Android cannot — this picks
// the correct TTF per weight so both platforms render as the web does.
const familyByWeight: Record<string, string> = {
  '400': 'Geist_400Regular',
  '500': 'Geist_500Medium',
  '600': 'Geist_600SemiBold',
  '700': 'Geist_700Bold',
  normal: 'Geist_400Regular',
  bold:   'Geist_700Bold',
}

export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {}
  const weight = flat.fontWeight != null ? String(flat.fontWeight) : '400'
  const fontFamily = familyByWeight[weight] ?? 'Geist_400Regular'
  return <RNText {...rest} style={[{ fontFamily }, style]} />
}

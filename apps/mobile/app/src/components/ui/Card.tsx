import { View, StyleSheet, ViewStyle } from 'react-native'
import { colors, spacing, radius, shadow } from '@/theme/tokens'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  padding?: 'sm' | 'md' | 'lg'
  style?: ViewStyle
}

export function Card({ children, padding = 'md', style }: CardProps) {
  return (
    <View style={[styles.card, styles[padding], style]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  sm: { padding: spacing[4] },
  md: { padding: spacing[5] },
  lg: { padding: spacing[6] },
})

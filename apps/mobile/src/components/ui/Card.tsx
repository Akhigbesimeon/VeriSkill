import { View, StyleSheet, ViewStyle } from 'react-native'
import { spacing, radius, shadow, type ColorPalette } from '@/theme/tokens'
import { useColors } from '@/theme/ThemeContext'
import { ReactNode, useMemo } from 'react'

interface CardProps {
  children: ReactNode
  padding?: 'sm' | 'md' | 'lg'
  style?: ViewStyle
}

export function Card({ children, padding = 'md', style }: CardProps) {
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  return (
    <View style={[styles.card, styles[padding], style]}>
      {children}
    </View>
  )
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
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
}

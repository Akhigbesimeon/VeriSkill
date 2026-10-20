import { TouchableOpacity, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from 'react-native'
import { Text } from './Text'
import { colors, spacing, radius, typography, shadow } from '@/theme/tokens'
import { ReactNode } from 'react'

interface ButtonProps {
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  children: ReactNode
  style?: ViewStyle
}

export function Button({
  onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, children, style,
}: ButtonProps) {
  const isDisabled = disabled || loading

  const containerStyle: ViewStyle[] = [
    styles.base,
    styles[`container_${variant}`],
    styles[`size_${size}`],
    isDisabled ? styles.disabled : {},
    style ?? {},
  ]

  const textStyle: TextStyle[] = [
    styles.label,
    styles[`label_${variant}`],
    styles[`labelSize_${size}`],
  ]

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={containerStyle}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? colors.textInverse : colors.textPrimary} />
        : <Text style={textStyle}>{children}</Text>
      }
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, borderWidth: 1,
  },
  disabled: { opacity: 0.5 },

  // Containers — primary is dark-ink to match web (not the accent); secondary uses the stronger border.
  container_primary:   { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary, ...shadow.sm },
  container_secondary: { backgroundColor: colors.surface,     borderColor: colors.borderStrong },
  container_ghost:     { backgroundColor: 'transparent',      borderColor: 'transparent' },
  container_danger:    { backgroundColor: colors.danger,      borderColor: colors.danger, ...shadow.sm },

  // Sizes
  size_sm: { paddingVertical: spacing[1] + 2, paddingHorizontal: spacing[3], minHeight: 32 },
  size_md: { paddingVertical: spacing[2],     paddingHorizontal: spacing[4], minHeight: 40 },
  size_lg: { paddingVertical: spacing[3],     paddingHorizontal: spacing[6], minHeight: 48 },

  // Labels
  label: { fontWeight: typography.weightMedium },
  label_primary:   { color: colors.textInverse },
  label_secondary: { color: colors.textPrimary },
  label_ghost:     { color: colors.textSecondary },
  label_danger:    { color: colors.textInverse },

  labelSize_sm: { fontSize: typography.sm },
  labelSize_md: { fontSize: typography.sm },
  labelSize_lg: { fontSize: typography.base },
})

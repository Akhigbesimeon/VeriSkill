import { View, TextInput, TextInputProps, StyleSheet } from 'react-native'
import { Text } from './Text'
import { colors, spacing, radius, typography } from '@/theme/tokens'
import { ElementRef, forwardRef } from 'react'

interface InputProps extends TextInputProps {
  label: string
  error?: string
  hint?: string
}

export const Input = forwardRef<ElementRef<typeof TextInput>, InputProps>(
  ({ label, error, hint, style, ...rest }, ref) => {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          ref={ref}
          style={[styles.input, error ? styles.inputError : {}, style]}
          placeholderTextColor={colors.textDisabled}
          accessibilityLabel={label}
          accessibilityHint={hint}
          {...rest}
        />
        {hint && !error && <Text style={styles.hint}>{hint}</Text>}
        {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      </View>
    )
  }
)
Input.displayName = 'Input'

const styles = StyleSheet.create({
  field:  { gap: spacing[1] },
  label:  { fontSize: typography.sm, fontWeight: typography.weightMedium, color: colors.textPrimary },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: spacing[2], paddingHorizontal: spacing[3],
    fontSize: typography.sm, color: colors.textPrimary,
    backgroundColor: colors.surface, minHeight: 40,
  },
  inputError: { borderColor: colors.danger },
  hint:  { fontSize: typography.xs, color: colors.textSecondary },
  error: { fontSize: typography.xs, color: colors.danger },
})

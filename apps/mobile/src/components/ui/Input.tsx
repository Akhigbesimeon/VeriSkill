import { View, TextInput, TextInputProps, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from './Text'
import { spacing, radius, typography, type ColorPalette } from '@/theme/tokens'
import { useColors } from '@/theme/ThemeContext'
import { ElementRef, forwardRef, useMemo, useState } from 'react'

interface InputProps extends TextInputProps {
  label: string
  error?: string
  hint?: string
  /** Opt out of the automatic show/hide toggle shown for secureTextEntry fields. */
  noPasswordToggle?: boolean
}

export const Input = forwardRef<ElementRef<typeof TextInput>, InputProps>(
  ({ label, error, hint, style, secureTextEntry, noPasswordToggle, ...rest }, ref) => {
    const colors = useColors()
    const styles = useMemo(() => makeStyles(colors), [colors])
    const [revealed, setRevealed] = useState(false)
    const showToggle = !!secureTextEntry && !noPasswordToggle
    const effectiveSecure = showToggle ? !revealed : !!secureTextEntry

    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.inputWrap}>
          <TextInput
            ref={ref}
            style={[
              styles.input,
              error ? styles.inputError : null,
              showToggle ? styles.inputWithToggle : null,
              style,
            ]}
            placeholderTextColor={colors.textDisabled}
            accessibilityLabel={label}
            accessibilityHint={hint}
            secureTextEntry={effectiveSecure}
            {...rest}
          />
          {showToggle && (
            <TouchableOpacity
              onPress={() => setRevealed(r => !r)}
              style={styles.toggle}
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
              accessibilityState={{ selected: revealed }}
              hitSlop={8}
            >
              <Ionicons
                name={revealed ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
        {hint && !error && <Text style={styles.hint}>{hint}</Text>}
        {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      </View>
    )
  }
)
Input.displayName = 'Input'

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    field:  { gap: spacing[1] },
    label:  { fontSize: typography.sm, fontWeight: typography.weightMedium, color: colors.textPrimary },
    inputWrap: { position: 'relative', justifyContent: 'center' },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      paddingVertical: spacing[2], paddingHorizontal: spacing[3],
      fontSize: typography.sm, color: colors.textPrimary,
      backgroundColor: colors.surface, minHeight: 40,
    },
    inputWithToggle: { paddingRight: spacing[3] + 28 },
    inputError: { borderColor: colors.danger },
    toggle: {
      position: 'absolute',
      right: spacing[2],
      top: 0, bottom: 0,
      justifyContent: 'center',
      paddingHorizontal: spacing[1],
    },
    hint:  { fontSize: typography.xs, color: colors.textSecondary },
    error: { fontSize: typography.xs, color: colors.danger },
  })
}

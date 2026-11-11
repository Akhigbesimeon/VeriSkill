import { TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { radius, type ColorPalette } from '@/theme/tokens'
import { useTheme } from '@/theme/ThemeContext'
import { useMemo } from 'react'

export function ThemeToggle() {
  const { scheme, colors, toggle } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const isDark = scheme === 'dark'
  return (
    <TouchableOpacity
      onPress={toggle}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      accessibilityState={{ selected: isDark }}
      hitSlop={8}
    >
      <Ionicons
        name={isDark ? 'sunny-outline' : 'moon-outline'}
        size={20}
        color={colors.textSecondary}
      />
    </TouchableOpacity>
  )
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    btn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.full,
    },
  })
}

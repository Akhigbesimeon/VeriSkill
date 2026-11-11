import { View, StyleSheet } from 'react-native'
import { Text } from './Text'
import { spacing, radius, typography, type ColorPalette } from '@/theme/tokens'
import { useColors } from '@/theme/ThemeContext'
import { ReactNode, useMemo } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

function variantColors(c: ColorPalette): Record<BadgeVariant, { bg: string; text: string }> {
  return {
    default: { bg: c.surface2,      text: c.textSecondary },
    success: { bg: c.successSubtle, text: c.success },
    warning: { bg: c.warningSubtle, text: c.warning },
    danger:  { bg: c.dangerSubtle,  text: c.danger  },
    info:    { bg: c.infoSubtle,    text: c.info    },
    accent:  { bg: c.accentSubtle,  text: c.accent  },
  }
}

export function Badge({ variant = 'default', children }: { variant?: BadgeVariant; children: ReactNode }) {
  const colors = useColors()
  const v = useMemo(() => variantColors(colors)[variant], [colors, variant])
  return (
    <View style={[styles.badge, { backgroundColor: v.bg }]}>
      <Text style={[styles.label, { color: v.text }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: spacing[2],
    borderRadius: radius.full,
  },
  label: { fontSize: typography.xs, fontWeight: typography.weightMedium },
})

import { View, StyleSheet } from 'react-native'
import { Text } from './Text'
import { colors, spacing, radius, typography } from '@/theme/tokens'
import { ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

const variantStyles = {
  default: { bg: colors.surface2,     text: colors.textSecondary },
  success: { bg: colors.successSubtle, text: colors.success },
  warning: { bg: colors.warningSubtle, text: colors.warning },
  danger:  { bg: colors.dangerSubtle,  text: colors.danger  },
  info:    { bg: colors.infoSubtle,    text: colors.info    },
  accent:  { bg: colors.accentSubtle,  text: colors.accent  },
}

export function Badge({ variant = 'default', children }: { variant?: BadgeVariant; children: ReactNode }) {
  const v = variantStyles[variant]
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

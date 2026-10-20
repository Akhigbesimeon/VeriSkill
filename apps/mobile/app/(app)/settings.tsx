import { useState } from 'react'
import { View, ScrollView, StyleSheet, TouchableOpacity, Linking, Platform, useColorScheme, Alert, ActivityIndicator } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { Text } from '@/components/ui/Text'
import { Card } from '@/components/ui/Card'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/auth.store'
import api from '@/lib/api'
import { colors, spacing, typography } from '@/theme/tokens'

const APP_VERSION = '0.1.0'

interface RowProps {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  value?: string
  busy?: boolean
  onPress?: () => void
}

function Row({ icon, label, value, busy, onPress }: RowProps) {
  const inner = (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.textPrimary} />
      <Text style={styles.rowLabel}>{label}</Text>
      {busy && <ActivityIndicator size="small" color={colors.accent} />}
      {!busy && value && <Text style={styles.rowValue}>{value}</Text>}
      {!busy && onPress && <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />}
    </View>
  )
  return onPress
    ? <TouchableOpacity activeOpacity={0.6} onPress={onPress} disabled={busy}>{inner}</TouchableOpacity>
    : inner
}

export default function SettingsScreen() {
  const router = useRouter()
  const scheme = useColorScheme() ?? 'light'
  const { logout } = useAuthStore()
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting]   = useState(false)

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'Your account will be deactivated. You will be signed out and unable to log back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            if (deleting) return
            setDeleting(true)
            try {
              await api.delete('/auth/me')
              await logout()
              router.replace('/(auth)/login')
            } catch {
              Alert.alert('Delete failed', 'Could not delete account. Try again later.')
              setDeleting(false)
            }
          },
        },
      ],
    )
  }

  const onExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { data } = await api.get<string>('/verify/export', { responseType: 'text', transformResponse: v => v })
      if (!data || data.trim().split('\n').length <= 1) {
        Alert.alert('Nothing to export', 'You have not scanned any credentials yet.')
        return
      }
      const uri = `${FileSystem.cacheDirectory}veriskill-scans-${new Date().toISOString().slice(0,10)}.csv`
      await FileSystem.writeAsStringAsync(uri, data)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export VeriSkill scans' })
      } else {
        Alert.alert('Export ready', `Saved to ${uri}`)
      }
    } catch {
      Alert.alert('Export failed', 'Could not export your scans. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <Card style={styles.card}>
          <Row
            icon="notifications-outline"
            label="Notifications"
            onPress={() => Linking.openSettings()}
          />
          <View style={styles.divider} />
          <Row
            icon={scheme === 'dark' ? 'moon-outline' : 'sunny-outline'}
            label="Appearance"
            value={`Follows ${Platform.OS === 'ios' ? 'iOS' : 'Android'} (${scheme})`}
          />
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>Data</Text>
        <Card style={styles.card}>
          <Row
            icon="download-outline"
            label="Export scans (CSV)"
            busy={exporting}
            onPress={onExport}
          />
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>Account</Text>
        <Card style={styles.card}>
          <Row
            icon="key-outline"
            label="Change password"
            onPress={() => router.push('/(app)/change-password')}
          />
          <View style={styles.divider} />
          <Row
            icon="trash-outline"
            label="Delete account"
            busy={deleting}
            onPress={onDeleteAccount}
          />
        </Card>
      </View>

      <View>
        <Text style={styles.sectionTitle}>About</Text>
        <Card style={styles.card}>
          <Row icon="information-circle-outline" label="Version" value={`v${APP_VERSION}`} />
          <View style={styles.divider} />
          <Row
            icon="document-text-outline"
            label="Privacy policy"
            onPress={() => Linking.openURL('https://veriskill.io/privacy')}
          />
        </Card>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll:       { flex: 1, backgroundColor: colors.bg },
  container:    { padding: spacing[5], gap: spacing[5] },
  sectionTitle: {
    fontSize: typography.xs, fontWeight: typography.weightSemibold,
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: spacing[2], marginLeft: spacing[2],
  },
  card:    { padding: 0 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4], paddingHorizontal: spacing[4] },
  rowLabel: { flex: 1, fontSize: typography.base, fontWeight: typography.weightMedium, color: colors.textPrimary },
  rowValue: { fontSize: typography.sm, color: colors.textSecondary },
  divider:  { height: 1, backgroundColor: colors.border, marginLeft: spacing[12] },
})

import { useState } from 'react'
import { View, ScrollView, StyleSheet, TextInput, Alert } from 'react-native'
import { Text } from '@/components/ui/Text'
import { useRouter } from 'expo-router'
import { Button } from '@/components/ui/Button'
import api, { extractErrorMessage } from '@/lib/api'
import { colors, spacing, typography, radius } from '@/theme/tokens'

export default function ChangePasswordScreen() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const onSave = async () => {
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'The two new passwords do not match.')
      return
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      Alert.alert('Weak password', 'Use at least 8 characters, including an uppercase letter and a number.')
      return
    }
    setSaving(true)
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword })
      Alert.alert('Password changed', 'Your password has been updated.')
      router.back()
    } catch (err) {
      Alert.alert('Change failed', extractErrorMessage(err, 'Could not change password.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.label}>Current password</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
        />
      </View>

      <View>
        <Text style={styles.label}>New password</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Text style={styles.hint}>At least 8 characters, with one uppercase letter and one number.</Text>
      </View>

      <View>
        <Text style={styles.label}>Confirm new password</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
        />
      </View>

      <Button onPress={onSave} loading={saving} disabled={saving}>
        Change password
      </Button>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing[5], gap: spacing[5] },
  label:     { fontSize: typography.sm, fontWeight: typography.weightSemibold, color: colors.textPrimary, marginBottom: spacing[2] },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    fontSize: typography.base, color: colors.textPrimary,
  },
  hint:      { fontSize: typography.xs, color: colors.textSecondary, marginTop: spacing[2] },
})

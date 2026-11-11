import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useColors } from '@/theme/ThemeContext'
import api, { extractErrorMessage } from '@/lib/api'
import { spacing, type ColorPalette } from '@/theme/tokens'

export default function ChangePasswordScreen() {
  const router = useRouter()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
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
      <Input
        label="Current password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <Input
        label="New password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        autoCapitalize="none"
        hint="At least 8 characters, with one uppercase letter and one number."
      />
      <Input
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <Button onPress={onSave} loading={saving} disabled={saving}>
        Change password
      </Button>
    </ScrollView>
  )
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    scroll:    { flex: 1, backgroundColor: colors.bg },
    container: { padding: spacing[5], gap: spacing[5] },
  })
}

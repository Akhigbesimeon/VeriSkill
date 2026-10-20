import { useState } from 'react'
import { View, ScrollView, StyleSheet, TextInput, Alert } from 'react-native'
import { Text } from '@/components/ui/Text'
import { useRouter } from 'expo-router'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/auth.store'
import { extractErrorMessage } from '@/lib/api'
import { colors, spacing, typography, radius } from '@/theme/tokens'

export default function EditProfileScreen() {
  const router = useRouter()
  const { user, updateProfile } = useAuthStore()

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [company,     setCompany]     = useState(user?.company ?? '')
  const [bio,         setBio]         = useState(user?.bio ?? '')
  const [saving,      setSaving]      = useState(false)

  const onSave = async () => {
    const name = displayName.trim()
    if (name.length < 2) {
      Alert.alert('Invalid name', 'Display name must be at least 2 characters.')
      return
    }
    setSaving(true)
    try {
      await updateProfile({
        displayName: name,
        company:     company.trim() || null,
        bio:         bio.trim() || null,
      })
      router.back()
    } catch (err) {
      Alert.alert('Save failed', extractErrorMessage(err, 'Could not update profile.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={colors.textDisabled}
          maxLength={100}
          autoCapitalize="words"
        />
      </View>

      <View>
        <Text style={styles.label}>Company</Text>
        <TextInput
          style={styles.input}
          value={company}
          onChangeText={setCompany}
          placeholder="e.g. Acme Talent"
          placeholderTextColor={colors.textDisabled}
          maxLength={100}
        />
      </View>

      <View>
        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={bio}
          onChangeText={setBio}
          placeholder="A short note about yourself (optional)"
          placeholderTextColor={colors.textDisabled}
          multiline
          numberOfLines={4}
          maxLength={2000}
          textAlignVertical="top"
        />
      </View>

      <Button onPress={onSave} loading={saving} disabled={saving}>
        Save changes
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
  multiline: { minHeight: 100, paddingTop: spacing[3] },
})

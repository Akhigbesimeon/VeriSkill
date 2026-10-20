import { useState } from 'react'
import {
  View, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { Text } from '@/components/ui/Text'
import { Link, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { extractErrorMessage } from '@/lib/api'
import { colors, spacing, typography, radius } from '@/theme/tokens'

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [error, setError]             = useState<string | null>(null)
  const { register, isLoading }       = useAuthStore()
  const router = useRouter()

  const validate = (): string | null => {
    if (!displayName.trim()) return 'Display name is required.'
    if (!email.trim())        return 'Email is required.'
    if (password.length < 8)  return 'Password must be at least 8 characters.'
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.'
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
    return null
  }

  const handleRegister = async () => {
    const validationError = validate()
    if (validationError) { setError(validationError); return }
    setError(null)
    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: 'recruiter',
        walletType: 'managed',
      })
      router.replace('/(app)/dashboard')
    } catch (err) {
      setError(extractErrorMessage(err, 'Registration failed. Please try again.'))
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Create recruiter account</Text>
        <Text style={styles.sub}>This app is for recruiters only</Text>

        <View style={styles.form}>
          <Input label="Display name" value={displayName} onChangeText={setDisplayName} autoComplete="name" />
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            hint="Min 8 chars, 1 uppercase, 1 number"
          />

          {error && (
            <Text style={styles.error} accessibilityRole="alert">{error}</Text>
          )}

          <Button onPress={handleRegister} loading={isLoading} size="lg">
            Create account
          </Button>
        </View>

        <Text style={styles.switchText}>
          Already have an account?{' '}
          <Link href="/(auth)/login" style={styles.link}>Sign in</Link>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing[6] },
  heading: { fontSize: typography['2xl'], fontWeight: typography.weightBold, color: colors.textPrimary, marginBottom: spacing[1] },
  sub: { fontSize: typography.sm, color: colors.textSecondary, marginBottom: spacing[6] },
  form: { gap: spacing[4] },
  error: { fontSize: typography.sm, color: colors.danger, backgroundColor: colors.dangerSubtle, padding: spacing[3], borderRadius: radius.md },
  switchText: { marginTop: spacing[6], fontSize: typography.sm, color: colors.textSecondary, textAlign: 'center' },
  link: { color: colors.textPrimary, fontWeight: typography.weightMedium },
})

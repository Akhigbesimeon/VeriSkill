import { useState } from 'react'
import {
  View, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform
} from 'react-native'
import { Text } from '@/components/ui/Text'
import { Link, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { extractErrorMessage } from '@/lib/api'
import { colors, spacing, typography } from '@/theme/tokens'

export default function LoginScreen() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const { login, logout, isLoading } = useAuthStore()
  const router = useRouter()

  const handleLogin = async () => {
    if (!email || !password) { setError('Email and password are required.'); return }
    setError(null)
    try {
      await login(email.trim().toLowerCase(), password)
      if (useAuthStore.getState().user?.role !== 'recruiter') {
        await logout()
        setError('This app is for recruiters only.')
        return
      }
      router.replace('/(app)/dashboard')
    } catch (err) {
      setError(extractErrorMessage(err, 'Login failed. Please check your credentials.'))
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
        <Text style={styles.heading}>Sign in</Text>
        <Text style={styles.sub}>Enter your credentials to continue</Text>

        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          {error && (
            <Text style={styles.error} accessibilityRole="alert">{error}</Text>
          )}

          <Button onPress={handleLogin} loading={isLoading} size="lg">
            Sign in
          </Button>
        </View>

        <Text style={styles.switchText}>
          New to VeriSkill?{' '}
          <Link href="/(auth)/register" style={styles.link}>Create an account</Link>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1, justifyContent: 'center',
    padding: spacing[6],
  },
  heading: {
    fontSize: typography['2xl'],
    fontWeight: typography.weightBold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  sub: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginBottom: spacing[6],
  },
  form: { gap: spacing[4] },
  error: {
    fontSize: typography.sm,
    color: colors.danger,
    backgroundColor: colors.dangerSubtle,
    padding: spacing[3],
    borderRadius: 6,
  },
  switchText: {
    marginTop: spacing[6],
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  link: {
    color: colors.textPrimary,
    fontWeight: typography.weightMedium,
  },
})

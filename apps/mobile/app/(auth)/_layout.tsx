import { Stack, Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/auth.store'

export default function AuthLayout() {
  const user = useAuthStore(s => s.user)
  if (user) return <Redirect href="/(app)/dashboard" />
  return <Stack screenOptions={{ headerShown: false }} />
}

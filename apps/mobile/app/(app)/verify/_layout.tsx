import { Stack } from 'expo-router'
import { useColors } from '@/theme/ThemeContext'
import { typography } from '@/theme/tokens'

export default function VerifyLayout() {
  const colors = useColors()
  return (
    <Stack
      screenOptions={{
        headerStyle:      { backgroundColor: colors.surface },
        headerTitleStyle: { fontSize: typography.base, fontWeight: typography.weightSemibold, color: colors.textPrimary },
        headerTintColor:  colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]"  options={{ title: 'Verification' }} />
    </Stack>
  )
}

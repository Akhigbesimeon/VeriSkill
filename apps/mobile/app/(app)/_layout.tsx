import { Tabs, Redirect, Link } from 'expo-router'
import { TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/stores/auth.store'
import { colors, typography } from '@/theme/tokens'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function icon(name: IoniconName, focusedName: IoniconName) {
  return ({ focused, color, size }: { focused: boolean; color: unknown; size: number }) => (
    <Ionicons name={focused ? focusedName : name} size={size} color={typeof color === 'string' ? color : undefined} />
  )
}

export default function AppLayout() {
  const user = useAuthStore(s => s.user)
  if (!user) return <Redirect href="/(auth)/login" />

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle:      { backgroundColor: colors.surface },
        headerTitleStyle: { fontSize: typography.base, fontWeight: typography.weightSemibold, color: colors.textPrimary },
        headerShadowVisible: false,
        tabBarStyle:           { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor:   colors.textPrimary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: typography.xs, fontWeight: typography.weightMedium },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          tabBarIcon: icon('home-outline', 'home'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="verify"
        options={{
          title: 'Scan',
          tabBarLabel: 'Scan',
          headerShown: false,
          tabBarIcon: icon('scan-outline', 'scan'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: icon('person-outline', 'person'),
          headerTitle: '',
          headerRight: () => (
            <Link href="/(app)/settings" asChild>
              <TouchableOpacity style={{ paddingHorizontal: 16 }} hitSlop={10}>
                <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </Link>
          ),
        }}
      />
      {/* Hidden screens (no tab) */}
      <Tabs.Screen name="settings"         options={{ href: null, title: 'Settings' }} />
      <Tabs.Screen name="search"           options={{ href: null, title: 'Search candidates' }} />
      <Tabs.Screen name="edit-profile"     options={{ href: null, title: 'Edit profile' }} />
      <Tabs.Screen name="change-password"  options={{ href: null, title: 'Change password' }} />
    </Tabs>
  )
}

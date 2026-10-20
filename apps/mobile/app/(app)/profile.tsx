import { useEffect, useState } from 'react'
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native'
import { Text } from '@/components/ui/Text'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import api from '@/lib/api'
import { colors, spacing, typography, radius } from '@/theme/tokens'

interface Stats { totalScans: number; uniqueCandidates: number; scansThisMonth: number }
interface ActivityPoint { date: string; count: number }

function formatMemberSince(iso?: string) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, { month: 'short', year: 'numeric' })
}

export default function ProfileScreen() {
  const { user, loadMe, logout } = useAuthStore()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<ActivityPoint[]>([])

  useEffect(() => {
    // Refresh user so bio/company/createdAt from backend are current after edits.
    loadMe().catch(() => {})
  }, [loadMe])

  useEffect(() => {
    api.get<Stats>('/verify/stats').then(r => setStats(r.data)).catch(() => {})
    api.get<ActivityPoint[]>('/verify/activity?days=30').then(r => setActivity(r.data)).catch(() => {})
  }, [])

  const memberSince = formatMemberSince(user?.createdAt)
  const activityMax = Math.max(1, ...activity.map(a => a.count))

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          await logout()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Card style={styles.heroCard}>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => router.push('/(app)/edit-profile')}
          activeOpacity={0.6}
          hitSlop={10}
        >
          <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.displayName}>{user?.displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.company ? <Text style={styles.company}>{user.company}</Text> : null}
        <View style={{ marginTop: spacing[2] }}>
          <Badge variant="accent">Recruiter</Badge>
        </View>
        {memberSince && <Text style={styles.memberSince}>Member since {memberSince}</Text>}
        {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
      </Card>

      <View>
        <Text style={styles.sectionTitle}>Your activity</Text>
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalScans ?? '—'}</Text>
            <Text style={styles.statLabel}>Total scans</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.uniqueCandidates ?? '—'}</Text>
            <Text style={styles.statLabel}>Candidates</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.scansThisMonth ?? '—'}</Text>
            <Text style={styles.statLabel}>This month</Text>
          </Card>
        </View>

        {activity.length > 0 && (
          <Card style={styles.sparkCard}>
            <View style={styles.sparkHead}>
              <Text style={styles.sparkTitle}>Last 30 days</Text>
              <Text style={styles.sparkSub}>
                {activity.reduce((s, p) => s + p.count, 0)} scans
              </Text>
            </View>
            <View style={styles.sparkRow}>
              {activity.map(p => (
                <View
                  key={p.date}
                  style={[
                    styles.sparkBar,
                    { height: Math.max(2, (p.count / activityMax) * 48) },
                  ]}
                />
              ))}
            </View>
          </Card>
        )}
      </View>

      <Button variant="danger" onPress={handleLogout}>
        Sign out
      </Button>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll:      { flex: 1, backgroundColor: colors.bg },
  container:   { padding: spacing[5], gap: spacing[4] },
  heroCard:    { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing[2],
  },
  avatarText:   { fontSize: typography['2xl'], fontWeight: typography.weightBold, color: colors.accent },
  displayName:  { fontSize: typography.lg, fontWeight: typography.weightSemibold, color: colors.textPrimary },
  email:        { fontSize: typography.sm, color: colors.textSecondary },
  sectionTitle: { fontSize: typography.base, fontWeight: typography.weightSemibold, color: colors.textPrimary, marginBottom: spacing[3] },
  statsRow:     { flexDirection: 'row', gap: spacing[3] },
  statCard:     { flex: 1, alignItems: 'center', gap: spacing[1], paddingVertical: spacing[4] },
  statValue:    { fontSize: typography['2xl'], fontWeight: typography.weightBold, color: colors.textPrimary },
  statLabel:    { fontSize: typography.xs, color: colors.textSecondary, textAlign: 'center' },

  editBtn:      { position: 'absolute', top: spacing[3], right: spacing[3], padding: spacing[2] },
  company:      { fontSize: typography.sm, color: colors.textSecondary, marginTop: 2 },
  memberSince:  { fontSize: typography.xs, color: colors.textDisabled, marginTop: spacing[2] },
  bio:          { fontSize: typography.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing[3], lineHeight: 20, paddingHorizontal: spacing[3] },

  sparkCard:    { marginTop: spacing[3], gap: spacing[2] },
  sparkHead:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sparkTitle:   { fontSize: typography.sm, fontWeight: typography.weightSemibold, color: colors.textPrimary },
  sparkSub:     { fontSize: typography.xs, color: colors.textSecondary },
  sparkRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 48 },
  sparkBar:     { flex: 1, backgroundColor: colors.accent, borderRadius: 2, minWidth: 3 },
})

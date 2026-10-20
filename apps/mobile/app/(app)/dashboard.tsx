import { useCallback, useState } from 'react'
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native'
import { Text } from '@/components/ui/Text'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/stores/auth.store'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import api from '@/lib/api'
import { colors, spacing, typography } from '@/theme/tokens'

interface RecentScan {
  id: string; skill: string; verificationLayer: number; trustScore: number
  developer: { displayName: string | null }
  scannedAt: string
}

export default function DashboardScreen() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [scans, setScans]           = useState<RecentScan[]>([])
  const [saved, setSaved]           = useState<RecentScan[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const [recent, savedList] = await Promise.all([
        api.get<RecentScan[]>('/verify/recent'),
        api.get<RecentScan[]>('/verify/saved'),
      ])
      setScans(recent.data)
      setSaved(savedList.data)
    } catch {
      setError(true)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    load().finally(() => setLoading(false))
  }, [load]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={styles.greetingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{user?.displayName}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(app)/search')}
          activeOpacity={0.6}
          style={styles.searchBtn}
          hitSlop={10}
        >
          <Ionicons name="search-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>Could not load data. Pull down to refresh.</Text>}

      <Button onPress={() => router.push('/(app)/verify')} style={styles.cta}>
        Scan a credential
      </Button>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent scans</Text>
        {loading ? (
          <Card style={styles.recentCard}>
            <Text style={styles.emptyText}>Loading…</Text>
          </Card>
        ) : scans.length === 0 ? (
          <Card style={styles.recentCard}>
            <Text style={styles.emptyText}>
              No scans yet. Tap "Scan a credential" to verify a candidate.
            </Text>
          </Card>
        ) : (
          <View style={styles.list}>
            {scans.map(s => (
              <TouchableOpacity
                key={`${s.id}-${s.scannedAt}`}
                onPress={() => router.push(`/(app)/verify/${s.id}`)}
                activeOpacity={0.7}
              >
                <Card style={styles.recentCard}>
                  <View style={styles.recentRow}>
                    <View style={styles.recentLeft}>
                      <Text style={styles.recentSkill}>
                        {s.developer.displayName ?? 'Unknown'} · {s.skill}
                      </Text>
                      <View style={styles.badgeRow}>
                        <Badge variant="default">Layer {s.verificationLayer}</Badge>
                        <Badge variant="info">Score {s.trustScore}</Badge>
                      </View>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {saved.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved candidates</Text>
          <View style={styles.list}>
            {saved.map(s => (
              <TouchableOpacity
                key={`saved-${s.id}`}
                onPress={() => router.push(`/(app)/verify/${s.id}`)}
                activeOpacity={0.7}
              >
                <Card style={styles.recentCard}>
                  <View style={styles.recentRow}>
                    <View style={styles.recentLeft}>
                      <Text style={styles.recentSkill}>
                        {s.developer.displayName ?? 'Unknown'} · {s.skill}
                      </Text>
                      <View style={styles.badgeRow}>
                        <Badge variant="accent">Saved</Badge>
                        <Badge variant="default">Layer {s.verificationLayer}</Badge>
                      </View>
                    </View>
                    <Ionicons name="bookmark" size={18} color={colors.accent} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll:        { flex: 1, backgroundColor: colors.bg },
  container:     { padding: spacing[5], gap: spacing[5] },
  greeting:      { fontSize: typography.sm, color: colors.textSecondary },
  name:          { fontSize: typography['2xl'], fontWeight: typography.weightBold, color: colors.textPrimary, marginTop: 2 },
  error:         { fontSize: typography.sm, color: colors.danger, backgroundColor: colors.dangerSubtle, padding: spacing[3], borderRadius: 6 },
  cta:           { marginTop: spacing[2] },
  section:       { gap: spacing[3] },
  sectionTitle:  { fontSize: typography.base, fontWeight: typography.weightSemibold, color: colors.textPrimary },
  list:          { gap: spacing[3] },
  recentCard:    {},
  emptyText:     { fontSize: typography.sm, color: colors.textSecondary },
  recentRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  recentLeft:    { flex: 1, gap: spacing[2] },
  recentSkill:   { fontSize: typography.sm, fontWeight: typography.weightMedium, color: colors.textPrimary },
  badgeRow:      { flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' },
  chevron:       { fontSize: typography.xl, color: colors.textDisabled },
  greetingRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  searchBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
})

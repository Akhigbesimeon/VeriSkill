import { useEffect, useState, useCallback } from 'react'
import { View, ScrollView, StyleSheet, ActivityIndicator, Share, Linking, TouchableOpacity, Alert } from 'react-native'
import { Text } from '@/components/ui/Text'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuthStore } from '@/stores/auth.store'
import api from '@/lib/api'
import { colors, spacing, typography } from '@/theme/tokens'

interface OtherCredential {
  id: string; skill: string; verificationLayer: number; trustScore: number
}

interface VerifyResponse {
  id:                string
  skill:             string
  verificationLayer: number
  trustScore:        number
  lifecycleStatus:   string
  tokenId:           string | null
  commitHash:        string | null
  onChainMintedAt:   string | null
  developer:         {
    displayName: string | null
    email?:      string | null
    credentials?: OtherCredential[]
  }
  verified:          boolean
  saved?:            boolean
}

const PUBLIC_VERIFY_URL = (id: string) => `https://veriskill.io/verify/${id}`

function trustLabel(s: number): string {
  if (s >= 90) return 'Expert verified'
  if (s >= 80) return 'Community verified'
  if (s >= 60) return 'Peer verified'
  if (s >= 40) return 'GitHub verified'
  if (s >= 20) return 'URL verified'
  return 'Self declared'
}

function trustColor(s: number): string {
  if (s >= 80) return colors.success
  if (s >= 60) return colors.accent
  return colors.warning
}

function shortHash(hash: string | null): string {
  if (!hash) return '—'
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash
}

export default function VerifyResultScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const user    = useAuthStore(s => s.user)
  const isRecruiter = user?.role === 'recruiter'
  const [data,    setData]    = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!id) return
    api.get<VerifyResponse>(`/verify/${id}`)
      .then(r => setData(r.data))
      .catch(err => {
        if (err.response?.status === 404) setError('This credential is not verified on-chain.')
        else                               setError('Could not reach the verification service.')
      })
      .finally(() => setLoading(false))
  }, [id])

  const onShare = useCallback(() => {
    if (!data) return
    const name = data.developer.displayName ?? 'This developer'
    Share.share({
      message: `${name} has a VeriSkill ${data.skill} credential (score ${data.trustScore}/100). ${PUBLIC_VERIFY_URL(data.id)}`,
      url:     PUBLIC_VERIFY_URL(data.id),
    }).catch(() => {})
  }, [data])

  const onEmail = useCallback(() => {
    if (!data?.developer.email) return
    const subject = encodeURIComponent(`About your ${data.skill} credential on VeriSkill`)
    Linking.openURL(`mailto:${data.developer.email}?subject=${subject}`).catch(() => {
      Alert.alert('No mail app', 'Could not open an email client on this device.')
    })
  }, [data])

  const onToggleSave = useCallback(async () => {
    if (!data || saving) return
    setSaving(true)
    const nextSaved = !data.saved
    try {
      if (nextSaved) await api.post(`/verify/${data.id}/save`)
      else           await api.delete(`/verify/${data.id}/save`)
      setData({ ...data, saved: nextSaved })
    } catch {
      Alert.alert('Error', `Could not ${nextSaved ? 'save' : 'remove'} candidate.`)
    } finally {
      setSaving(false)
    }
  }, [data, saving])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.hint}>Checking the chain…</Text>
      </View>
    )
  }

  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.failTitle}>Not verified</Text>
        <Text style={styles.hint}>{error ?? 'Credential not found.'}</Text>
        <Button variant="secondary" onPress={() => router.replace('/(app)/verify')} style={{ marginTop: spacing[5] }}>
          Scan again
        </Button>
      </View>
    )
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.statusHeader}>
        <Text style={styles.verifiedLabel}>
          {data.verified ? '✓ Verified on-chain' : 'Not fully verified'}
        </Text>
        <Text style={styles.developer}>{data.developer.displayName ?? 'Unknown developer'}</Text>
        <Text style={styles.skill}>{data.skill}</Text>
      </View>

      <Card>
        <View style={styles.scoreRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>Trust band</Text>
            <Text style={styles.bandText}>{trustLabel(data.trustScore)}</Text>
            <View style={styles.badgeRow}>
              <Badge variant="accent">Layer {data.verificationLayer}</Badge>
            </View>
          </View>
          <View style={styles.scoreBox}>
            <Text style={[styles.score, { color: trustColor(data.trustScore) }]}>{data.trustScore}</Text>
            <Text style={styles.scoreUnit}>/ 100</Text>
          </View>
        </View>
      </Card>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={onShare} activeOpacity={0.6}>
          <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
          <Text style={styles.actionLabel}>Share</Text>
        </TouchableOpacity>
        {isRecruiter && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onToggleSave}
            activeOpacity={0.6}
            disabled={saving}
          >
            <Ionicons
              name={data.saved ? 'bookmark' : 'bookmark-outline'}
              size={22}
              color={data.saved ? colors.accent : colors.textPrimary}
            />
            <Text style={[styles.actionLabel, data.saved && { color: colors.accent }]}>
              {data.saved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
        )}
        {isRecruiter && data.developer.email && (
          <TouchableOpacity style={styles.actionBtn} onPress={onEmail} activeOpacity={0.6}>
            <Ionicons name="mail-outline" size={22} color={colors.textPrimary} />
            <Text style={styles.actionLabel}>Email</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Drill-through: developer's other credentials */}
      {data.developer.credentials && data.developer.credentials.length > 0 && (
        <Card>
          <Text style={styles.sectionTitle}>
            Other credentials by {data.developer.displayName ?? 'this developer'}
          </Text>
          {data.developer.credentials.map(c => (
            <TouchableOpacity
              key={c.id}
              style={styles.otherRow}
              activeOpacity={0.6}
              onPress={() => router.replace(`/(app)/verify/${c.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.otherSkill}>{c.skill}</Text>
                <View style={styles.otherBadges}>
                  <Badge variant="default">Layer {c.verificationLayer}</Badge>
                  <Badge variant="info">Score {c.trustScore}</Badge>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
            </TouchableOpacity>
          ))}
        </Card>
      )}

      <Card>
        <Text style={styles.sectionTitle}>On-chain record</Text>
        <View style={styles.kv}><Text style={styles.k}>Token ID</Text><Text style={styles.v}>#{data.tokenId ?? '—'}</Text></View>
        <View style={styles.kv}><Text style={styles.k}>Commit hash</Text><Text style={styles.v}>{shortHash(data.commitHash)}</Text></View>
        <View style={styles.kv}>
          <Text style={styles.k}>Minted</Text>
          <Text style={styles.v}>{data.onChainMintedAt ? new Date(data.onChainMintedAt).toLocaleDateString() : '—'}</Text>
        </View>
      </Card>

      <Button onPress={() => router.replace('/(app)/verify')} style={{ marginTop: spacing[2] }}>
        Scan another
      </Button>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll:        { flex: 1, backgroundColor: colors.bg },
  container:     { padding: spacing[5], gap: spacing[4] },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6], backgroundColor: colors.bg },
  hint:          { fontSize: typography.sm, color: colors.textSecondary, marginTop: spacing[3], textAlign: 'center' },
  failTitle:     { fontSize: typography.xl, fontWeight: typography.weightSemibold, color: colors.danger },

  statusHeader:  { gap: spacing[1] },
  verifiedLabel: { fontSize: typography.sm, fontWeight: typography.weightSemibold, color: colors.success },
  developer:     { fontSize: typography.sm, color: colors.textSecondary, marginTop: spacing[2] },
  skill:         { fontSize: typography['2xl'], fontWeight: typography.weightBold, color: colors.textPrimary },

  scoreRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  statLabel:     { fontSize: typography.xs, color: colors.textSecondary },
  bandText:      { fontSize: typography.base, fontWeight: typography.weightSemibold, color: colors.textPrimary, marginTop: spacing[1] },
  badgeRow:      { flexDirection: 'row', gap: spacing[2], marginTop: spacing[3], flexWrap: 'wrap' },
  scoreBox:      { alignItems: 'center' },
  score:         { fontSize: typography['3xl'], fontWeight: typography.weightBold },
  scoreUnit:     { fontSize: typography.xs, color: colors.textSecondary },

  sectionTitle:  { fontSize: typography.sm, fontWeight: typography.weightSemibold, color: colors.textPrimary, marginBottom: spacing[3] },
  kv:            { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[2] },
  k:             { fontSize: typography.sm, color: colors.textSecondary },
  v:             { fontSize: typography.sm, color: colors.textPrimary, fontVariant: ['tabular-nums'] },

  actionRow:     { flexDirection: 'row', gap: spacing[2] },
  actionBtn:     {
    flex: 1, alignItems: 'center', gap: spacing[1],
    paddingVertical: spacing[3], borderRadius: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  actionLabel:   { fontSize: typography.xs, fontWeight: typography.weightMedium, color: colors.textPrimary },

  otherRow:      {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  otherSkill:    { fontSize: typography.sm, fontWeight: typography.weightMedium, color: colors.textPrimary },
  otherBadges:   { flexDirection: 'row', gap: spacing[2], marginTop: spacing[1], flexWrap: 'wrap' },
})

import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/Text'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import api from '@/lib/api'
import { colors, spacing, typography, radius } from '@/theme/tokens'

interface SearchResult {
  id:          string
  displayName: string
  email:       string
  credentials: { id: string; skill: string; verificationLayer: number; trustScore: number }[]
}

export default function SearchScreen() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hint, setHint] = useState<string | null>('Type a name or email to search.')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const query = q.trim()
    if (query.length < 2) {
      setResults([])
      setHint(query.length === 0 ? 'Type a name or email to search.' : 'Keep typing…')
      return
    }
    setLoading(true)
    setHint(null)
    timer.current = setTimeout(() => {
      api.get<SearchResult[]>(`/verify/search?q=${encodeURIComponent(query)}`)
        .then(r => {
          setResults(r.data)
          if (r.data.length === 0) setHint('No developers match.')
        })
        .catch(() => setHint('Search failed. Try again.'))
        .finally(() => setLoading(false))
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  return (
    <View style={styles.page}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder="Search developers by name or email"
          placeholderTextColor={colors.textDisabled}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.textDisabled} />
          </TouchableOpacity>
        )}
      </View>

      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing[5] }} />}
      {!loading && hint && <Text style={styles.hint}>{hint}</Text>}

      <FlatList
        data={results}
        keyExtractor={d => d.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: d }) => {
          const top = d.credentials[0]
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={!top}
              onPress={() => top && router.push(`/(app)/verify/${top.id}`)}
            >
              <Card>
                <Text style={styles.name}>{d.displayName}</Text>
                <Text style={styles.email}>{d.email}</Text>
                <View style={styles.badges}>
                  {d.credentials.length === 0 ? (
                    <Badge variant="default">No minted credentials</Badge>
                  ) : d.credentials.map(c => (
                    <Badge key={c.id} variant="info">{c.skill} · L{c.verificationLayer}</Badge>
                  ))}
                </View>
              </Card>
            </TouchableOpacity>
          )
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing[3] }} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  page:      { flex: 1, backgroundColor: colors.bg, padding: spacing[5] },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    paddingHorizontal: spacing[3], paddingVertical: spacing[2],
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
  },
  input:     { flex: 1, fontSize: typography.base, color: colors.textPrimary, paddingVertical: spacing[2] },
  hint:      { fontSize: typography.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing[6] },
  list:      { paddingVertical: spacing[4] },
  name:      { fontSize: typography.base, fontWeight: typography.weightSemibold, color: colors.textPrimary },
  email:     { fontSize: typography.sm, color: colors.textSecondary, marginTop: 2 },
  badges:    { flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap', marginTop: spacing[3] },
})

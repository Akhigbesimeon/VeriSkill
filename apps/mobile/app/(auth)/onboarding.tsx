import { useRef, useState } from 'react'
import {
  View, ScrollView, StyleSheet, TouchableOpacity,
  useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { colors, spacing, typography, radius, shadow } from '@/theme/tokens'

type Slide = {
  eyebrow: string
  title: string
  body: string
  card: {
    status: string
    skill: string
    verifiers: string
    score: number | null
    ink?: boolean
  }
}

const SLIDES: Slide[] = [
  {
    eyebrow: 'Layer 01 · Self-attestation',
    title: 'Declare the skill you can perform.',
    body: 'Timestamped and signed to your wallet — the foundation every verification layer builds on.',
    card: { status: 'Draft', skill: 'TypeScript', verifiers: 'Self-attested', score: null },
  },
  {
    eyebrow: 'Layer 02 · Peer verification',
    title: 'People who watched you work vouch for the claim.',
    body: 'Reviews are weighted by each peer’s own verified standing — so the signal tightens with the signatures.',
    card: { status: 'In review', skill: 'React · Production', verifiers: '3 peer signatures', score: 68 },
  },
  {
    eyebrow: 'Layer 03 · Expert review',
    title: 'A tamper-evident receipt, minted on-chain.',
    body: 'A domain expert audits the evidence. On approval, your credential becomes a signed record you can carry anywhere.',
    card: { status: 'Minted', skill: 'Distributed Systems', verifiers: '4 expert signatures', score: 92, ink: true },
  },
]

export default function OnboardingScreen() {
  const { width } = useWindowDimensions()
  const [index, setIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const router = useRouter()

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width)
    if (next !== index) setIndex(next)
  }

  const goNext = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true })
    } else {
      router.replace('/(auth)/register')
    }
  }

  const isLast = index === SLIDES.length - 1

  return (
    <View style={styles.flex}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          accessibilityRole="button"
          hitSlop={10}
        >
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.flex}
      >
        {SLIDES.map((s, i) => {
          const ink = !!s.card.ink
          return (
            <View key={i} style={[styles.slide, { width }]}>
              <View style={[styles.card, ink && styles.cardInk]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardLabel, ink && styles.cardLabelInk]}>
                    Credential · Layer {i + 1}
                  </Text>
                  <View style={[styles.chip, ink && styles.chipInk]}>
                    <Text style={[styles.chipText, ink && styles.chipTextInk]}>{s.card.status}</Text>
                  </View>
                </View>
                <Text style={[styles.cardSkill, ink && styles.textOnInk]}>{s.card.skill}</Text>
                <View style={styles.cardFoot}>
                  <View style={styles.footCol}>
                    <Text style={[styles.footLabel, ink && styles.footLabelInk]}>Verifiers</Text>
                    <Text style={[styles.footValue, ink && styles.textOnInk]}>{s.card.verifiers}</Text>
                  </View>
                  {s.card.score != null && (
                    <View style={[styles.footCol, { alignItems: 'flex-end' }]}>
                      <Text style={[styles.footLabel, ink && styles.footLabelInk]}>Trust</Text>
                      <Text style={[styles.score, ink && styles.textOnInk]}>{s.card.score}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.copy}>
                <Text style={styles.eyebrow}>{s.eyebrow}</Text>
                <Text style={styles.heading}>{s.title}</Text>
                <Text style={styles.body}>{s.body}</Text>
              </View>
            </View>
          )
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityRole="progressbar" accessibilityValue={{ now: index + 1, min: 1, max: SLIDES.length }}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        {isLast ? (
          <View style={styles.ctaStack}>
            <Button onPress={() => router.replace('/(auth)/register')} size="lg">
              Create your account
            </Button>
            <Button onPress={() => router.replace('/(auth)/login')} variant="ghost" size="md">
              I already have an account
            </Button>
          </View>
        ) : (
          <Button onPress={goNext} size="lg">Next</Button>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    paddingHorizontal: spacing[6], paddingTop: spacing[12], paddingBottom: spacing[2],
  },
  skip: { fontSize: typography.sm, color: colors.textSecondary, fontWeight: typography.weightMedium },

  slide: {
    paddingHorizontal: spacing[6],
    flex: 1, justifyContent: 'center', alignItems: 'stretch',
  },

  // Credential card — mirrors the web hero visual.
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing[5],
    gap: spacing[4],
    ...shadow.md,
  },
  cardInk: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: {
    fontSize: typography.xs, color: colors.textSecondary,
    fontWeight: typography.weightMedium, letterSpacing: 0.3,
  },
  cardLabelInk: { color: '#9d99c9' },
  chip: {
    paddingHorizontal: spacing[2], paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
  },
  chipInk: { backgroundColor: 'rgba(252,251,248,0.12)' },
  chipText: { fontSize: typography.xs, color: colors.textPrimary, fontWeight: typography.weightMedium },
  chipTextInk: { color: colors.textInverse },

  cardSkill: {
    fontSize: typography['2xl'], fontWeight: typography.weightSemibold,
    color: colors.textPrimary,
  },
  textOnInk: { color: colors.textInverse },

  cardFoot: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing[3],
  },
  footCol: { gap: 2 },
  footLabel: {
    fontSize: typography.xs, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  footLabelInk: { color: '#9d99c9' },
  footValue: { fontSize: typography.sm, color: colors.textPrimary, fontWeight: typography.weightMedium },
  score: { fontSize: typography.xl, color: colors.textPrimary, fontWeight: typography.weightBold },

  copy: { marginTop: spacing[8], gap: spacing[2] },
  eyebrow: {
    fontSize: typography.xs, color: colors.accent,
    textTransform: 'uppercase', letterSpacing: 0.8,
    fontWeight: typography.weightSemibold,
  },
  heading: {
    fontSize: typography['2xl'], fontWeight: typography.weightBold,
    color: colors.textPrimary, lineHeight: 32,
  },
  body: {
    fontSize: typography.base, color: colors.textSecondary, lineHeight: 24,
  },

  footer: {
    paddingHorizontal: spacing[6], paddingBottom: spacing[8], paddingTop: spacing[4],
    gap: spacing[4],
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing[2], marginBottom: spacing[2] },
  dot: {
    width: 6, height: 6, borderRadius: radius.full,
    backgroundColor: colors.borderStrong,
  },
  dotActive: { backgroundColor: colors.textPrimary, width: 20 },

  ctaStack: { gap: spacing[2] },
})

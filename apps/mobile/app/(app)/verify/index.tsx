import { useState, useRef } from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { Text } from '@/components/ui/Text'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter, useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { colors, spacing, typography, radius } from '@/theme/tokens'

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function extractCredentialId(raw: string): string | null {
  const match = raw.match(UUID_RE)
  return match ? match[0] : null
}

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(true)
  const lastScanRef = useRef<number>(0)

  useFocusEffect(useCallback(() => {
    setActive(true)
    setError(null)
    return () => { setActive(false) }
  }, []))

  const handleScan = ({ data }: { data: string }) => {
    const now = Date.now()
    if (now - lastScanRef.current < 1500) return
    lastScanRef.current = now

    const id = extractCredentialId(data)
    if (!id) {
      setError('That QR code is not a VeriSkill credential.')
      return
    }
    setError(null)
    setActive(false)
    router.push(`/(app)/verify/${id}`)
  }

  if (!permission) {
    return <View style={styles.centered} />
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permHint}>
          VeriSkill uses the camera to scan credential QR codes. No frames are stored or uploaded.
        </Text>
        <Button onPress={requestPermission} style={{ marginTop: spacing[5] }}>
          Grant access
        </Button>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {active && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleScan}
        />
      )}

      {/* Framing overlay */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBanner}>
          <Text style={styles.bannerText}>Point the camera at a credential QR</Text>
        </View>

        <View style={styles.frame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {error && (
          <TouchableOpacity onPress={() => setError(null)} style={styles.errorBanner} activeOpacity={0.8}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorDismiss}>Tap to dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const FRAME = 260

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#000' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6], backgroundColor: colors.bg },
  permTitle: { fontSize: typography.lg, fontWeight: typography.weightSemibold, color: colors.textPrimary },
  permHint:  { fontSize: typography.sm, color: colors.textSecondary, marginTop: spacing[3], textAlign: 'center', lineHeight: 20 },

  overlay:   { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBanner: {
    position: 'absolute', top: spacing[6], left: spacing[5], right: spacing[5],
    paddingVertical: spacing[3], paddingHorizontal: spacing[4],
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.md,
  },
  bannerText: { color: '#fff', fontSize: typography.sm, textAlign: 'center' },

  frame: { width: FRAME, height: FRAME },
  corner: {
    position: 'absolute', width: 32, height: 32,
    borderColor: '#fff',
  },
  cornerTL: { top: 0,    left: 0,    borderTopWidth: 3, borderLeftWidth:  3, borderTopLeftRadius:     radius.md },
  cornerTR: { top: 0,    right: 0,   borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius:    radius.md },
  cornerBL: { bottom: 0, left: 0,    borderBottomWidth: 3, borderLeftWidth:  3, borderBottomLeftRadius:  radius.md },
  cornerBR: { bottom: 0, right: 0,   borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: radius.md },

  errorBanner: {
    position: 'absolute', bottom: spacing[8], left: spacing[5], right: spacing[5],
    padding: spacing[4], backgroundColor: colors.danger, borderRadius: radius.md,
  },
  errorText:    { color: '#fff', fontSize: typography.sm, fontWeight: typography.weightSemibold },
  errorDismiss: { color: 'rgba(255,255,255,0.75)', fontSize: typography.xs, marginTop: spacing[1] },
})

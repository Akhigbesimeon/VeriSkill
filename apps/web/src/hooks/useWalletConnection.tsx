import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { WalletConnectModal, WalletChoice, revokeAllWalletPermissions } from '@/components/wallet/WalletConnectModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { extractErrorMessage } from '@/lib/api'

export function useWalletConnection() {
  const { user, updateWallet } = useAuthStore()
  const [connectOpen, setConnectOpen]       = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const hasSelfCustody = user?.walletType === 'self_custody' && !!user?.walletAddress

  async function handleSelect(choice: WalletChoice) {
    setError(null)
    setSaving(true)
    try {
      if (choice.type === 'managed') await updateWallet('managed')
      else                           await updateWallet('self_custody', choice.address)
      setConnectOpen(false)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save wallet.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    setError(null)
    setSaving(true)
    try {
      await revokeAllWalletPermissions()
      await updateWallet('managed')
      setDisconnectOpen(false)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not disconnect wallet.'))
    } finally {
      setSaving(false)
    }
  }

  const openConnect    = () => { setError(null); setConnectOpen(true) }
  const openDisconnect = () => { setError(null); setDisconnectOpen(true) }

  const modals = (
    <>
      <WalletConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onSelect={handleSelect}
      />
      <ConfirmDialog
        open={disconnectOpen}
        title="Disconnect wallet?"
        message="VeriSkill will manage your wallet again. You can reconnect any time."
        confirmLabel="Disconnect"
        cancelLabel="Keep connected"
        variant="danger"
        loading={saving}
        onConfirm={handleDisconnect}
        onCancel={() => setDisconnectOpen(false)}
      />
    </>
  )

  return {
    hasSelfCustody,
    address: user?.walletAddress ?? null,
    saving,
    error,
    openConnect,
    openDisconnect,
    modals,
  }
}

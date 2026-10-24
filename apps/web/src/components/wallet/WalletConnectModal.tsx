import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, Search } from 'lucide-react'
import { useModalShell } from '@/hooks/useModalShell'
import styles from './WalletConnectModal.module.css'

export type WalletChoice =
  | { type: 'managed' }
  | { type: 'self_custody'; provider: 'metamask' | 'phantom' | 'coinbase' | 'injected'; address: string }

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (choice: WalletChoice) => void
}

interface EthereumProvider {
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  providers?: EthereumProvider[]
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

interface EIP6963ProviderInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo
  provider: EthereumProvider
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
    phantom?: { ethereum?: EthereumProvider }
  }
  interface WindowEventMap {
    'eip6963:announceProvider': CustomEvent<EIP6963ProviderDetail>
  }
}

type WalletKind = 'metamask' | 'phantom' | 'coinbase' | 'injected'

interface CatalogWallet {
  key: string
  name: string
  rdns?: string
  detect?: () => EthereumProvider | undefined
  kind: WalletKind
  installUrl?: string
}

function pickInjected(predicate: (p: EthereumProvider) => boolean): EthereumProvider | undefined {
  const eth = window.ethereum
  if (!eth) return undefined
  if (eth.providers && eth.providers.length > 0) {
    return eth.providers.find(predicate) ?? (predicate(eth) ? eth : undefined)
  }
  return predicate(eth) ? eth : undefined
}

async function tryRevoke(provider: EthereumProvider | undefined): Promise<void> {
  if (!provider) return
  try {
    await provider.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    })
  } catch {
    // Older wallets or non-connected providers may not support revoke.
  }
}

export async function revokeAllWalletPermissions(): Promise<void> {
  const providers: EthereumProvider[] = []
  const eth = window.ethereum
  if (eth) {
    providers.push(eth)
    if (eth.providers) providers.push(...eth.providers)
  }
  if (window.phantom?.ethereum) providers.push(window.phantom.ethereum)

  const announced: EthereumProvider[] = []
  const onAnnounce = (event: CustomEvent<EIP6963ProviderDetail>) => {
    if (event.detail?.provider) announced.push(event.detail.provider)
  }
  window.addEventListener('eip6963:announceProvider', onAnnounce)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  await new Promise(resolve => setTimeout(resolve, 50))
  window.removeEventListener('eip6963:announceProvider', onAnnounce)

  const unique = Array.from(new Set([...providers, ...announced]))
  await Promise.all(unique.map(tryRevoke))
}

async function requestAddress(provider: EthereumProvider): Promise<string> {
  try {
    await provider.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    })
  } catch (err) {
    const code = (err as { code?: number } | null)?.code
    if (code === 4001) throw err
  }
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts || accounts.length === 0) throw new Error('No account returned.')
  return accounts[0]
}

const WALLET_CATALOG: CatalogWallet[] = [
  { key: 'metamask', name: 'MetaMask', rdns: 'io.metamask', detect: () => pickInjected(p => !!p.isMetaMask), kind: 'metamask', installUrl: 'https://metamask.io/download/' },
  { key: 'phantom', name: 'Phantom', rdns: 'app.phantom', detect: () => window.phantom?.ethereum, kind: 'phantom', installUrl: 'https://phantom.app/download' },
  { key: 'coinbase', name: 'Coinbase Wallet', rdns: 'com.coinbase.wallet', detect: () => pickInjected(p => !!p.isCoinbaseWallet), kind: 'coinbase', installUrl: 'https://www.coinbase.com/wallet/downloads' },
  { key: 'binance', name: 'Binance Wallet', rdns: 'com.binance.wallet', detect: () => (window as unknown as { BinanceChain?: EthereumProvider }).BinanceChain, kind: 'injected', installUrl: 'https://www.binance.com/en/web3wallet' },
  { key: 'trust', name: 'Trust Wallet', rdns: 'com.trustwallet.app', detect: () => pickInjected(p => !!(p as { isTrust?: boolean }).isTrust || !!(p as { isTrustWallet?: boolean }).isTrustWallet), kind: 'injected', installUrl: 'https://trustwallet.com/download' },
  { key: 'okx', name: 'OKX Wallet', rdns: 'com.okex.wallet', detect: () => (window as unknown as { okxwallet?: EthereumProvider }).okxwallet ?? pickInjected(p => !!(p as { isOkxWallet?: boolean }).isOkxWallet), kind: 'injected', installUrl: 'https://www.okx.com/web3' },
  { key: 'rabby', name: 'Rabby Wallet', rdns: 'io.rabby', detect: () => pickInjected(p => !!(p as { isRabby?: boolean }).isRabby), kind: 'injected', installUrl: 'https://rabby.io/' },
  { key: 'brave', name: 'Brave Wallet', rdns: 'com.brave.wallet', detect: () => pickInjected(p => !!(p as { isBraveWallet?: boolean }).isBraveWallet), kind: 'injected', installUrl: 'https://brave.com/wallet/' },
  { key: 'rainbow', name: 'Rainbow', rdns: 'me.rainbow', kind: 'injected', installUrl: 'https://rainbow.me/' },
  { key: 'zerion', name: 'Zerion', rdns: 'io.zerion.wallet', detect: () => pickInjected(p => !!(p as { isZerion?: boolean }).isZerion), kind: 'injected', installUrl: 'https://zerion.io/extension' },
  { key: 'exodus', name: 'Exodus', rdns: 'com.exodus', detect: () => pickInjected(p => !!(p as { isExodus?: boolean }).isExodus), kind: 'injected', installUrl: 'https://www.exodus.com/download/' },
  { key: 'safepal', name: 'SafePal', rdns: 'io.safepal', detect: () => pickInjected(p => !!(p as { isSafePal?: boolean }).isSafePal), kind: 'injected', installUrl: 'https://www.safepal.com/download' },
  { key: 'tokenpocket', name: 'TokenPocket', rdns: 'pro.tokenpocket', detect: () => pickInjected(p => !!(p as { isTokenPocket?: boolean }).isTokenPocket), kind: 'injected', installUrl: 'https://www.tokenpocket.pro/en/download/app' },
  { key: 'frame', name: 'Frame', rdns: 'sh.frame', detect: () => pickInjected(p => !!(p as { isFrame?: boolean }).isFrame), kind: 'injected', installUrl: 'https://frame.sh/' },
  { key: 'enkrypt', name: 'Enkrypt', rdns: 'com.enkrypt', kind: 'injected', installUrl: 'https://www.enkrypt.com/download' },
  { key: 'mew', name: 'MyEtherWallet', rdns: 'com.myetherwallet', kind: 'injected', installUrl: 'https://www.myetherwallet.com/wallet/access' },
  { key: 'ledger', name: 'Ledger', rdns: 'com.ledger', kind: 'injected', installUrl: 'https://www.ledger.com/ledger-live' },
]

const CATALOG_BY_KEY = Object.fromEntries(WALLET_CATALOG.map(w => [w.key, w])) as Record<string, CatalogWallet>
const CATALOG_RDNS = new Set(WALLET_CATALOG.map(w => w.rdns).filter(Boolean) as string[])
const PRIMARY_KEYS = ['metamask', 'phantom', 'coinbase'] as const

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface WcListing {
  image_id?: string
  name?: string
  slug?: string
  rdns?: string
}

async function fetchWalletConnectLogos(projectId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const res = await fetch(
      `https://explorer-api.walletconnect.com/v3/wallets?projectId=${encodeURIComponent(projectId)}&entries=500&page=1`,
    )
    if (!res.ok) return map
    const data = (await res.json()) as { listings?: Record<string, WcListing> }
    const listings = Object.values(data?.listings ?? {})
    if (listings.length === 0) return map

    for (const w of WALLET_CATALOG) {
      const nName = normalizeKey(w.name)
      const nKey = normalizeKey(w.key)
      let picked: WcListing | undefined
      // 1. Prefer exact name match (handles ambiguous rdns like Coinbase's two listings).
      picked = listings.find(l => normalizeKey(l.name ?? '') === nName)
      // 2. Exact slug match.
      if (!picked) picked = listings.find(l => normalizeKey(l.slug ?? '') === nKey)
      // 3. Exact rdns match.
      if (!picked && w.rdns) picked = listings.find(l => l.rdns === w.rdns)
      // 4. Fuzzy includes (e.g. "Ledger" matches "Ledger Wallet", "mew" matches "MEW wallet").
      if (!picked) {
        picked = listings.find(l => {
          const n = normalizeKey(l.name ?? '')
          return n.includes(nKey) || nName.includes(n) || n.includes(nName)
        })
      }
      if (picked?.image_id) {
        map.set(w.key, `https://explorer-api.walletconnect.com/v3/logo/md/${picked.image_id}?projectId=${encodeURIComponent(projectId)}`)
      }
    }
  } catch {
    // Falls through to local-file / letter fallbacks.
  }
  return map
}

function WalletIcon({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  if (failed) {
    return <div className={styles.iconFallback} aria-hidden>{name.charAt(0).toUpperCase()}</div>
  }
  return <img src={src} alt="" onError={() => setFailed(true)} />
}

interface WalletEntry {
  key: string
  name: string
  iconSrc: string
  installed: boolean
  onClick: () => void
}

export function WalletConnectModal({ open, onClose, onSelect }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<EIP6963ProviderDetail[]>([])
  const [view, setView] = useState<'primary' | 'all'>('primary')
  const [search, setSearch] = useState('')
  const [wcLogos, setWcLogos] = useState<Map<string, string>>(new Map())

  useModalShell(open, onClose)

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(null)
    setView('primary')
    setSearch('')
  }, [open])

  useEffect(() => {
    if (!open) {
      setDiscovered([])
      return
    }
    const seen = new Set<string>()
    function onAnnounce(event: CustomEvent<EIP6963ProviderDetail>) {
      const detail = event.detail
      if (!detail?.info?.uuid || seen.has(detail.info.uuid)) return
      seen.add(detail.info.uuid)
      setDiscovered(prev => [...prev, detail])
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
    }
  }, [open])

  useEffect(() => {
    if (!open || !WC_PROJECT_ID || wcLogos.size > 0) return
    let cancelled = false
    fetchWalletConnectLogos(WC_PROJECT_ID).then(map => {
      if (!cancelled) setWcLogos(map)
    })
    return () => { cancelled = true }
  }, [open, wcLogos.size])

  async function connect(name: string, getProvider: () => EthereumProvider | undefined, kind: WalletKind) {
    setError(null)
    setBusy(name)
    try {
      const provider = getProvider()
      if (!provider) {
        throw new Error(`${name} is not installed in this browser.`)
      }
      const address = await requestAddress(provider)
      onSelect({ type: 'self_custody', provider: kind, address })
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to connect to ${name}.`
      setError(msg)
    } finally {
      setBusy(null)
    }
  }

  function handleCatalogClick(w: CatalogWallet, announced?: EIP6963ProviderDetail) {
    const legacy = !announced && w.detect ? w.detect() : undefined
    const provider = announced?.provider ?? legacy
    if (provider) {
      connect(w.name, () => provider, w.kind)
    } else if (w.installUrl) {
      window.open(w.installUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const discoveredByRdns = useMemo(() => {
    const map = new Map<string, EIP6963ProviderDetail>()
    for (const d of discovered) map.set(d.info.rdns, d)
    return map
  }, [discovered])

  function resolveIcon(w: CatalogWallet, announced?: EIP6963ProviderDetail): string {
    if (announced?.info?.icon) return announced.info.icon
    const wc = wcLogos.get(w.key)
    if (wc) return wc
    return `/wallets/${w.key}.svg`
  }

  const extraDiscovered = useMemo(
    () => discovered.filter(d => !CATALOG_RDNS.has(d.info.rdns)),
    [discovered],
  )

  const allWallets = useMemo<WalletEntry[]>(() => {
    const entries: WalletEntry[] = []
    const seenRdns = new Set<string>()

    for (const w of WALLET_CATALOG) {
      const announced = w.rdns ? discoveredByRdns.get(w.rdns) : undefined
      if (w.rdns) seenRdns.add(w.rdns)
      const legacy = !announced && w.detect ? w.detect() : undefined
      const provider = announced?.provider ?? legacy
      entries.push({
        key: w.key,
        name: announced?.info.name ?? w.name,
        iconSrc: resolveIcon(w, announced),
        installed: !!provider,
        onClick: () => handleCatalogClick(w, announced),
      })
    }

    for (const d of discovered) {
      if (seenRdns.has(d.info.rdns)) continue
      entries.push({
        key: d.info.uuid,
        name: d.info.name,
        iconSrc: d.info.icon,
        installed: true,
        onClick: () => connect(d.info.name, () => d.provider, 'injected'),
      })
    }

    return entries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovered, discoveredByRdns])

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allWallets
    return allWallets.filter(w => w.name.toLowerCase().includes(q))
  }, [allWallets, search])

  if (!open) return null

  function renderPrimaryButton(key: typeof PRIMARY_KEYS[number]) {
    const w = CATALOG_BY_KEY[key]
    const announced = w.rdns ? discoveredByRdns.get(w.rdns) : undefined
    const legacy = !announced && w.detect ? w.detect() : undefined
    const provider = announced?.provider ?? legacy
    const iconSrc = resolveIcon(w, announced)
    return (
      <button
        key={w.key}
        type="button"
        className={styles.option}
        onClick={() => {
          if (provider) connect(w.name, () => provider, w.kind)
          else if (w.installUrl) window.open(w.installUrl, '_blank', 'noopener,noreferrer')
        }}
        disabled={busy !== null}
      >
        <div className={`${styles.iconWrap} ${styles.brandIcon}`} aria-hidden>
          <WalletIcon src={iconSrc} name={w.name} />
        </div>
        <div className={styles.optionBody}>
          <span className={styles.optionName}>{w.name}</span>
          <span className={styles.optionMeta}>
            {provider ? `Connect using the ${w.name} extension.` : `Install the ${w.name} extension to connect.`}
          </span>
        </div>
        {busy === w.name && <span className={styles.badge}>Connecting…</span>}
        {!provider && busy === null && <span className={styles.badge}>Install</span>}
      </button>
    )
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      onClick={onClose}
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {view === 'primary' ? (
          <>
            <div className={styles.header}>
              <div>
                <div id="wallet-modal-title" className={styles.title}>Connect a wallet</div>
                <div className={styles.subtitle}>
                  Choose how you want to hold credentials and signatures.
                </div>
              </div>
              <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className={styles.list}>
              {PRIMARY_KEYS.map(renderPrimaryButton)}

              {extraDiscovered.map(({ info, provider }) => (
                <button
                  key={info.uuid}
                  type="button"
                  className={styles.option}
                  onClick={() => connect(info.name, () => provider, 'injected')}
                  disabled={busy !== null}
                >
                  <div className={`${styles.iconWrap} ${styles.brandIcon}`} aria-hidden>
                    <WalletIcon src={info.icon} name={info.name} />
                  </div>
                  <div className={styles.optionBody}>
                    <span className={styles.optionName}>{info.name}</span>
                    <span className={styles.optionMeta}>Connect using the {info.name} extension.</span>
                  </div>
                  {busy === info.name && <span className={styles.badge}>Connecting…</span>}
                </button>
              ))}

              <button
                type="button"
                className={styles.option}
                onClick={() => setView('all')}
                disabled={busy !== null}
              >
                <div className={styles.iconWrap} aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                  </svg>
                </div>
                <div className={styles.optionBody}>
                  <span className={styles.optionName}>All wallets</span>
                  <span className={styles.optionMeta}>Browse every supported wallet.</span>
                </div>
              </button>
            </div>

            {error && <div className={styles.errorMsg} role="alert">{error}</div>}

            <div className={styles.footer}>
              You can switch wallets later from your account settings.
            </div>
          </>
        ) : (
          <>
            <div className={styles.secondaryHeader}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setView('primary')}
                aria-label="Back"
              >
                <ChevronLeft size={18} />
              </button>
              <div className={styles.secondaryTitle}>All Wallets</div>
              <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className={styles.searchWrap}>
              <Search size={16} className={styles.searchIcon} aria-hidden />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search wallet"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            {filteredAll.length === 0 ? (
              <div className={styles.emptyState}>No wallets match your search.</div>
            ) : (
              <div className={styles.grid}>
                {filteredAll.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    className={styles.tile}
                    onClick={w.onClick}
                    disabled={busy !== null}
                    title={w.installed ? `Connect ${w.name}` : `Install ${w.name}`}
                  >
                    <div className={styles.tileIcon} aria-hidden>
                      <WalletIcon src={w.iconSrc} name={w.name} />
                    </div>
                    <div className={styles.tileName}>{w.name}</div>
                    {!w.installed && <span className={styles.tileBadge}>Install</span>}
                  </button>
                ))}
              </div>
            )}

            {error && <div className={styles.errorMsg} role="alert">{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}

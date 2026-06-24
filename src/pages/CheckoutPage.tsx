import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import OnboardingLayout from '../components/onboarding/OnboardingLayout'

const ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin Testnet', network: 'BTC_TESTNET', icon: '₿', desc: 'Pay using BTC Testnet wallet' },
  { symbol: 'ETH', name: 'Sepolia ETH', network: 'ETH_SEPOLIA', icon: 'Ξ', desc: 'Pay using Sepolia Ethereum' },
  { symbol: 'TEST_STABLECOIN', name: 'Test Stablecoin (USDC/USDT)', network: 'STABLECOIN_SEPOLIA', icon: '₮', desc: 'ERC-20 transfer on Sepolia' },
]

/** Ordered status steps for the progress pipeline */
const PIPELINE_STEPS = [
  { key: 'PAYMENT_DETECTED', label: 'Broadcast', icon: '📡' },
  { key: 'CONFIRMING', label: 'Confirming', icon: '⏳' },
  { key: 'CONFIRMED', label: 'Confirmed', icon: '✓' },
  { key: 'CONVERTED_TO_SGD', label: 'Converted', icon: '💱' },
  { key: 'SETTLED', label: 'Settled', icon: '🏦' },
]

function getStepIndex(status: string): number {
  const idx = PIPELINE_STEPS.findIndex(s => s.key === status)
  return idx >= 0 ? idx : -1
}

/** CSS keyframes injected once */
const STYLE_ID = 'checkout-smooth-styles'
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes ckout-fadein { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes ckout-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes ckout-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes ckout-celebrate-pop { 0% { transform: scale(0.6); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
    @keyframes ckout-confetti-fall { 0% { transform: translateY(-100%) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
    @keyframes ckout-check-draw { 0% { stroke-dashoffset: 40; } 100% { stroke-dashoffset: 0; } }
    @keyframes ckout-ring-expand { 0% { transform: scale(0.3); opacity: 0; } 60% { opacity: 1; } 100% { transform: scale(1); opacity: 0; } }
    @keyframes ckout-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes ckout-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes ckout-broadcast-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(240,165,0,0.4); } 50% { box-shadow: 0 0 0 12px rgba(240,165,0,0); } }

    .ckout-fadein { animation: ckout-fadein 0.5s ease-out both; }
    .ckout-fadein-d1 { animation: ckout-fadein 0.5s ease-out 0.1s both; }
    .ckout-fadein-d2 { animation: ckout-fadein 0.5s ease-out 0.2s both; }
    .ckout-fadein-d3 { animation: ckout-fadein 0.5s ease-out 0.3s both; }
    .ckout-fadein-d4 { animation: ckout-fadein 0.5s ease-out 0.4s both; }

    .crypto-select-row:hover {
      border-color: rgba(240, 165, 0, 0.3) !important;
      background: rgba(240, 165, 0, 0.04) !important;
      transform: translateX(4px);
    }
  `
  document.head.appendChild(style)
}

/** Status badge color mapping */
function statusColor(status: string) {
  if (status === 'SETTLED') return { bg: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }
  if (status === 'CONFIRMED' || status === 'CONVERTED_TO_SGD') return { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }
  if (status === 'FAILED' || status === 'EXPIRED') return { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }
  return { bg: 'rgba(240,165,0,0.1)', color: '#f0a500', border: '1px solid rgba(240,165,0,0.2)' }
}

export default function CheckoutPage() {
  const { paymentId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [payment, setPayment] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [simulating, setSimulating] = useState(false)
  const [simPhase, setSimPhase] = useState<'idle' | 'signing' | 'broadcasting' | 'done'>('idle')
  const [statusChanged, setStatusChanged] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)

  useEffect(() => {
    ensureStyles()
  }, [])

  // Poll payment details
  useEffect(() => {
    if (!paymentId) return

    const fetchDetails = async () => {
      try {
        const res = await fetch(`/api/payments/${paymentId}`)
        const data = await res.json()
        if (!res.ok) {
          setErrorMsg(data.error || 'Failed to fetch checkout details')
          return
        }
        setPayment((prev: any) => {
          const newStatus = data.payment.status
          const oldStatus = prev?.status || ''

          if (oldStatus && oldStatus !== newStatus) {
            setStatusChanged(true)
            setTimeout(() => setStatusChanged(false), 1200)

            // Trigger celebration on SETTLED
            if (newStatus === 'SETTLED') {
              setShowCelebration(true)
            }
          }
          return data.payment
        })
        setTransactions(data.transactions)
      } catch {
        setErrorMsg('Network error — is the backend running?')
      } finally {
        setLoading(false)
      }
    }

    fetchDetails()
    const timer = setInterval(fetchDetails, 2000)
    return () => clearInterval(timer)
  }, [paymentId])

  const handleSelectCrypto = async (symbol: string, network: string) => {
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/payments/${paymentId}/select-crypto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cryptoSymbol: symbol, network })
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to select crypto currency')
      }
    } catch {
      setErrorMsg('Network error — could not update crypto choice')
    } finally {
      setLoading(false)
    }
  }

  const handleSimulatePayment = async () => {
    setSimulating(true)
    setErrorMsg('')

    // Phase 1: Signing animation
    setSimPhase('signing')
    await new Promise(r => setTimeout(r, 1200))

    // Phase 2: Broadcasting animation
    setSimPhase('broadcasting')
    await new Promise(r => setTimeout(r, 1000))

    try {
      const res = await fetch(`/api/payments/${paymentId}/simulate-pay`, {
        method: 'POST'
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Simulation failed')
        setSimPhase('idle')
      } else {
        setSimPhase('done')
        // Let the "done" animation play before resetting
        await new Promise(r => setTimeout(r, 800))
      }
    } catch {
      setErrorMsg('Network error — could not trigger payment simulation')
      setSimPhase('idle')
    } finally {
      setSimulating(false)
    }
  }

  if (loading && !payment) {
    return (
      <OnboardingLayout showSteps={false}>
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{
            width: 40, height: 40, margin: '0 auto',
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: '#f0a500',
            borderRadius: '50%',
            animation: 'ckout-spin 0.8s linear infinite',
          }} />
          <p style={{ marginTop: 20, color: 'rgba(255,255,255,0.4)', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
            Fetching ChainForge Payment Session...
          </p>
        </div>
      </OnboardingLayout>
    )
  }

  if (errorMsg && !payment) {
    return (
      <OnboardingLayout showSteps={false}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <h2 style={{ color: '#ef4444' }}>Checkout Session Error</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', margin: '16px 0' }}>{errorMsg}</p>
          <button className="btn-onboarding-primary" onClick={() => navigate('/')}>
            ← Back Home
          </button>
        </div>
      </OnboardingLayout>
    )
  }

  const isCreatedState = payment.status === 'CREATED'
  const currentStepIdx = getStepIndex(payment.status)
  const isTerminal = payment.status === 'SETTLED'
  const sc = statusColor(payment.status)
  const latestTx = transactions[0]
  const requiredConfirmations = latestTx ? Number(latestTx.required_confirmations || 1) : 1
  const isLatestTxConfirmed = latestTx ? Number(latestTx.confirmations) >= requiredConfirmations : false

  return (
    <OnboardingLayout showSteps={false}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: '20px 0', position: 'relative' }}>
        
        {/* ═══ Settlement Celebration Overlay ═══ */}
        {showCelebration && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
            }}
            onClick={() => setShowCelebration(false)}
          >
            {/* Confetti particles */}
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `${5 + Math.random() * 90}%`,
                  width: 8 + Math.random() * 8,
                  height: 8 + Math.random() * 8,
                  background: ['#f0a500', '#22c55e', '#3b82f6', '#f472b6', '#a78bfa', '#facc15'][i % 6],
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                  animation: `ckout-confetti-fall ${1.5 + Math.random() * 2}s ease-in ${Math.random() * 0.5}s both`,
                }}
              />
            ))}

            <div
              style={{
                background: 'rgba(17,17,17,0.95)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 20,
                padding: '48px 40px',
                textAlign: 'center',
                maxWidth: 420,
                animation: 'ckout-celebrate-pop 0.5s ease-out both',
                position: 'relative',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Animated checkmark */}
              <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 24px' }}>
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  border: '2px solid rgba(34,197,94,0.3)',
                  animation: 'ckout-ring-expand 1s ease-out 0.3s both',
                }} />
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ position: 'relative', zIndex: 1 }}>
                  <circle cx="40" cy="40" r="36" stroke="#22c55e" strokeWidth="3" fill="rgba(34,197,94,0.1)" />
                  <path
                    d="M24 40 L35 52 L56 28"
                    stroke="#22c55e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                    fill="none"
                    strokeDasharray="40" strokeDashoffset="40"
                    style={{ animation: 'ckout-check-draw 0.6s ease-out 0.4s both' }}
                  />
                </svg>
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                Payment Settled!
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 1.6 }}>
                The merchant has been credited<br />
                <strong style={{ color: '#22c55e', fontSize: 20 }}>
                  S$ {Number(payment.amount_sgd).toFixed(2)}
                </strong>
              </p>

              <div style={{
                display: 'flex', gap: 8, justifyContent: 'center',
                fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'Space Mono, monospace',
                padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span>Ref: {payment.payment_reference}</span>
                <span style={{ opacity: 0.3 }}>|</span>
                <span>{payment.crypto_symbol_snapshot} → SGD</span>
              </div>

              <button
                onClick={() => setShowCelebration(false)}
                style={{
                  marginTop: 20, padding: '10px 32px',
                  background: '#22c55e', color: '#000', border: 'none',
                  borderRadius: 8, fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif',
                  transition: 'all 0.2s',
                }}
                onMouseOver={e => (e.currentTarget.style.background = '#16a34a')}
                onMouseOut={e => (e.currentTarget.style.background = '#22c55e')}
              >
                View Details
              </button>
            </div>
          </div>
        )}

        {/* ═══ Header Block ═══ */}
        <div className="ckout-fadein" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, background: '#f0a500', color: '#000', fontWeight: 'bold', padding: '2px 6px', borderRadius: 4 }}>
                SECURE CHECKOUT
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'Space Mono, monospace' }}>
                Ref: {payment.payment_reference}
              </span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 8 }}>
              {payment.merchant_name}
            </h1>
            {payment.description && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{payment.description}</p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Amount Due</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f0a500' }}>
              S$ {Number(payment.amount_sgd).toFixed(2)}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="form-error ckout-fadein" style={{ marginBottom: 20, padding: 12, border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239, 68, 68, 0.05)' }}>
            ⚠ {errorMsg}
          </div>
        )}

        {/* ═══ Phase 1: Select Crypto ═══ */}
        {isCreatedState && (
          <div className="ckout-fadein">
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16 }}>
              Select Payment Option
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ASSETS.map((asset, i) => (
                <div
                  key={asset.symbol}
                  onClick={() => handleSelectCrypto(asset.symbol, asset.network)}
                  className={`crypto-select-row ckout-fadein-d${i + 1}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 16,
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1.5px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'rgba(240, 165, 0, 0.08)',
                      border: '1px solid rgba(240, 165, 0, 0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, color: '#f0a500', fontWeight: 'bold'
                    }}>
                      {asset.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{asset.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{asset.desc}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#f0a500', fontWeight: 'bold' }}>
                    Select →
                  </div>
                </div>
              ))}
            </div>
            <div className="ckout-fadein-d4" style={{ marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, background: 'rgba(240,165,0,0.02)', border: '1px dashed rgba(240,165,0,0.1)', padding: 12, borderRadius: 8 }}>
              ⚠️ <strong>Important:</strong> Ensure you send the funds from the correct blockchain network. Sending unsupported crypto or using an incorrect protocol/network will lead to irreversible loss of funds.
            </div>
          </div>
        )}

        {/* ═══ Phase 2: QR and Payment details ═══ */}
        {!isCreatedState && (
          <div className="ckout-fadein" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
              
              {/* Status Header */}
              <div className="ckout-fadein-d1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  Selected Protocol: <strong>{payment.crypto_symbol_snapshot} ({payment.network_snapshot})</strong>
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 'bold', padding: '4px 8px', borderRadius: 6,
                  textTransform: 'uppercase',
                  background: sc.bg, color: sc.color, border: sc.border,
                  transition: 'all 0.4s ease',
                  animation: statusChanged ? 'ckout-pulse 0.4s ease' : 'none',
                }}>
                  {payment.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* QR and Details Layout */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                
                {/* QR Code */}
                <div className="ckout-fadein-d2" style={{ flex: '0 0 auto', margin: '0 auto' }}>
                  <div style={{
                    width: 180, height: 180, background: '#fff', borderRadius: 12,
                    padding: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                    opacity: isTerminal ? 0.4 : 1,
                    transition: 'opacity 0.5s ease',
                  }}>
                    <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none">
                      <rect width="100" height="100" fill="#fff" rx="4" />
                      <path d="M5 5h20v20H5V5zm2 2v16h16V7H7zM5 75h20v20H5V75zm2 2v16h16V79H7zM75 5h20v20H75V5zm2 2v16h16V7H77z" fill="#000" />
                      <rect x="11" y="11" width="8" height="8" fill="#000" />
                      <rect x="11" y="81" width="8" height="8" fill="#000" />
                      <rect x="81" y="11" width="8" height="8" fill="#000" />
                      <path d="M35 10h5v15h-5zm10 5h10v5H45zm5 10h10v5H50zm15-15h10v5H65zm10 10h5v15h-5zm-50 20h10v5H25zm15 5h5v10h-5zm10-5h5v5h-5zm10 5h10v5H60zm15-5h10v5H75zm-35 15h5v10h-5zm10-5h10v5H50zm15 5h5v5h-5zm15-5h5v10h-5z" fill="#000" />
                      <path d="M35 35h10v10H35zm15 5h10v10H50zm15-15h10v10H65zm-20 40h10v10H45zm20 5h10v10H65z" fill="#000" />
                      <rect x="42" y="42" width="16" height="16" fill="#f0a500" rx="3" />
                      <text x="50" y="53" fill="#000" fontSize="10" fontWeight="bold" textAnchor="middle">CF</text>
                    </svg>
                    {isTerminal && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.85)', borderRadius: 12,
                      }}>
                        <span style={{ fontSize: 32 }}>✅</span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'Space Mono, monospace' }}>
                    1 {payment.crypto_symbol_snapshot} = S$ {Number(payment.quoted_rate_sgd_per_crypto).toFixed(2)}
                  </div>
                </div>

                {/* Transfer Info */}
                <div className="ckout-fadein-d3" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Expected Payment Amount
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#f0a500', fontFamily: 'Space Mono, monospace' }}>
                      {Number(payment.expected_crypto_amount).toFixed(6)} {payment.crypto_symbol_snapshot}
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Receiving Address ({payment.network_snapshot})
                    </div>
                    <div style={{
                      padding: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'Space Mono, monospace',
                      color: '#f5f5f0',
                      wordBreak: 'break-all',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>{payment.receiving_address}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(payment.receiving_address)}
                        style={{ background: 'none', border: 'none', color: '#f0a500', cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ═══ Simulation Block ═══ */}
              {payment.status === 'AWAITING_PAYMENT' && (
                <div className="ckout-fadein-d4" style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 'bold', color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🤖</span> Customer Testnet Wallet Simulator
                  </h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 1.5 }}>
                    Since this is a testnet sandbox, you can simulate broadcasting this transaction from your external wallet using the button below.
                  </p>

                  {/* Animated wallet simulation card */}
                  {simPhase !== 'idle' && (
                    <div style={{
                      background: 'rgba(240,165,0,0.03)',
                      border: '1px solid rgba(240,165,0,0.15)',
                      borderRadius: 12,
                      padding: 20,
                      marginBottom: 16,
                      animation: 'ckout-fadein 0.3s ease-out',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: simPhase === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(240,165,0,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.3s ease',
                          animation: simPhase === 'broadcasting' ? 'ckout-broadcast-pulse 1.5s ease infinite' : 'none',
                        }}>
                          {simPhase === 'signing' && (
                            <div style={{ width: 16, height: 16, border: '2px solid rgba(240,165,0,0.3)', borderTopColor: '#f0a500', borderRadius: '50%', animation: 'ckout-spin 0.8s linear infinite' }} />
                          )}
                          {simPhase === 'broadcasting' && <span style={{ fontSize: 16 }}>📡</span>}
                          {simPhase === 'done' && <span style={{ fontSize: 16 }}>✓</span>}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                            {simPhase === 'signing' && 'Signing Transaction...'}
                            {simPhase === 'broadcasting' && 'Broadcasting to Network...'}
                            {simPhase === 'done' && 'Transaction Broadcasted!'}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                            {simPhase === 'signing' && 'Wallet is signing the payload with your private key'}
                            {simPhase === 'broadcasting' && `Submitting to ${payment.network_snapshot} mempool`}
                            {simPhase === 'done' && 'Waiting for network to detect the transaction...'}
                          </div>
                        </div>
                      </div>

                      {/* Mini progress bar */}
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          transition: 'width 0.8s ease-out',
                          background: simPhase === 'done'
                            ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                            : 'linear-gradient(90deg, #f0a500, #ffd060)',
                          width: simPhase === 'signing' ? '35%' : simPhase === 'broadcasting' ? '75%' : '100%',
                        }} />
                      </div>
                    </div>
                  )}

                  <button
                    className="btn-onboarding-primary"
                    onClick={handleSimulatePayment}
                    disabled={simulating}
                    style={{
                      width: '100%', justifyContent: 'center',
                      opacity: simulating ? 0.6 : 1,
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {simulating ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'ckout-spin 0.8s linear infinite', display: 'inline-block' }} />
                        Processing...
                      </span>
                    ) : 'Simulate Payment Broadcast →'}
                  </button>
                </div>
              )}

              {/* ═══ Blockchain Confirmation Pipeline ═══ */}
              {payment.status !== 'AWAITING_PAYMENT' && (
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)', animation: 'ckout-slide-up 0.5s ease-out' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 'bold', color: '#fff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>⛓</span> Blockchain Confirmation Pipeline
                  </h3>

                  {/* Pipeline Steps */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', position: 'relative',
                    padding: '0 4px', marginBottom: 20,
                  }}>
                    {/* Connecting line */}
                    <div style={{
                      position: 'absolute', top: 16, left: 28, right: 28, height: 2,
                      background: 'rgba(255,255,255,0.06)', borderRadius: 1,
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 1,
                        background: 'linear-gradient(90deg, #22c55e, #f0a500)',
                        transition: 'width 0.8s ease-out',
                        width: currentStepIdx >= 0 ? `${(currentStepIdx / (PIPELINE_STEPS.length - 1)) * 100}%` : '0%',
                      }} />
                    </div>

                    {PIPELINE_STEPS.map((step, i) => {
                      const isCompleted = currentStepIdx > i
                      const isCurrent = currentStepIdx === i
                      return (
                        <div key={step.key} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                          position: 'relative', zIndex: 1, flex: '1', minWidth: 0,
                        }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14,
                            transition: 'all 0.5s ease',
                            background: isCompleted
                              ? 'rgba(34,197,94,0.15)'
                              : isCurrent
                                ? 'rgba(240,165,0,0.15)'
                                : 'rgba(255,255,255,0.03)',
                            border: isCompleted
                              ? '2px solid rgba(34,197,94,0.4)'
                              : isCurrent
                                ? '2px solid rgba(240,165,0,0.4)'
                                : '2px solid rgba(255,255,255,0.08)',
                            boxShadow: isCurrent ? '0 0 12px rgba(240,165,0,0.2)' : 'none',
                            animation: isCurrent ? 'ckout-pulse 2s ease-in-out infinite' : 'none',
                          }}>
                            {isCompleted ? (
                              <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 'bold' }}>✓</span>
                            ) : (
                              <span style={{ opacity: isCurrent ? 1 : 0.3 }}>{step.icon}</span>
                            )}
                          </div>
                          <span style={{
                            fontSize: 9, fontFamily: 'Space Mono, monospace',
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                            transition: 'color 0.5s ease',
                            color: isCompleted ? '#22c55e' : isCurrent ? '#f0a500' : 'rgba(255,255,255,0.2)',
                            fontWeight: isCurrent ? 700 : 400,
                          }}>
                            {step.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Detail console */}
                  <div style={{
                    background: '#0a0a0a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: 16,
                    fontFamily: 'Space Mono, monospace', fontSize: 11,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Status:</span>
                      <span style={{
                        color: sc.color, fontWeight: 'bold',
                        transition: 'color 0.4s ease',
                      }}>
                        {payment.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {transactions.length > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Tx Hash:</span>
                          <span style={{ color: '#f5f5f0' }}>
                            {latestTx.tx_hash.slice(0, 8)}...{latestTx.tx_hash.slice(-8)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Confirmations:</span>
                          <span style={{
                            color: isLatestTxConfirmed ? '#22c55e' : '#f0a500',
                            transition: 'color 0.4s ease',
                          }}>
                            {latestTx.confirmations}/{requiredConfirmations} {isLatestTxConfirmed ? '(Confirmed ✓)' : '(Pending...)'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Amount:</span>
                          <span style={{ color: '#f5f5f0' }}>
                            {Number(latestTx.amount_crypto).toFixed(6)} {payment.crypto_symbol_snapshot}
                          </span>
                        </div>
                      </>
                    )}

                    {/* Live status message */}
                    <div style={{
                      marginTop: 14, paddingTop: 12,
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      {!isTerminal && (
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: '#f0a500',
                          animation: 'ckout-pulse 1.5s ease-in-out infinite',
                          flexShrink: 0,
                        }} />
                      )}
                      {isTerminal && (
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                        {payment.status === 'PAYMENT_DETECTED' && 'Transaction detected in mempool. Waiting for block confirmation...'}
                        {payment.status === 'CONFIRMING' && 'Block mined. Accumulating confirmations...'}
                        {payment.status === 'CONFIRMED' && 'Transaction confirmed on-chain. Initiating conversion via MAS-licensed provider...'}
                        {payment.status === 'CONVERTED_TO_SGD' && 'Crypto converted to SGD. Processing merchant settlement...'}
                        {payment.status === 'SETTLED' && 'Settlement complete. Funds credited to merchant account.'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </OnboardingLayout>
  )
}

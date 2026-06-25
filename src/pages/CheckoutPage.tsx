import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import OnboardingLayout from '../components/onboarding/OnboardingLayout'

interface SupportedAsset {
  supported_asset_id: string
  crypto_symbol: string
  network: string
  asset_type: 'NATIVE' | 'ERC20'
  display_name: string
  token_symbol: string | null
  contract_address: string | null
  chain_id: number | null
  decimals: number
  min_confirmations: number
}

interface PaymentInstructions {
  qrCodeImageDataUrl?: string
  qrCodeData?: string
  receivingAddress?: string
  expectedCryptoAmount?: string
  quoteExpiresAt?: string
  tokenSymbol?: string | null
  contractAddress?: string | null
  chainId?: number | null
  warning?: string
}

interface CheckoutPayment {
  payment_id: string
  payment_reference: string
  merchant_order_reference: string | null
  description: string | null
  customer_reference: string | null
  merchant_name: string
  amount_sgd: string | number
  supported_asset_id: string | null
  crypto_symbol_snapshot: string | null
  network_snapshot: string | null
  expected_crypto_amount: string | number | null
  quoted_rate_sgd_per_crypto: string | number | null
  quote_expires_at: string | null
  receiving_address: string | null
  qr_code_data: string | null
  payment_instructions: PaymentInstructions | string | null
  status: string
  expires_at: string
}

interface CheckoutResponse {
  payment: CheckoutPayment
  supportedAssets: SupportedAsset[]
}

function parseInstructions(value: CheckoutPayment['payment_instructions']): PaymentInstructions {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as PaymentInstructions
    } catch {
      return {}
    }
  }
  return value
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString()
}

function statusColor(status: string) {
  if (status === 'AWAITING_PAYMENT') return '#f0a500'
  if (status === 'SETTLED') return '#22c55e'
  if (status === 'EXPIRED' || status === 'FAILED') return '#ef4444'
  return '#f5f5f0'
}

export default function CheckoutPage() {
  const { paymentId } = useParams()
  const navigate = useNavigate()
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectingAssetId, setSelectingAssetId] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const loadCheckout = async () => {
    if (!paymentId) return

    try {
      const res = await fetch(`/api/payments/${paymentId}/checkout`)
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to load checkout')
        return
      }
      setCheckout(data)
      setErrorMsg('')
    } catch {
      setErrorMsg('Network error - is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCheckout()
  }, [paymentId])

  const handleSelectAsset = async (supportedAssetId: string) => {
    if (!paymentId) return
    setSelectingAssetId(supportedAssetId)
    setErrorMsg('')

    try {
      const res = await fetch(`/api/payments/${paymentId}/select-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supportedAssetId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to select payment asset')
        return
      }
      setCheckout({ payment: data.payment, supportedAssets: data.supportedAssets })
    } catch {
      setErrorMsg('Network error - could not select payment asset')
    } finally {
      setSelectingAssetId('')
    }
  }

  if (loading) {
    return (
      <OnboardingLayout showSteps={false}>
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner-wrap">
            <div className="spinner-ring" />
          </div>
          <p style={{ marginTop: 20, color: 'rgba(255,255,255,0.4)', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
            Loading checkout session...
          </p>
        </div>
      </OnboardingLayout>
    )
  }

  if (!checkout) {
    return (
      <OnboardingLayout showSteps={false}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <h2 style={{ color: '#ef4444' }}>Checkout unavailable</h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', margin: '16px 0' }}>{errorMsg}</p>
          <button className="btn-onboarding-primary" onClick={() => navigate('/')}>
            Back
          </button>
        </div>
      </OnboardingLayout>
    )
  }

  const { payment, supportedAssets } = checkout
  const instructions = parseInstructions(payment.payment_instructions)
  const selectedAsset = supportedAssets.find((asset) => asset.supported_asset_id === payment.supported_asset_id)
  const hasPaymentInstructions = Boolean(payment.supported_asset_id && payment.receiving_address)

  return (
    <OnboardingLayout showSteps={false}>
      <div style={{ width: '100%', maxWidth: 860, margin: '0 auto', padding: '20px 0' }}>
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, background: '#f0a500', color: '#000', fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                  TESTNET CHECKOUT
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'Space Mono, monospace' }}>
                  {payment.payment_reference}
                </span>
              </div>
              <h1 style={{ fontSize: 26, color: '#fff', margin: 0 }}>{payment.merchant_name}</h1>
              <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
                {payment.description || 'Crypto payment request'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Amount due</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#f0a500' }}>
                S$ {Number(payment.amount_sgd).toFixed(2)}
              </div>
              <div style={{ color: statusColor(payment.status), fontSize: 12, fontWeight: 700, marginTop: 8 }}>
                {payment.status.replace(/_/g, ' ')}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 20 }}>
            <div className="infra-card">
              <div className="infra-card-label">Order Reference</div>
              <div className="infra-card-value">{payment.merchant_order_reference || 'N/A'}</div>
            </div>
            <div className="infra-card">
              <div className="infra-card-label">Customer Reference</div>
              <div className="infra-card-value">{payment.customer_reference || 'N/A'}</div>
            </div>
            <div className="infra-card">
              <div className="infra-card-label">Payment Expires</div>
              <div className="infra-card-value">{formatDateTime(payment.expires_at)}</div>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="form-error" style={{ marginBottom: 20, padding: 12, border: '1px solid #ef4444', borderRadius: 8 }}>
            {errorMsg}
          </div>
        )}

        {!hasPaymentInstructions && (
          <div className="dashboard-table-wrap" style={{ marginBottom: 24 }}>
            <div className="dashboard-table-header">
              <h3>Select testnet crypto</h3>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Use testnet funds only</span>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {supportedAssets.map((asset) => (
                <button
                  key={asset.supported_asset_id}
                  type="button"
                  onClick={() => handleSelectAsset(asset.supported_asset_id)}
                  disabled={Boolean(selectingAssetId)}
                  className="crypto-select-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 16,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    color: '#f5f5f0',
                    cursor: selectingAssetId ? 'wait' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>
                    <strong>{asset.display_name}</strong>
                    <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                      {asset.crypto_symbol} on {asset.network} - {asset.asset_type}
                    </span>
                  </span>
                  <span style={{ color: '#f0a500', fontSize: 12, fontWeight: 700 }}>
                    {selectingAssetId === asset.supported_asset_id ? 'Quoting...' : 'Select'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {hasPaymentInstructions && (
          <div className="dashboard-table-wrap">
            <div className="dashboard-table-header">
              <h3>Payment Instructions</h3>
              <span style={{ fontSize: 11, color: '#f0a500' }}>{selectedAsset?.display_name}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: 24, alignItems: 'start' }}>
              <div style={{ textAlign: 'center' }}>
                {instructions.qrCodeImageDataUrl ? (
                  <img
                    src={instructions.qrCodeImageDataUrl}
                    alt="Payment QR code"
                    style={{ width: '100%', maxWidth: 240, background: '#fff', borderRadius: 10, padding: 8 }}
                  />
                ) : (
                  <div style={{ width: 220, height: 220, background: '#fff', borderRadius: 10, margin: '0 auto' }} />
                )}
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 10 }}>
                  Scan with a compatible testnet wallet.
                </p>
              </div>

              <div>
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <div className="infra-card-label">Expected Crypto Amount</div>
                    <div style={{ color: '#f0a500', fontFamily: 'Space Mono, monospace', fontSize: 20, fontWeight: 700 }}>
                      {Number(payment.expected_crypto_amount).toFixed(6)} {payment.crypto_symbol_snapshot}
                    </div>
                  </div>
                  <div>
                    <div className="infra-card-label">Receiving Address</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <code style={{ flex: 1, color: '#f5f5f0', wordBreak: 'break-all', fontSize: 12 }}>
                        {payment.receiving_address}
                      </code>
                      <button
                        type="button"
                        className="btn-onboarding-back"
                        style={{ padding: '6px 10px', fontSize: 11 }}
                        onClick={() => navigator.clipboard.writeText(payment.receiving_address || '')}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="infra-card-label">Network</div>
                    <div>{payment.network_snapshot}</div>
                  </div>
                  {instructions.contractAddress && (
                    <div>
                      <div className="infra-card-label">Token Contract</div>
                      <code style={{ color: '#f5f5f0', wordBreak: 'break-all', fontSize: 12 }}>
                        {instructions.contractAddress}
                      </code>
                    </div>
                  )}
                  <div>
                    <div className="infra-card-label">Quote Rate</div>
                    <div>1 {payment.crypto_symbol_snapshot} = S$ {Number(payment.quoted_rate_sgd_per_crypto).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="infra-card-label">Quote Expires</div>
                    <div>{formatDateTime(payment.quote_expires_at)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24, padding: 12, border: '1px dashed rgba(240,165,0,0.25)', borderRadius: 8, color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.6 }}>
              Use the exact selected network. Network fees may apply. This prototype accepts testnet payments only and does not detect real blockchain transactions in Phase 1.
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="infra-card-label">QR Payload</div>
              <textarea
                readOnly
                value={payment.qr_code_data || instructions.qrCodeData || ''}
                className="form-input"
                style={{ minHeight: 96, fontFamily: 'Space Mono, monospace', fontSize: 11 }}
              />
            </div>
          </div>
        )}
      </div>
    </OnboardingLayout>
  )
}

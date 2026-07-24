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
  walletUri?: string
  qrImageDataUrl?: string
  qrCodeImageDataUrl?: string
  qrCodeData?: string
  walletPaymentQrCodeData?: string
  eip681PaymentUri?: string | null
  erc20TransferUri?: string | null
  receivingAddress?: string
  expectedCryptoAmount?: string
  expectedAmount?: string
  quoteExpiresAt?: string
  quoteExpiry?: string
  quoteSource?: string
  quoteProvider?: string
  quoteFetchedAt?: string
  fallbackReason?: string | null
  tokenSymbol?: string | null
  contractAddress?: string | null
  chainId?: number | null
  testnetWarning?: string
  walletCompatibilityNote?: string
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
  received_crypto_amount: string | number | null
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

interface DetectedTransaction {
  txHash?: string
  amountEth?: string
  confirmations?: number
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

function isFinalPaymentStatus(status: string | null | undefined) {
  return ['SETTLED', 'PAID_OUT', 'CONFIRMED', 'CONVERTED_TO_SGD', 'FAILED'].includes(status || '')
}

export default function CheckoutPage() {
  const { paymentId } = useParams()
  const navigate = useNavigate()
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectingAssetId, setSelectingAssetId] = useState('')
  const [txHash, setTxHash] = useState('')
  const [verifyingTx, setVerifyingTx] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState('')
  const [verificationMessage, setVerificationMessage] = useState('')
  const [detectingPayment, setDetectingPayment] = useState(false)
  const [detectionMessage, setDetectionMessage] = useState('')
  const [detectedTransaction, setDetectedTransaction] = useState<DetectedTransaction | null>(null)
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

  const detectPayment = async () => {
    if (!paymentId || detectingPayment) return

    setDetectingPayment(true)
    try {
      const res = await fetch(`/api/payments/${paymentId}/detect`)
      const data = await res.json()

      if (data.checkout) {
        setCheckout(data.checkout)
      }
      if (data.transaction) {
        setDetectedTransaction(data.transaction)
      }
      if (data.status === 'CONFIRMED') {
        setDetectionMessage('Payment confirmed. Simulated SGD settlement completed.')
      } else if (data.status === 'EXPIRED') {
        setDetectionMessage('Payment expired before Sepolia payment was detected.')
      } else if (!res.ok && res.status !== 202) {
        setDetectionMessage(data.error || 'Auto-detection is temporarily unavailable.')
      } else {
        setDetectionMessage('Waiting for Sepolia payment...')
      }
    } catch {
      setDetectionMessage('Auto-detection is temporarily unavailable.')
    } finally {
      setDetectingPayment(false)
    }
  }

  useEffect(() => {
    const status = checkout?.payment.status
    if (!paymentId || !checkout?.payment.supported_asset_id || !checkout.payment.receiving_address) return
    if (checkout.payment.supported_asset_id !== 'asset-eth-sepolia') return
    if (['SETTLED', 'PAID_OUT', 'EXPIRED', 'FAILED'].includes(status || '')) return

    detectPayment()
    const interval = setInterval(() => {
      detectPayment()
    }, 10000)

    return () => clearInterval(interval)
  }, [paymentId, checkout?.payment.payment_id, checkout?.payment.status, checkout?.payment.supported_asset_id])

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

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paymentId) return

    setVerifyingTx(true)
    setVerificationStatus('')
    setVerificationMessage('')
    setErrorMsg('')

    try {
      const res = await fetch(`/api/payments/${paymentId}/submit-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      })
      const data = await res.json()

      setVerificationStatus(data.status || '')

      if (res.ok && data.status === 'CONFIRMED') {
        setVerificationMessage('Transaction confirmed on Sepolia. Simulated SGD settlement has been created.')
        setDetectionMessage('Payment confirmed. Simulated SGD settlement completed.')
        setDetectedTransaction({
          txHash: data.txHash,
          amountEth: data.amountEth,
          confirmations: data.confirmations,
        })
        await loadCheckout()
        return
      }

      if (res.status === 202) {
        setVerificationMessage(data.error || 'Transaction found but still waiting for Sepolia confirmation.')
        await loadCheckout()
        return
      }

      setVerificationMessage(data.error || 'Transaction verification failed')
      if (!res.ok) {
        await loadCheckout()
      }
    } catch {
      setVerificationStatus('NETWORK_ERROR')
      setVerificationMessage('Network error - could not verify transaction hash')
    } finally {
      setVerifyingTx(false)
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
  const qrPayload = instructions.walletUri
    || instructions.eip681PaymentUri
    || instructions.erc20TransferUri
    || instructions.walletPaymentQrCodeData
    || payment.qr_code_data
    || instructions.qrCodeData
    || ''
  const qrImageDataUrl = instructions.qrImageDataUrl || instructions.qrCodeImageDataUrl
  const selectedAsset = supportedAssets.find((asset) => asset.supported_asset_id === payment.supported_asset_id)
  const hasPaymentInstructions = Boolean(payment.supported_asset_id && payment.receiving_address)
  const isEthSepoliaPayment = payment.supported_asset_id === 'asset-eth-sepolia' || (
    String(payment.crypto_symbol_snapshot || '').toUpperCase() === 'ETH'
    && String(payment.network_snapshot || '').toUpperCase().includes('SEPOLIA')
  )
  const canSubmitSepoliaTx = isEthSepoliaPayment && ['AWAITING_PAYMENT', 'CONFIRMING', 'UNDERPAID'].includes(payment.status)
  const visibleAssets = supportedAssets
  const canRefreshQuote = Boolean(payment.supported_asset_id && !isFinalPaymentStatus(payment.status))
  const expectedAmount = String(payment.expected_crypto_amount || instructions.expectedCryptoAmount || instructions.expectedAmount || '')

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
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Quotes are locked from live SGD rates</span>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {visibleAssets.map((asset) => (
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
                {qrImageDataUrl ? (
                  <img
                    src={qrImageDataUrl}
                    alt="Payment QR code"
                    style={{ width: '100%', maxWidth: 240, background: '#fff', borderRadius: 10, padding: 8 }}
                  />
                ) : (
                  <div style={{ width: 220, height: 220, background: '#fff', borderRadius: 10, margin: '0 auto' }} />
                )}
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 10 }}>
                  Scan with a compatible testnet wallet.
                </p>
                {qrPayload && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn-onboarding-back"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      onClick={() => navigator.clipboard.writeText(qrPayload)}
                    >
                      Copy QR URI
                    </button>
                    <button
                      type="button"
                      className="btn-onboarding-primary"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      onClick={() => {
                        window.location.href = qrPayload
                      }}
                    >
                      Open in Wallet
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <div className="infra-card-label">Expected Crypto Amount</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ color: '#f0a500', fontFamily: 'Space Mono, monospace', fontSize: 20, fontWeight: 700 }}>
                        {Number(expectedAmount).toFixed(selectedAsset?.decimals === 6 ? 6 : Math.min(selectedAsset?.decimals || 8, 8))} {payment.crypto_symbol_snapshot}
                      </div>
                      {expectedAmount && (
                        <button
                          type="button"
                          className="btn-onboarding-back"
                          style={{ padding: '6px 10px', fontSize: 11 }}
                          onClick={() => navigator.clipboard.writeText(expectedAmount)}
                        >
                          Copy Amount
                        </button>
                      )}
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
                    <div className="infra-card-label">Quote Source</div>
                    <div>
                      {instructions.quoteSource || 'N/A'}
                      {instructions.quoteProvider ? ` (${instructions.quoteProvider})` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="infra-card-label">Quote Expires</div>
                    <div>{formatDateTime(payment.quote_expires_at)}</div>
                  </div>
                  {canRefreshQuote && (
                    <button
                      type="button"
                      className="btn-onboarding-back"
                      disabled={Boolean(selectingAssetId)}
                      onClick={() => handleSelectAsset(payment.supported_asset_id || '')}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {selectingAssetId ? 'Refreshing Quote...' : payment.status === 'EXPIRED' ? 'Regenerate Quote' : 'Refresh Locked Quote'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24, padding: 12, border: '1px dashed rgba(240,165,0,0.25)', borderRadius: 8, color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.6 }}>
              {instructions.testnetWarning || instructions.warning || 'Use testnet funds only and send on the selected network.'}
              {' '}
              {instructions.walletCompatibilityNote || 'Wallets may still allow amount edits; backend verification enforces the locked amount.'}
              {' '}
              {isEthSepoliaPayment
                ? 'This page scans Sepolia every 10 seconds for a matching payment.'
                : 'Auto-detection is currently implemented only for ETH Sepolia; use the wallet URI and copy fields for this testnet asset.'}
              {' '}
              This MVP may use a shared receiving wallet; production should use unique payment addresses, provider webhooks, or stronger unique amount matching.
            </div>

            {isEthSepoliaPayment ? (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 8,
                  border: detectionMessage.includes('confirmed') || payment.status === 'SETTLED' ? '1px solid #22c55e' : '1px solid rgba(240,165,0,0.35)',
                  color: detectionMessage.includes('confirmed') || payment.status === 'SETTLED' ? '#22c55e' : '#f0a500',
                  background: detectionMessage.includes('confirmed') || payment.status === 'SETTLED' ? 'rgba(34,197,94,0.06)' : 'rgba(240,165,0,0.06)',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <strong>{detectingPayment ? 'Scanning Sepolia...' : detectionMessage || 'Waiting for Sepolia payment...'}</strong>
                {detectedTransaction?.txHash && (
                  <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.72)' }}>
                    <div>Tx: <code style={{ color: '#f5f5f0', wordBreak: 'break-all' }}>{detectedTransaction.txHash}</code></div>
                    {detectedTransaction.amountEth && <div>Received: {Number(detectedTransaction.amountEth).toFixed(6)} ETH</div>}
                    {detectedTransaction.confirmations !== undefined && <div>Confirmations: {detectedTransaction.confirmations}</div>}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.03)', fontSize: 12, lineHeight: 1.5 }}>
                Auto-detection is not enabled for {payment.crypto_symbol_snapshot} in this MVP. Use the wallet URI and copy fields, then verify records manually if needed.
              </div>
            )}

            {canSubmitSepoliaTx && (
              <form onSubmit={handleSubmitTransaction} style={{ marginTop: 18 }}>
                <details>
                  <summary style={{ cursor: 'pointer', color: '#f0a500', fontSize: 12, fontWeight: 700 }}>
                    Payment not detected? Paste transaction hash manually.
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="txHash">
                        Sepolia Transaction Hash
                      </label>
                      <input
                        id="txHash"
                        type="text"
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value.trim())}
                        className="form-input"
                        placeholder="0x..."
                        autoComplete="off"
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn-onboarding-primary"
                      disabled={verifyingTx || !txHash}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {verifyingTx ? 'Verifying on Sepolia...' : 'Verify Hash Manually'}
                    </button>
                  </div>
                </details>
              </form>
            )}

            {verificationMessage && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 8,
                  border: verificationStatus === 'CONFIRMED' ? '1px solid #22c55e' : '1px solid rgba(240,165,0,0.35)',
                  color: verificationStatus === 'CONFIRMED' ? '#22c55e' : '#f0a500',
                  background: verificationStatus === 'CONFIRMED' ? 'rgba(34,197,94,0.06)' : 'rgba(240,165,0,0.06)',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <strong>{verificationStatus || 'VERIFICATION'}:</strong> {verificationMessage}
              </div>
            )}

            {payment.status === 'SETTLED' && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid #22c55e',
                  color: '#22c55e',
                  background: 'rgba(34,197,94,0.06)',
                  fontSize: 12,
                }}
              >
                Payment confirmed and simulated SGD settlement completed.
                {payment.received_crypto_amount ? ` Received ${Number(payment.received_crypto_amount).toFixed(6)} ETH.` : ''}
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <div className="infra-card-label">QR Payload</div>
              <textarea
                readOnly
                value={qrPayload}
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

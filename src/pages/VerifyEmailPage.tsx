import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import OnboardingLayout from '../components/onboarding/OnboardingLayout'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const merchantId = searchParams.get('merchantId')
 
  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading')
  const [statusText, setStatusText] = useState('Authenticating token routing profiles and provisioning dedicated Triple-A ledger containers...')
  const [containerId, setContainerId] = useState('')
  const [walletId, setWalletId] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
 
  useEffect(() => {
    if (!merchantId) {
      setPhase('error')
      setErrorMsg('No merchant ID provided for verification')
      return
    }
 
    const verify = async () => {
      // Show loading for a realistic delay
      await new Promise((r) => setTimeout(r, 2000))
 
      try {
        const res = await fetch(`/api/auth/verify-email?merchantId=${merchantId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
        const data = await res.json()
 
        if (!res.ok) {
          setPhase('error')
          setErrorMsg(data.error || 'Verification failed')
          return
        }
 
        setContainerId(data.containerId || 'N/A')
        setWalletId(data.walletId || 'N/A')
        setStatusText('Infrastructure Configured! Master container and multi-currency payout ledger fully mapped.')
        setPhase('success')
      } catch {
        setPhase('error')
        setErrorMsg('Network error — is the backend running?')
      }
    }
 
    verify()
  }, [merchantId])

  return (
    <OnboardingLayout showSteps={false}>
      <div className="verify-center">
        {/* Loading State */}
        {phase === 'loading' && (
          <>
            <div className="spinner-wrap">
              <div className="spinner-ring" />
            </div>
            <div className="verify-status-text">{statusText}</div>
          </>
        )}

        {/* Success State */}
        {phase === 'success' && (
          <div className="verify-success">
            {/* Checkmark */}
            <div style={{
              width: 64,
              height: 64,
              margin: '0 auto 20px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '2px solid #22c55e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12L10 17L19 7" />
              </svg>
            </div>

            <h2>Infrastructure Configured!</h2>
            <p>Master container and multi-currency payout ledger fully mapped.</p>

            {/* Infrastructure IDs */}
            <div className="infra-ids">
              <div className="infra-id-card">
                <div className="label">Container ID</div>
                <div className="value">{containerId}</div>
              </div>
              <div className="infra-id-card">
                <div className="label">Wallet ID</div>
                <div className="value">{walletId}</div>
              </div>
            </div>

            <button
              className="btn-onboarding-primary"
              onClick={() => navigate('/login')}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Enter Merchant Workspace Login →
            </button>
          </div>
        )}

        {/* Error State */}
        {phase === 'error' && (
          <div className="verify-success">
            <div style={{
              width: 64,
              height: 64,
              margin: '0 auto 20px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '2px solid #ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}>
              ✕
            </div>
            <h2 style={{ color: '#ef4444' }}>Verification Failed</h2>
            <p>{errorMsg}</p>
            <button
              className="btn-onboarding-primary"
              onClick={() => navigate('/register')}
              style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}
            >
              ← Back to Registration
            </button>
          </div>
        )}
      </div>
    </OnboardingLayout>
  )
}

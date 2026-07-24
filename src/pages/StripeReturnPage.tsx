import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoIcon from '../assets/logo-icon.png'

interface StripeStatus {
  stripeConnectedAccountId: string
  detailsSubmitted: boolean
  payoutsEnabled: boolean
  chargesEnabled: boolean
  currentlyDue: string[]
  disabledReason: string | null
  onboardingStatus: string
  payoutSetupComplete: boolean
}

export default function StripeReturnPage({ mode }: { mode: 'return' | 'refresh' }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<StripeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')

  const loadStatus = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/merchant/stripe/status', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        navigate('/login')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Unable to refresh Stripe payout setup status')
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh Stripe payout setup status')
    } finally {
      setLoading(false)
    }
  }

  const continueSetup = async () => {
    setActionLoading(true)
    setError('')
    try {
      const res = await fetch('/api/merchant/stripe/onboarding-link', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        navigate('/login')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Unable to create Stripe onboarding link')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create Stripe onboarding link')
      setActionLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const complete = Boolean(status?.payoutSetupComplete)
  const title = complete ? 'Payout setup complete' : mode === 'refresh' ? 'Continue payout setup' : 'Payout setup incomplete'

  return (
    <div className="dashboard-layout">
      <main className="dashboard-main" style={{ marginLeft: 0, maxWidth: 860, margin: '0 auto' }}>
        <div className="dashboard-topbar">
          <div className="dashboard-topbar-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src={logoIcon} alt="ChainForge" style={{ width: 38, height: 38 }} />
              <div>
                <h1>{title}</h1>
                <p>Stripe Sandbox Connect onboarding status has been refreshed.</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="form-error" style={{ marginBottom: 18, padding: 12, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10 }}>
            {error}
          </div>
        )}

        <div className="dashboard-table-wrap dashboard-fadein">
          <div className="dashboard-table-header">
            <h3>Stripe Payout Setup</h3>
            <span className={`status-badge ${complete ? 'onboarded' : 'unverified'}`}>
              {loading ? 'Checking' : status?.onboardingStatus?.replace(/_/g, ' ') || 'Not started'}
            </span>
          </div>

          <div style={{ padding: 24, display: 'grid', gap: 18 }}>
            {loading ? (
              <p style={{ color: 'rgba(255,255,255,0.55)' }}>Checking Stripe Sandbox account status...</p>
            ) : status ? (
              <>
                <div className="infra-grid" style={{ marginBottom: 0 }}>
                  <div className="infra-card">
                    <div className="infra-card-label">Connected Account</div>
                    <div className="infra-card-value">{status.stripeConnectedAccountId}</div>
                  </div>
                  <div className="infra-card">
                    <div className="infra-card-label">Payouts Enabled</div>
                    <div className="infra-card-value">{status.payoutsEnabled ? 'YES' : 'NO'}</div>
                  </div>
                  <div className="infra-card">
                    <div className="infra-card-label">Details Submitted</div>
                    <div className="infra-card-value">{status.detailsSubmitted ? 'YES' : 'NO'}</div>
                  </div>
                </div>

                {!complete && (
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                    {status.disabledReason && <p>Disabled reason: {status.disabledReason}</p>}
                    {status.currentlyDue?.length > 0 && <p>Currently due: {status.currentlyDue.join(', ')}</p>}
                    {!status.disabledReason && status.currentlyDue?.length === 0 && <p>Stripe still has not enabled payouts for this sandbox account.</p>}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {!complete && (
                    <button className="btn-dashboard-primary" onClick={continueSetup} disabled={actionLoading}>
                      {actionLoading ? 'Opening Stripe...' : 'Continue payout setup'}
                    </button>
                  )}
                  <button className="sidebar-link" style={{ width: 'auto', border: '1px solid rgba(255,255,255,0.08)' }} onClick={() => navigate('/dashboard')}>
                    Back to dashboard
                  </button>
                </div>
              </>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.55)' }}>No Stripe status available.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

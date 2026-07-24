import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import logoIcon from '../assets/logo-icon.png'

interface MerchantProfile {
  merchant_id: string
  business_name: string
  email: string
  uen: string | null
  bank_name: string | null
  bank_holder_name: string | null
  bank_account_last4: string | null
  status: string
  kyc_status: string
  container_id: string | null
  wallet_id: string | null
  stripe_connected_account_id: string | null
  stripe_onboarding_status: string | null
  stripe_details_submitted: number | boolean | null
  stripe_payouts_enabled: number | boolean | null
  stripe_charges_enabled: number | boolean | null
  stripe_requirements_currently_due: string[] | string | null
  stripe_requirements_disabled_reason: string | null
  stripe_status_synced_at: string | null
  onboarded_at: string | null
  created_at: string
}

interface PaymentRecord {
  payment_id: string
  merchant_id: string
  payment_reference: string
  merchant_order_reference: string | null
  description: string | null
  customer_reference: string | null
  amount_sgd: number
  crypto_symbol_snapshot: string | null
  network_snapshot: string | null
  expected_crypto_amount: number | null
  receiving_address: string | null
  status: string
  net_settlement_sgd_amount: number | null
  provider_fee_sgd: number | null
  platform_fee_sgd: number | null
  conversion_cost_sgd: number | null
  network_fee_sgd: number | null
  buffer_reserved_sgd: number | null
  buffer_released_sgd: number | null
  settlement_provider_reference: string | null
  settlement_status: string | null
  payout_reference: string | null
  payout_fee_sgd: number | null
  net_payout_sgd_amount: number | null
  payout_status: string | null
  risk_severity_value: number | null
  risk_level: string | null
  risk_decision: string | null
  created_at: string
  settled_at: string | null
}

interface SettlementRecord {
  settlement_id: string
  payment_id: string
  payment_reference: string
  amount_sgd: number
  gross_sgd_amount: number
  provider_fee_sgd: number
  platform_fee_sgd: number
  net_settlement_sgd_amount: number
  conversion_rate: number | null
  conversion_cost_sgd: number | null
  network_fee_sgd: number | null
  buffer_reserved_sgd: number | null
  buffer_released_sgd: number | null
  provider_reference: string | null
  status: string
  converted_at: string | null
  settled_at: string | null
  paid_out_at: string | null
  crypto_symbol_snapshot: string | null
  network_snapshot: string | null
  expected_crypto_amount: number | null
  received_crypto_amount: number | null
  payment_status: string
  payment_created_at: string
  payout_reference: string | null
  payout_provider_reference: string | null
  payout_status: string | null
}

interface DashboardStats {
  totalGross: number
  totalFees: number
  totalNet: number
  totalCount: number
  settledCount: number
  pendingCount: number
}

interface ToastNotification {
  id: string
  message: string
  amount?: string
  type: 'success' | 'info'
  timestamp: number
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeNav, setActiveNav] = useState('overview')

  // Stats and payments state
  const [stats, setStats] = useState<DashboardStats>({
    totalGross: 0,
    totalFees: 0,
    totalNet: 0,
    totalCount: 0,
    settledCount: 0,
    pendingCount: 0
  })
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [settlements, setSettlements] = useState<SettlementRecord[]>([])
  const [dashboardError, setDashboardError] = useState('')
  const [payoutSetupLoading, setPayoutSetupLoading] = useState(false)
  const [payoutSetupError, setPayoutSetupError] = useState('')

  // Animation state — tracks when values change to trigger visual effects
  const prevStatsRef = useRef<DashboardStats | null>(null)
  const prevPaymentsRef = useRef<PaymentRecord[]>([])
  const [balanceFlash, setBalanceFlash] = useState(false)
  const [settledFlash, setSettledFlash] = useState(false)
  const [pendingFlash, setPendingFlash] = useState(false)
  const [grossFlash, setGrossFlash] = useState(false)
  const [recentlySettledIds, setRecentlySettledIds] = useState<Set<string>>(new Set())
  const [toasts, setToasts] = useState<ToastNotification[]>([])

  // Toast helper
  const addToast = (message: string, amount?: string, type: 'success' | 'info' = 'success') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, amount, type, timestamp: Date.now() }])
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }

  const fetchDashboardData = async () => {
    try {
      const [statsRes, paymentsRes, settlementsRes] = await Promise.all([
        fetch('/api/dashboard/stats', {
          credentials: 'include',
        }),
        fetch('/api/dashboard/payments', {
          credentials: 'include',
        }),
        fetch('/api/dashboard/settlements', {
          credentials: 'include',
        })
      ])

      if (!statsRes.ok || !paymentsRes.ok || !settlementsRes.ok) {
        setDashboardError('Dashboard data could not be loaded. Check that the backend server and database schema are running.')
      } else {
        setDashboardError('')
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json()
        const newStats = statsData.stats as DashboardStats

        // Check for balance/stat changes to trigger animations
        if (prevStatsRef.current) {
          const prev = prevStatsRef.current
          if (newStats.totalNet !== prev.totalNet) {
            setBalanceFlash(true)
            setTimeout(() => setBalanceFlash(false), 1500)
          }
          if (newStats.settledCount !== prev.settledCount) {
            setSettledFlash(true)
            setTimeout(() => setSettledFlash(false), 1500)
          }
          if (newStats.pendingCount !== prev.pendingCount) {
            setPendingFlash(true)
            setTimeout(() => setPendingFlash(false), 1500)
          }
          if (newStats.totalGross !== prev.totalGross) {
            setGrossFlash(true)
            setTimeout(() => setGrossFlash(false), 1500)
          }
        }
        prevStatsRef.current = newStats
        setStats(newStats)
      }

      if (paymentsRes.ok) {
        const paymentsData = await paymentsRes.json()
        const newPayments = paymentsData.payments as PaymentRecord[]

        // Detect newly settled payments for toasts + row highlights
        if (prevPaymentsRef.current.length > 0) {
          const prevMap = new Map(prevPaymentsRef.current.map(p => [p.payment_id, p]))
          const newlySettled: string[] = []

          for (const p of newPayments) {
            const prevPayment = prevMap.get(p.payment_id)
            if (prevPayment && prevPayment.status !== 'SETTLED' && p.status === 'SETTLED') {
              newlySettled.push(p.payment_id)
              addToast(
                `Payment ${p.payment_reference} settled`,
                `S$ ${Number(p.net_settlement_sgd_amount).toFixed(2)}`,
                'success'
              )
            }
          }

          if (newlySettled.length > 0) {
            setRecentlySettledIds(prev => {
              const updated = new Set(prev)
              newlySettled.forEach(id => updated.add(id))
              return updated
            })
            // Clear highlights after 6 seconds
            setTimeout(() => {
              setRecentlySettledIds(prev => {
                const updated = new Set(prev)
                newlySettled.forEach(id => updated.delete(id))
                return updated
              })
            }, 6000)
          }
        }

        prevPaymentsRef.current = newPayments
        setPayments(newPayments)
      }

      if (settlementsRes.ok) {
        const settlementsData = await settlementsRes.json()
        setSettlements(settlementsData.settlements as SettlementRecord[])
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setDashboardError('Dashboard data could not be loaded. Check that the backend server is running.')
    }
  }

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
        })
        if (!res.ok) {
          navigate('/login')
          return
        }
        const data = await res.json()
        setMerchant(data.merchant)
        
        // Fetch stats + list of payments
        await fetchDashboardData()
      } catch {
        navigate('/login')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()

    // Poll dashboard stats & lists every 3 seconds
    const interval = setInterval(() => {
      fetchDashboardData()
    }, 3000)
    return () => clearInterval(interval)
  }, [navigate])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    navigate('/login')
  }

  const getStripeRequirements = () => {
    const value = merchant?.stripe_requirements_currently_due
    if (!value) return []
    if (Array.isArray(value)) return value
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const isPayoutSetupComplete = () => Boolean(
    merchant?.stripe_connected_account_id
      && merchant.stripe_onboarding_status === 'COMPLETE'
      && Boolean(Number(merchant.stripe_details_submitted))
      && Boolean(Number(merchant.stripe_payouts_enabled))
      && !merchant.stripe_requirements_disabled_reason
      && getStripeRequirements().length === 0
  )

  const handlePayoutSetup = async () => {
    setPayoutSetupLoading(true)
    setPayoutSetupError('')
    try {
      const res = await fetch('/api/merchant/stripe/onboarding-link', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to create Stripe payout setup link')
      window.location.href = data.url
    } catch (err) {
      setPayoutSetupError(err instanceof Error ? err.message : 'Unable to create Stripe payout setup link')
      setPayoutSetupLoading(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  const getStatusBadge = (status: string) => {
    if (status === 'ACTIVE_ONBOARDED' || status === 'SETTLED' || status === 'TRANSFERRED' || status === 'PAID_OUT') return 'onboarded'
    if (status === 'CONFIRMED' || status === 'CONVERTED_TO_SGD' || status === 'PROCESSING') return 'confirming'
    if (status === 'PAYMENT_DETECTED' || status === 'CONFIRMING') return 'detecting'
    if (status === 'ACTIVE_UNVERIFIED' || status === 'CREATED' || status === 'AWAITING_PAYMENT' || status === 'AWAITING_CRYPTO_SELECTION' || status === 'KYC_REQUIRED' || status === 'ELIGIBLE' || status === 'SETTLEMENT_PENDING') return 'unverified'
    if (status === 'MANUAL_REVIEW_REQUIRED') return 'detecting'
    if (status === 'HELD') return 'unverified'
    if (status === 'FAILED' || status === 'EXPIRED') return 'suspended'
    return 'suspended'
  }

  const getStatusLabel = (status: string) => {
    if (status === 'ACTIVE_ONBOARDED') return 'Active — Onboarded'
    if (status === 'ACTIVE_UNVERIFIED') return 'Unverified'
    return status
  }

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return new Date(dateStr).toLocaleDateString()
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#050505',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div className="spinner-wrap">
          <div className="spinner-ring" />
        </div>
      </div>
    )
  }

  const isOnboarded = merchant?.status === 'ACTIVE_ONBOARDED'
  const successRate = stats.totalCount > 0 ? Math.round((stats.settledCount / stats.totalCount) * 100) : 0

  return (
    <div className="dashboard-layout">
      {/* Toast Notifications */}
      <div style={{
        position: 'fixed', top: 20, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'none',
      }}>
        {toasts.map((toast, i) => (
          <div
            key={toast.id}
            style={{
              background: toast.type === 'success' ? 'rgba(17,17,17,0.97)' : 'rgba(17,17,17,0.97)',
              border: toast.type === 'success' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(240,165,0,0.3)',
              borderRadius: 12,
              padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              animation: 'dash-toast-in 0.4s ease-out both',
              animationDelay: `${i * 0.05}s`,
              pointerEvents: 'auto',
              minWidth: 280,
              backdropFilter: 'blur(12px)',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: toast.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(240,165,0,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 16 }}>{toast.type === 'success' ? '✅' : 'ℹ️'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f5f5f0', marginBottom: 2 }}>
                {toast.message}
              </div>
              {toast.amount && (
                <div style={{
                  fontSize: 14, fontWeight: 700,
                  color: '#22c55e',
                  fontFamily: 'Space Mono, monospace',
                }}>
                  +{toast.amount}
                </div>
              )}
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              style={{
                background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                fontSize: 14, padding: 4,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay visible"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <img src={logoIcon} alt="ChainForge" />
          <div className="sidebar-brand">
            <span className="sidebar-brand-name">ChainForge</span>
            <span className={`sidebar-brand-status ${isOnboarded ? 'active' : 'unverified'}`}>
              {isOnboarded ? '● System Online' : '○ Unverified'}
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Main</div>

          {[
            { key: 'overview', label: 'Overview', icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            )},
            { key: 'payments', label: 'Payments', icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            )},
            { key: 'settlements', label: 'Settlements', icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 010-4h14v4" />
                <path d="M3 5v14a2 2 0 002 2h16v-5" />
                <path d="M18 12a2 2 0 000 4h4v-4h-4z" />
              </svg>
            )},
          ].map((item) => (
            <button
              key={item.key}
              className={`sidebar-link ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => setActiveNav(item.key)}
              style={{ width: '100%', textAlign: 'left' }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <div className="sidebar-section-label" style={{ marginTop: 16 }}>System</div>
          {[
            { key: 'settings', label: 'Settings', icon: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            )},
          ].map((item) => (
            <button
              key={item.key}
              className={`sidebar-link ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => setActiveNav(item.key)}
              style={{ width: '100%', textAlign: 'left' }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Merchant info footer */}
        {merchant && (
          <div className="sidebar-footer">
            <div className="sidebar-merchant-info">
              <div className="sidebar-merchant-avatar">
                {getInitials(merchant.business_name)}
              </div>
              <div className="sidebar-merchant-details">
                <div className="sidebar-merchant-name">{merchant.business_name}</div>
                <div className="sidebar-merchant-email">{merchant.email}</div>
              </div>
            </div>
            <button
              className="sidebar-link"
              onClick={handleLogout}
              style={{ width: '100%', textAlign: 'left', marginTop: 4, color: '#ef4444' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Top bar */}
        <div className="dashboard-topbar">
          <div className="dashboard-topbar-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="mobile-menu-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <div>
                <h1>Welcome back, {merchant?.business_name?.split(' ')[0]} 👋</h1>
                <p>
                  <span className={`status-badge ${getStatusBadge(merchant?.status || '')}`}>
                    {getStatusLabel(merchant?.status || '')}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div className="dashboard-topbar-right" />
        </div>

        {dashboardError && (
          <div className="form-error" style={{ marginBottom: 18, padding: 12, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10 }}>
            {dashboardError}
          </div>
        )}

        {/* Stats Grid */}
        {activeNav === 'overview' && (
          <>
        <div className="stats-grid dashboard-fadein">
          {/* Settled Balance (Net) */}
          <div className={`stat-card ${balanceFlash ? 'stat-card-flash-green' : ''}`}>
            <div className="stat-card-header">
              <div className="stat-card-icon green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
              </div>
              {balanceFlash && <span className="stat-card-trend up">↑ Updated</span>}
              {!balanceFlash && <span className="stat-card-trend neutral">—</span>}
            </div>
            <div className="stat-card-value" style={{ transition: 'color 0.3s ease', color: balanceFlash ? '#22c55e' : '#f5f5f0' }}>
              S$ {stats.totalNet.toFixed(2)}
            </div>
            <div className="stat-card-label">Settled Balance (Net)</div>
          </div>

          {/* Total Gross Revenue */}
          <div className={`stat-card ${grossFlash ? 'stat-card-flash-amber' : ''}`}>
            <div className="stat-card-header">
              <div className="stat-card-icon amber">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 17l6-6 4 4 8-10" /><path d="M15 5h5v5" /></svg>
              </div>
              {grossFlash && <span className="stat-card-trend up">↑ Updated</span>}
              {!grossFlash && <span className="stat-card-trend neutral">—</span>}
            </div>
            <div className="stat-card-value" style={{ transition: 'color 0.3s ease', color: grossFlash ? '#f0a500' : '#f5f5f0' }}>
              S$ {stats.totalGross.toFixed(2)}
            </div>
            <div className="stat-card-label">Total Gross Revenue</div>
          </div>

          {/* Pending Payments */}
          <div className={`stat-card ${pendingFlash ? 'stat-card-flash-amber' : ''}`}>
            <div className="stat-card-header">
              <div className="stat-card-icon amber">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </div>
              {pendingFlash && <span className="stat-card-trend up">↑ Changed</span>}
              {!pendingFlash && <span className="stat-card-trend neutral">—</span>}
            </div>
            <div className="stat-card-value">{stats.pendingCount}</div>
            <div className="stat-card-label">Pending Payments</div>
          </div>

          {/* Settled Payouts */}
          <div className={`stat-card ${settledFlash ? 'stat-card-flash-green' : ''}`}>
            <div className="stat-card-header">
              <div className="stat-card-icon blue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              {settledFlash && <span className="stat-card-trend up">+1 New</span>}
              {!settledFlash && <span className="stat-card-trend neutral">—</span>}
            </div>
            <div className="stat-card-value" style={{ transition: 'color 0.3s ease', color: settledFlash ? '#22c55e' : '#f5f5f0' }}>
              {stats.settledCount}
            </div>
            <div className="stat-card-label">Settled Payouts</div>
          </div>

          {/* Fees Collected */}
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-card-icon purple">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
              </div>
              <span className="stat-card-trend neutral">—</span>
            </div>
            <div className="stat-card-value">S$ {stats.totalFees.toFixed(2)}</div>
            <div className="stat-card-label">Total Fees Deducted</div>
          </div>

          {/* Conversion Rate */}
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-card-icon green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M8 12l3 3 5-5" /></svg>
              </div>
              <span className="stat-card-trend neutral">—</span>
            </div>
            <div className="stat-card-value">{successRate}%</div>
            <div className="stat-card-label">Conversion Rate</div>
          </div>
        </div>

        {/* Infrastructure Cards */}
        {isOnboarded && (
          <div className="infra-grid dashboard-fadein">
            <div className="infra-card">
              <div className="infra-card-label">Gateway Account ID</div>
              <div className="infra-card-value">{merchant?.container_id || '—'}</div>
            </div>
            <div className="infra-card">
              <div className="infra-card-label">Settlement Wallet ID</div>
              <div className="infra-card-value">{merchant?.wallet_id || '—'}</div>
            </div>
            <div className={`infra-card ${isPayoutSetupComplete() ? 'payout-ready-card' : 'payout-action-card'}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div className="infra-card-label">Stripe Payout Setup</div>
                  <div className="infra-card-value">
                    {merchant?.stripe_onboarding_status?.replace(/_/g, ' ') || 'NOT STARTED'}
                  </div>
                </div>
                <span className={`status-badge ${isPayoutSetupComplete() ? 'onboarded' : 'unverified'}`} style={{ fontSize: 10 }}>
                  {isPayoutSetupComplete() ? 'Ready' : 'Incomplete'}
                </span>
              </div>
              <div style={{ marginTop: 14, display: 'grid', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                <div>Connected account: <span style={{ color: 'rgba(255,255,255,0.72)' }}>{merchant?.stripe_connected_account_id || 'Pending'}</span></div>
                <div>Payouts enabled: <span style={{ color: merchant?.stripe_payouts_enabled ? '#22c55e' : '#f59e0b' }}>{merchant?.stripe_payouts_enabled ? 'Yes' : 'No'}</span></div>
                {merchant?.stripe_requirements_disabled_reason && (
                  <div>Disabled reason: {merchant.stripe_requirements_disabled_reason}</div>
                )}
                {getStripeRequirements().length > 0 && (
                  <div>Currently due: {getStripeRequirements().slice(0, 3).join(', ')}{getStripeRequirements().length > 3 ? '...' : ''}</div>
                )}
              </div>
              {!isPayoutSetupComplete() && (
                <button
                  className="btn-dashboard-primary"
                  onClick={handlePayoutSetup}
                  disabled={payoutSetupLoading}
                  style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
                >
                  {payoutSetupLoading ? 'Opening Stripe...' : 'Complete payout setup'}
                </button>
              )}
              {payoutSetupError && (
                <div style={{ marginTop: 10, color: '#ef4444', fontSize: 12 }}>{payoutSetupError}</div>
              )}
            </div>
          </div>
        )}
          </>
        )}

        {/* Transaction History Table */}
        {(activeNav === 'overview' || activeNav === 'payments') && (
        <div className="dashboard-table-wrap dashboard-fadein">
          <div className="dashboard-table-header">
            <h3>{activeNav === 'payments' ? 'Payments' : 'Recent Payment Activity'}</h3>
            <span style={{
              fontSize: 11, color: 'rgba(255,255,255,0.3)',
              fontFamily: 'Space Mono, monospace',
            }}>
              {payments.length} record{payments.length !== 1 ? 's' : ''} • Auto-refreshing
            </span>
          </div>

          {!isOnboarded ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔒</div>
              <h4>Account Not Verified</h4>
              <p>Please complete email verification to unlock payment features.</p>
            </div>
          ) : payments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <h4>No Transactions Yet</h4>
              <p>Payment records will appear here after customer payments are created by the payment module.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Description</th>
                    <th>Crypto / Network</th>
                    <th>Gross (SGD)</th>
                    <th>Payout Net (SGD)</th>
                    <th>Fees (SGD)</th>
                    <th>Settlement</th>
                    <th>Risk</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const isRecentlySettled = recentlySettledIds.has(p.payment_id)
                    return (
                      <tr
                        key={p.payment_id}
                        style={{
                          transition: 'all 0.5s ease',
                          background: isRecentlySettled ? 'rgba(34,197,94,0.04)' : undefined,
                          borderLeft: isRecentlySettled ? '3px solid #22c55e' : '3px solid transparent',
                        }}
                      >
                        <td style={{ fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
                          {p.payment_reference}
                        </td>
                        <td style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {p.merchant_order_reference || p.description || 'N/A'}
                        </td>
                        <td>
                          {p.crypto_symbol_snapshot ? (
                            <span style={{ fontSize: 12, fontWeight: 500 }}>
                              {p.crypto_symbol_snapshot} ({p.network_snapshot})
                            </span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.2)' }}>Not Selected</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          S$ {Number(p.amount_sgd).toFixed(2)}
                        </td>
                        <td style={{
                          fontWeight: 600,
                          color: p.net_settlement_sgd_amount !== null ? '#22c55e' : 'rgba(255,255,255,0.2)',
                          transition: 'color 0.4s ease',
                        }}>
                          {p.net_settlement_sgd_amount !== null ? `S$ ${Number(p.net_settlement_sgd_amount).toFixed(2)}` : '—'}
                        </td>
                        <td style={{
                          fontWeight: 500,
                          color: 'rgba(255,255,255,0.4)',
                          fontSize: 12,
                        }}>
                          {(p.provider_fee_sgd !== null && p.platform_fee_sgd !== null)
                            ? `S$ ${(Number(p.platform_fee_sgd) + Number(p.conversion_cost_sgd ?? p.provider_fee_sgd) + Number(p.network_fee_sgd || 0) + Number(p.payout_fee_sgd || 0)).toFixed(2)}`
                            : '—'}
                        </td>
                        <td>
                          {p.settlement_status ? (
                            <div style={{ display: 'grid', gap: 4 }}>
                              <span className={`status-badge ${p.payout_status === 'PAID_OUT' ? 'onboarded' : getStatusBadge(p.settlement_status)}`} style={{ fontSize: 10 }}>
                                {(p.payout_status || p.settlement_status).replace(/_/g, ' ')}
                              </span>
                              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: "'Space Mono', monospace" }}>
                                {p.payout_reference || p.settlement_provider_reference || '—'}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {p.risk_level ? (
                            <span
                              className={`status-badge ${p.risk_decision === 'ALLOW' ? 'onboarded' : p.risk_decision === 'KYC_REQUIRED' ? 'unverified' : 'suspended'}`}
                              style={{ fontSize: 10 }}
                              title={p.risk_decision || ''}
                            >
                              {p.risk_level}
                            </span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.2)' }}>Not assessed</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-badge ${getStatusBadge(p.status)}`} style={{ fontSize: 10 }}>
                            {p.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {formatTimeAgo(p.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {activeNav === 'settlements' && (
          <div className="dashboard-table-wrap dashboard-fadein">
            <div className="dashboard-table-header">
              <h3>Settlements</h3>
              <span style={{
                fontSize: 11, color: 'rgba(255,255,255,0.3)',
                fontFamily: 'Space Mono, monospace',
              }}>
                {settlements.length} record{settlements.length !== 1 ? 's' : ''} • Merchant scoped
              </span>
            </div>

            {!isOnboarded ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔒</div>
                <h4>Account Not Verified</h4>
                <p>Please complete email verification to unlock settlement records.</p>
              </div>
            ) : settlements.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📄</div>
                <h4>No Settlements Yet</h4>
                <p>Settlements will appear here after a payment is confirmed and converted to SGD.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Settlement ID</th>
                      <th>Payment</th>
                      <th>Gross (SGD)</th>
                      <th>Platform Fee</th>
                      <th>Conversion Cost</th>
                      <th>Network Fee</th>
                      <th>Buffer Released</th>
                      <th>Net Settlement</th>
                      <th>Status</th>
                      <th>Payout</th>
                      <th>Converted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((s) => (
                      <tr key={s.settlement_id}>
                        <td style={{ fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
                          {s.settlement_id}
                        </td>
                        <td>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12 }}>{s.payment_reference}</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                              {s.crypto_symbol_snapshot || 'N/A'} {s.network_snapshot ? `(${s.network_snapshot})` : ''}
                            </span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>S$ {Number(s.gross_sgd_amount).toFixed(2)}</td>
                        <td>S$ {Number(s.platform_fee_sgd || 0).toFixed(2)}</td>
                        <td>S$ {Number((s.conversion_cost_sgd ?? s.provider_fee_sgd) || 0).toFixed(2)}</td>
                        <td>S$ {Number(s.network_fee_sgd || 0).toFixed(2)}</td>
                        <td style={{ color: '#22c55e' }}>S$ {Number(s.buffer_released_sgd || 0).toFixed(2)}</td>
                        <td style={{ color: '#22c55e', fontWeight: 700 }}>
                          S$ {Number(s.net_settlement_sgd_amount).toFixed(2)}
                        </td>
                        <td>
                          <span className={`status-badge ${getStatusBadge(s.status)}`} style={{ fontSize: 10 }}>
                            {s.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <span className={`status-badge ${s.payout_status === 'PAID_OUT' ? 'onboarded' : s.payout_status ? 'confirming' : 'unverified'}`} style={{ fontSize: 10 }}>
                              {(s.payout_status || 'NOT BATCHED').replace(/_/g, ' ')}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: "'Space Mono', monospace" }}>
                              {s.payout_reference || s.payout_provider_reference || '—'}
                            </span>
                          </div>
                        </td>
                        <td style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {s.converted_at ? formatTimeAgo(s.converted_at) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Account Info */}
        {merchant && activeNav === 'settings' && (
          <div className="dashboard-table-wrap dashboard-fadein" style={{ marginTop: 24 }}>
            <div className="dashboard-table-header">
              <h3>Account Information</h3>
            </div>
            <table className="dashboard-table">
              <tbody>
                <tr>
                  <td style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600, width: '40%' }}>Merchant ID</td>
                  <td style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: '#f0a500' }}>{merchant.merchant_id}</td>
                </tr>
                <tr>
                  <td style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Business Name</td>
                  <td>{merchant.business_name}</td>
                </tr>
                <tr>
                  <td style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>UEN</td>
                  <td>{merchant.uen || '—'}</td>
                </tr>
                <tr>
                  <td style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Email</td>
                  <td>{merchant.email}</td>
                </tr>
                <tr>
                  <td style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Bank</td>
                  <td>{merchant.bank_name || '—'} {merchant.bank_account_last4 ? `(****${merchant.bank_account_last4})` : ''}</td>
                </tr>
                <tr>
                  <td style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Verification Status</td>
                  <td>{merchant.kyc_status}</td>
                </tr>
                <tr>
                  <td style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Onboarded At</td>
                  <td>{merchant.onboarded_at ? new Date(merchant.onboarded_at).toLocaleString() : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </main>

    </div>
  )
}

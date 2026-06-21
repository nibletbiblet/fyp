import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
  onboarded_at: string | null
  created_at: string
}

interface PaymentRecord {
  payment_id: string
  merchant_id: number
  payment_reference: string
  description: string | null
  amount_sgd: number
  crypto_symbol_snapshot: string | null
  network_snapshot: string | null
  expected_crypto_amount: number | null
  receiving_address: string | null
  status: string
  net_settlement_sgd_amount: number | null
  provider_fee_sgd: number | null
  platform_fee_sgd: number | null
  created_at: string
  settled_at: string | null
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

  // Animation state — tracks when values change to trigger visual effects
  const prevStatsRef = useRef<DashboardStats | null>(null)
  const prevPaymentsRef = useRef<PaymentRecord[]>([])
  const [balanceFlash, setBalanceFlash] = useState(false)
  const [settledFlash, setSettledFlash] = useState(false)
  const [pendingFlash, setPendingFlash] = useState(false)
  const [grossFlash, setGrossFlash] = useState(false)
  const [recentlySettledIds, setRecentlySettledIds] = useState<Set<string>>(new Set())
  const [toasts, setToasts] = useState<ToastNotification[]>([])

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [amountSgd, setAmountSgd] = useState('')
  const [description, setDescription] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')
  const [createdLink, setCreatedLink] = useState('')

  // Toast helper
  const addToast = (message: string, amount?: string, type: 'success' | 'info' = 'success') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, amount, type, timestamp: Date.now() }])
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }

  const fetchDashboardData = async (token: string) => {
    try {
      const [statsRes, paymentsRes] = await Promise.all([
        fetch('/api/dashboard/stats', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/dashboard/payments', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])

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
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login')
      return
    }

    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          localStorage.removeItem('token')
          localStorage.removeItem('merchant')
          navigate('/login')
          return
        }
        const data = await res.json()
        setMerchant(data.merchant)
        
        // Fetch stats + list of payments
        await fetchDashboardData(token)
      } catch {
        // If backend is down, use cached data
        const cached = localStorage.getItem('merchant')
        if (cached) {
          setMerchant(JSON.parse(cached) as MerchantProfile)
        } else {
          navigate('/login')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()

    // Poll dashboard stats & lists every 3 seconds
    const interval = setInterval(() => {
      if (token) fetchDashboardData(token)
    }, 3000)
    return () => clearInterval(interval)
  }, [navigate])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    localStorage.removeItem('token')
    localStorage.removeItem('merchant')
    navigate('/login')
  }

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalLoading(true)
    setModalError('')
    setCreatedLink('')

    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amountSgd: Number(amountSgd),
          description
        })
      })
      const data = await res.json()

      if (!res.ok) {
        setModalError(data.error || 'Failed to generate payment link')
      } else {
        setCreatedLink(window.location.origin + data.checkoutUrl)
        setAmountSgd('')
        setDescription('')
        // Refresh payments list immediately
        fetchDashboardData(token)
      }
    } catch {
      setModalError('Network error — please check if backend is running')
    } finally {
      setModalLoading(false)
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
    if (status === 'ACTIVE_ONBOARDED' || status === 'SETTLED') return 'onboarded'
    if (status === 'CONFIRMED' || status === 'CONVERTED_TO_SGD') return 'confirming'
    if (status === 'PAYMENT_DETECTED' || status === 'CONFIRMING') return 'detecting'
    if (status === 'ACTIVE_UNVERIFIED' || status === 'CREATED' || status === 'AWAITING_PAYMENT') return 'unverified'
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
          <div className="dashboard-topbar-right">
            {isOnboarded && (
              <button className="btn-dashboard-primary" onClick={() => setModalOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M7 7h.01M7 12h.01M7 17h.01M12 7h.01M12 12h.01M12 17h.01M17 7h.01M17 12h.01M17 17h.01" />
                </svg>
                Generate Payment Link / QR
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
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
              <div className="infra-card-label">Container ID (Triple-A)</div>
              <div className="infra-card-value">{merchant?.container_id || '—'}</div>
            </div>
            <div className="infra-card">
              <div className="infra-card-label">Wallet ID (Multi-Currency)</div>
              <div className="infra-card-value">{merchant?.wallet_id || '—'}</div>
            </div>
          </div>
        )}

        {/* Transaction History Table */}
        <div className="dashboard-table-wrap dashboard-fadein">
          <div className="dashboard-table-header">
            <h3>Transaction History</h3>
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
              <p>Create your first payment link to start receiving crypto payments.</p>
              <button className="btn-dashboard-primary" onClick={() => setModalOpen(true)}>
                Generate Payment Link / QR →
              </button>
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
                    <th>Status</th>
                    <th>Time</th>
                    <th>Action</th>
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
                          {p.description || 'N/A'}
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
                            ? `S$ ${(Number(p.provider_fee_sgd) + Number(p.platform_fee_sgd)).toFixed(2)}`
                            : '—'}
                        </td>
                        <td>
                          <span className={`status-badge ${getStatusBadge(p.status)}`} style={{ fontSize: 10 }}>
                            {p.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {formatTimeAgo(p.created_at)}
                        </td>
                        <td>
                          <Link
                            to={`/checkout/${p.payment_id}`}
                            className="btn-onboarding-back"
                            style={{ padding: '6px 12px', fontSize: 11, textDecoration: 'none', borderStyle: 'dashed' }}
                          >
                            Checkout Link ↗
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Account Info */}
        {merchant && (
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
                  <td style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>KYC Status</td>
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

      {/* Modal - Create Payment Link */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            background: '#0c0c0c',
            border: '1px solid rgba(240,165,0,0.15)',
            borderRadius: 16,
            padding: 28,
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            position: 'relative'
          }}>
            <button
              onClick={() => {
                setModalOpen(false)
                setCreatedLink('')
                setModalError('')
              }}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 20,
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 6 }}>
              Generate Payment Link
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
              Instantly create a shareable, testnet checkout link for your customers.
            </p>

            {modalError && (
              <div className="form-error" style={{ marginBottom: 16, padding: 10, background: 'rgba(239,68,68,0.05)', border: '1px solid #ef4444', borderRadius: 8 }}>
                ⚠ {modalError}
              </div>
            )}

            {!createdLink ? (
              <form onSubmit={handleCreatePayment}>
                <div className="form-group">
                  <label className="form-label">Payment Amount (SGD) <span style={{ color: '#f0a500' }}>*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 100.00"
                    value={amountSgd}
                    onChange={(e) => setAmountSgd(e.target.value)}
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Order Reference / Description</label>
                  <input
                    type="text"
                    placeholder="e.g. Invoice #2035"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="form-input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="btn-onboarding-primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                >
                  {modalLoading ? 'Generating...' : 'Create Payment Link →'}
                </button>
              </form>
            ) : (
              <div>
                <div style={{
                  padding: 16,
                  background: 'rgba(34,197,94,0.05)',
                  border: '1px solid #22c55e',
                  borderRadius: 10,
                  color: '#22c55e',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center',
                  marginBottom: 20
                }}>
                  ✓ Payment Link Generated Successfully!
                </div>

                <div className="form-group">
                  <label className="form-label">Shareable Checkout URL</label>
                  <div style={{
                    display: 'flex',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: 8
                  }}>
                    <input
                      type="text"
                      readOnly
                      value={createdLink}
                      style={{
                        flex: 1,
                        background: 'none',
                        border: 'none',
                        color: '#f0a500',
                        fontSize: 12,
                        fontFamily: 'Space Mono, monospace',
                        outline: 'none',
                        padding: '0 8px'
                      }}
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(createdLink)}
                      className="btn-onboarding-primary"
                      style={{ padding: '6px 12px', fontSize: 11 }}
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <a
                    href={createdLink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-onboarding-primary"
                    style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', textAlign: 'center' }}
                  >
                    Open Checkout ↗
                  </a>
                  <button
                    onClick={() => {
                      setCreatedLink('')
                      setAmountSgd('')
                      setDescription('')
                    }}
                    className="btn-onboarding-back"
                    style={{ flex: 1 }}
                  >
                    Create Another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

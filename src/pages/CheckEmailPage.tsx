import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import OnboardingLayout from '../components/onboarding/OnboardingLayout'

export default function CheckEmailPage() {
  const [countdown, setCountdown] = useState(60)
  const [canResend, setCanResend] = useState(false)
  const [resending, setResending] = useState(false)

  // Retrieve registration data
  const registrationRaw = sessionStorage.getItem('registration')
  const registration = registrationRaw ? JSON.parse(registrationRaw) : null

  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true)
      return
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const handleResend = async () => {
    if (!registration?.email) return
    setResending(true)
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: registration.email }),
      })
      const data = await res.json()
      if (res.ok && data.verificationToken) {
        sessionStorage.setItem('registration', JSON.stringify({
          ...registration,
          verificationToken: data.verificationToken,
          verificationUrl: data.verificationUrl,
        }))
      }
      setCountdown(60)
      setCanResend(false)
    } catch {
      // silently fail
    } finally {
      setResending(false)
    }
  }

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = s % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <OnboardingLayout showSteps={false}>
      <div className="check-email-center">
        {/* Animated mail icon */}
        <div className="mail-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 4L12 13L2 4" />
          </svg>
        </div>

        <h1>Check Your Corporate Inbox 🚀</h1>
        <p>
          We have dispatched a secure configuration layout routing link to your
          registered email address. Please follow the instructions inside to
          provision your asset ledger layers.
        </p>

        {registration?.email && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: "'Space Mono', monospace" }}>
            Sent to: {registration.email}
          </p>
        )}

        {/* Resend controls */}
        <div className="resend-row">
          {!canResend ? (
            <span className="countdown-text">
              Resend available in {formatTime(countdown)}
            </span>
          ) : (
            <button
              className="btn-resend"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? 'Resending...' : '↻ Resend Email Link'}
            </button>
          )}
        </div>

        {/* Demo verification link (since no real email) */}
        {registration?.verificationUrl && (
          <Link to={registration.verificationUrl} className="demo-link">
            🔗 Demo: Click to simulate email verification →
          </Link>
        )}
      </div>
    </OnboardingLayout>
  )
}

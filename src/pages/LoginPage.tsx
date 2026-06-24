import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import OnboardingLayout from '../components/onboarding/OnboardingLayout'
import FormInput from '../components/onboarding/FormInput'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      navigate('/dashboard')
    } catch {
      setError('Network error — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingLayout showSteps={false}>
      <div className="onboarding-card">
        <div className="onboarding-card-header">
          <div className="onboarding-card-icon">🔐</div>
          <h1>Secure Gateway Entry</h1>
          <p>Enter your corporate credentials to access the merchant workspace.</p>
        </div>

        <form onSubmit={handleLogin}>
          <FormInput
            label="Corporate Email"
            name="loginEmail"
            type="email"
            placeholder="admin@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            validate={(v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
            error="Please enter a valid email"
            required
          />

          <FormInput
            label="Admin Password"
            name="loginPassword"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            validate={(v) => v.length >= 1}
            required
          />

          {error && (
            <div className="form-error" style={{ marginBottom: 16, fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            className={`btn-onboarding-primary ${loading ? 'btn-loading' : ''}`}
            disabled={!email || !password || loading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loading ? 'Authenticating...' : 'Sign In →'}
          </button>
        </form>

        <div className="login-link">
          Don't have an account?{' '}
          <Link to="/register">Create one here</Link>
        </div>
      </div>
    </OnboardingLayout>
  )
}

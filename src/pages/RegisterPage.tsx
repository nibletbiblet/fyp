import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingLayout from '../components/onboarding/OnboardingLayout'
import FormInput from '../components/onboarding/FormInput'

const STEPS = [
  { label: 'Corporate Identity', sublabel: 'Business details' },
  { label: 'Admin Access', sublabel: 'Email & password' },
  { label: 'Bank Details', sublabel: 'FAST settlement routing' },
]

const SG_BANKS = [
  'DBS Bank',
  'OCBC Bank',
  'United Overseas Bank (UOB)',
  'Standard Chartered Bank',
  'HSBC Singapore',
  'Citibank Singapore',
  'Maybank Singapore',
  'Bank of China Singapore',
  'RHB Bank',
  'CIMB Bank',
]

export default function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  // Step 1: Corporate Identity
  const [businessName, setBusinessName] = useState('')
  const [uen, setUen] = useState('')

  // Step 2: Admin Access
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Step 3: Bank Details
  const [bankName, setBankName] = useState('')
  const [bankHolderName, setBankHolderName] = useState('')
  const [bankAccountNumber, setBankAccountNumber] = useState('')

  // Validators
  const validateUen = (v: string) => /^\d{8}[A-Z]$/.test(v)
  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  const validatePassword = (v: string) => v.length >= 8

  const passwordStrength = (pw: string): number => {
    let score = 0
    if (pw.length >= 8) score++
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    return score
  }

  const strengthLabel = (score: number) => {
    if (score <= 1) return 'Weak'
    if (score === 2) return 'Fair'
    if (score === 3) return 'Good'
    return 'Strong'
  }

  const canProceed = () => {
    if (step === 0) return businessName.trim().length > 0 && validateUen(uen)
    if (step === 1) return validateEmail(email) && validatePassword(password)
    if (step === 2) return bankName && bankHolderName.trim().length > 0 && bankAccountNumber.trim().length >= 6
    return false
  }

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1)
    } else {
      handleSubmit()
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setServerError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: businessName,
          uen,
          email,
          password,
          bankName,
          accountHolderName: bankHolderName,
          accountNo: bankAccountNumber,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setServerError(data.error || 'Registration failed')
        return
      }
      // Store verification data for the check-email page
      sessionStorage.setItem('registration', JSON.stringify({
        email,
        merchantId: data.merchantId,
        verificationUrl: data.verificationUrl,
      }))
      navigate('/check-email')
    } catch {
      setServerError('Network error — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const pwScore = passwordStrength(password)

  return (
    <OnboardingLayout steps={STEPS} currentStep={step}>
      <div className="onboarding-card" key={step}>
        <div className="onboarding-card-header">
          <div className="onboarding-card-icon">
            {step === 0 && '🏢'}
            {step === 1 && '🔐'}
            {step === 2 && '🏦'}
          </div>
          <h1>
            {step === 0 && 'Corporate Identity'}
            {step === 1 && 'Admin Access'}
            {step === 2 && 'Fiat Payout Routing'}
          </h1>
          <p>
            {step === 0 && 'Enter your legal business parameters to create your merchant account.'}
            {step === 1 && 'Set up your corporate admin credentials for platform access.'}
            {step === 2 && 'Designate your bank account for FAST settlement scheduling.'}
          </p>
        </div>

        {/* Step 1 — Corporate Identity */}
        {step === 0 && (
          <div>
            <FormInput
              label="Legal Business Name"
              name="businessName"
              placeholder="e.g. Acme Pte. Ltd."
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
            <FormInput
              label="Business Registration Number (UEN)"
              name="uen"
              placeholder="e.g. 53912345M"
              value={uen}
              onChange={(e) => setUen(e.target.value.toUpperCase())}
              validate={validateUen}
              error="Expected format: 8 digits + 1 capital letter (e.g. 53912345M)"
              required
            />
          </div>
        )}

        {/* Step 2 — Admin Access */}
        {step === 1 && (
          <div>
            <FormInput
              label="Corporate Email Address"
              name="email"
              type="email"
              placeholder="admin@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              validate={validateEmail}
              error="Please enter a valid email address"
              required
            />
            <FormInput
              label="Admin Password"
              name="password"
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              validate={validatePassword}
              error="Password must be at least 8 characters"
              required
            />
            {password.length > 0 && (
              <>
                <div className="password-strength">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`password-strength-bar ${
                        pwScore >= level
                          ? pwScore <= 1
                            ? 'weak'
                            : pwScore <= 2
                            ? 'medium'
                            : 'strong'
                          : ''
                      }`}
                    />
                  ))}
                </div>
                <div className="password-strength-text">
                  Strength: {strengthLabel(pwScore)}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3 — Bank Details */}
        {step === 2 && (
          <div>
            <div className="form-group">
              <label className="form-label" htmlFor="bankName">
                Corporate Bank Name <span style={{ color: '#f0a500' }}>*</span>
              </label>
              <select
                id="bankName"
                className="form-select"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              >
                <option value="">Select your bank</option>
                {SG_BANKS.map((bank) => (
                  <option key={bank} value={bank}>{bank}</option>
                ))}
              </select>
            </div>
            <FormInput
              label="Account Holder Name"
              name="bankHolderName"
              placeholder="Name as per bank records"
              value={bankHolderName}
              onChange={(e) => setBankHolderName(e.target.value)}
              required
            />
            <FormInput
              label="Bank Account Number"
              name="bankAccountNumber"
              placeholder="e.g. 0012345678"
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              validate={(v) => v.length >= 6}
              error="Account number must be at least 6 digits"
              required
            />
          </div>
        )}

        {/* Server error */}
        {serverError && (
          <div className="form-error" style={{ marginBottom: 16 }}>
            ⚠ {serverError}
          </div>
        )}

        {/* Navigation */}
        <div className="onboarding-nav">
          {step > 0 ? (
            <button className="btn-onboarding-back" onClick={() => setStep(step - 1)}>
              ← Previous Step
            </button>
          ) : (
            <button
              className="btn-onboarding-back"
              onClick={() => navigate('/')}
            >
              ← Back to Home
            </button>
          )}
          <button
            className={`btn-onboarding-primary ${loading ? 'btn-loading' : ''}`}
            disabled={!canProceed() || loading}
            onClick={handleNext}
          >
            {step < 2 ? 'Next →' : loading ? 'Registering...' : 'Create Account →'}
          </button>
        </div>
      </div>
    </OnboardingLayout>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingLayout from '../components/onboarding/OnboardingLayout'
import { DocumentUploader, type UploadedDoc } from '../components/onboarding/DocumentUploader'
import { motion } from 'motion/react'
import { Eye, EyeOff, Crown, Calculator, Monitor } from 'lucide-react'

const STEPS = [
  { label: 'Register your business' },
  { label: 'Configure your access' },
  { label: 'Setup payouts' },
]

const SG_BANKS = [
  'DBS Bank',
  'OCBC Bank',
  'United Overseas Bank (UOB)',
  'Standard Chartered Bank',
  'HSBC Singapore',
]

const ROLES = [
  { value: 'CEO', label: 'CEO', desc: 'Chief Executive Officer', icon: Crown },
  { value: 'CFO', label: 'CFO', desc: 'Chief Financial Officer', icon: Calculator },
  { value: 'TECH_LEAD', label: 'Tech Lead', desc: 'Technology Department', icon: Monitor },
]

// Reusable Components
function InputGroup({ 
  label, 
  placeholder, 
  type = "text", 
  value, 
  onChange,
  error,
  required
}: { 
  label: string; 
  placeholder: string; 
  type?: string;
  value: string;
  onChange: (e: any) => void;
  error?: string;
  required?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  
  return (
    <div className="flex flex-col space-y-2">
      <label className="text-sm font-medium text-white">{label}</label>
      <div className="relative">
        <input
          type={isPassword && showPassword ? 'text' : type}
          className={`w-full bg-brand-gray border-none rounded-xl h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 outline-none transition-all ${error ? 'ring-2 ring-red-500/50' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
        />
        {isPassword && (
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
      {isPassword && !error && <span className="text-xs text-white/40">Requires at least 8 symbols.</span>}
    </div>
  )
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  // Step 1: Business details
  const [businessName, setBusinessName] = useState('')
  const [uen, setUen] = useState('')
  const [acraDoc, setAcraDoc] = useState<UploadedDoc | undefined>(undefined)

  // ACRA Singapore Registered Entity Dictionary
  const ACRA_UEN_LOOKUP: Record<string, string> = {
    '199201624D': 'Shopee Singapore Pte. Ltd.',
    '200813955N': 'DBS Bank Ltd.',
    '200604346E': 'Singapore Airlines Limited',
    '198000346R': 'Singapore Telecommunications Limited (Singtel)',
    'T08GB0032G': 'Central Provident Fund Board (CPF)',
    '201912345M': 'ACME Fintech Solutions Pte. Ltd.',
    '53912345M': 'Acme Retail Solutions',
    '202088991K': 'Merlion Retail Holdings Pte. Ltd.',
    '201405678W': 'Grabtaxi Holdings Pte. Ltd.',
    '201314567Z': 'Razer (Asia-Pacific) Pte. Ltd.',
  }

  const handleUenChange = async (inputVal: string) => {
    const clean = inputVal.replace(/\D/g, '').slice(0, 9)
    setUen(clean)

    if (!clean) return

    // 1. Instant Client Dictionary Match
    if (ACRA_UEN_LOOKUP[clean]) {
      setBusinessName(ACRA_UEN_LOOKUP[clean])
      return
    }

    if (clean.length < 9) return

    // 2. Fetch from Backend / API
    try {
      const res = await fetch(`/api/acra/lookup/${clean}`)
      if (res.ok) {
        const data = await res.json()
        if (data.entity_name) {
          setBusinessName(data.entity_name)
        }
      }
    } catch (e) {
      // Offline fallback
    }
  }

  // Step 2: Access configuration
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Step 3: Payout routing
  const [bankName, setBankName] = useState('')
  const [bankHolderName, setBankHolderName] = useState('')
  const [bankAccountNumber, setBankAccountNumber] = useState('')

  const validateUen = (v: string) => /^\d{9}$/.test(v)
  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  const validatePassword = (v: string) => v.length >= 8

  const canProceed = () => {
    if (step === 0) return businessName.trim().length > 0 && validateUen(uen)
    if (step === 1) return fullName.trim().length >= 2 && role && validateEmail(email) && validatePassword(password)
    if (step === 2) return bankName && bankHolderName.trim().length > 0 && bankAccountNumber.trim().length >= 6
    return false
  }

  const handleNext = () => {
    if (step < 2) setStep(step + 1)
    else handleSubmit()
  }

  const handleSubmit = async () => {
    setLoading(true)
    setServerError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          businessName,
          uen,
          email,
          password,
          bankName,
          bankHolderName,
          bankAccountNumber,
          role,
          fullName,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setServerError(data.error || 'Registration failed')
        return
      }
      localStorage.setItem('token', data.token)
      localStorage.setItem('merchant', JSON.stringify(data.merchant))
      navigate('/kyc')
    } catch {
      setServerError('Network error — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingLayout steps={STEPS} currentStep={step}>
      <div className="flex-1 flex flex-col items-center justify-center py-12 lg:py-6 px-4 sm:px-12 lg:px-16 xl:px-24 overflow-y-auto lg:overflow-hidden">
        <motion.div 
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-xl space-y-8 lg:space-y-6 sm:space-y-10"
        >
          {/* Header */}
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-medium tracking-tight text-white">
              {step === 0 && 'Register Your Business'}
              {step === 1 && 'Configure Access'}
              {step === 2 && 'Setup Payouts'}
            </h2>
            <p className="text-white/40 text-sm">
              {step === 0 && 'Input your business details to begin the journey.'}
              {step === 1 && 'Set up your account credentials and role.'}
              {step === 2 && 'Where should we route your fast settlements?'}
            </p>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {step === 0 && (
              <div className="space-y-4">
                <DocumentUploader
                  docType="ACRA_BIZFILE"
                  title="Upload ACRA BizFile (Instant Registration Auto-Fill)"
                  description="Upload your ACRA business profile to automatically populate Business Name and UEN."
                  uploadedDoc={acraDoc}
                  onFileUpload={(doc) => {
                    setAcraDoc(doc)
                    if (doc.extractedMetadata) {
                      if (doc.extractedMetadata.businessName) setBusinessName(doc.extractedMetadata.businessName)
                      if (doc.extractedMetadata.uen) setUen(doc.extractedMetadata.uen)
                    }
                  }}
                  onFileRemove={() => setAcraDoc(undefined)}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputGroup 
                    label="Business Name" 
                    placeholder="e.g. Acme Corp" 
                    value={businessName} 
                    onChange={(e) => setBusinessName(e.target.value)} 
                  />
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-white">Singapore UEN</label>
                      {uen.length > 0 && validateUen(uen) && (
                        <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                          Valid 9-digit UEN
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. 123456789"
                      value={uen}
                      onChange={(e) => handleUenChange(e.target.value)}
                      className={`w-full bg-brand-gray border-none rounded-xl h-11 px-4 text-white placeholder:text-white/20 outline-none focus:ring-2 focus:ring-white/20 font-mono ${
                        uen.length > 0 && !validateUen(uen) ? 'ring-2 ring-red-500/50' : uen.length > 0 && validateUen(uen) ? 'ring-2 ring-emerald-500/50' : ''
                      }`}
                    />
                    {uen.length > 0 && !validateUen(uen) && (
                      <span className="text-xs text-red-400">
                        Invalid UEN structure. Use 9 digits to match Stripe sandbox test data.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <>
                <InputGroup 
                  label="Full Name" 
                  placeholder="As per NRIC / Passport" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)} 
                />

                {/* Role Selector — Only CEO, CFO, or Tech Lead can access the platform */}
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium text-white">Your Role</label>
                  <p className="text-xs text-white/30">Only one account per role per business is allowed.</p>
                  <div className="grid grid-cols-3 gap-3">
                    {ROLES.map(r => {
                      const Icon = r.icon
                      const isSelected = role === r.value
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setRole(r.value)}
                          className={`p-4 rounded-xl text-center transition-all border ${
                            isSelected
                              ? 'bg-white text-black border-white'
                              : 'bg-brand-gray text-white border-white/5 hover:border-white/20'
                          }`}
                        >
                          <Icon className={`w-5 h-5 mx-auto mb-2 ${isSelected ? 'text-black' : 'text-white/60'}`} />
                          <span className="text-sm font-semibold block">{r.label}</span>
                          <span className={`text-[10px] ${isSelected ? 'text-black/50' : 'text-white/30'}`}>
                            {r.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <InputGroup 
                  label="Corporate Email" 
                  type="email"
                  placeholder="admin@company.com" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                />
                <InputGroup 
                  label="Password" 
                  type="password"
                  placeholder="••••••••" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                />
              </>
            )}

            {step === 2 && (
              <>
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium text-white">Bank Name</label>
                  <select
                    className="w-full bg-brand-gray border-none rounded-xl h-11 px-4 text-white outline-none focus:ring-2 focus:ring-white/20 appearance-none"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  >
                    <option value="" className="text-white/40">Select your bank</option>
                    {SG_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputGroup 
                    label="Account Holder Name" 
                    placeholder="Name as per bank" 
                    value={bankHolderName} 
                    onChange={(e) => setBankHolderName(e.target.value)} 
                  />
                  <InputGroup 
                    label="Account Number" 
                    placeholder="0012345678" 
                    value={bankAccountNumber} 
                    onChange={(e) => setBankAccountNumber(e.target.value)} 
                  />
                </div>
              </>
            )}
          </div>

          {serverError && (
            <div className="text-sm text-red-400 text-center bg-red-400/10 py-2 rounded-lg">
              ⚠ {serverError}
            </div>
          )}

          {/* Controls */}
          <div className="pt-2">
            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="w-full h-14 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? 'Processing...' : step < 2 ? 'Continue' : 'Create Account'}
            </button>

            <div className="mt-6 flex items-center justify-between text-sm">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="text-white/40 hover:text-white transition-colors">
                  ← Go back
                </button>
              )}
              {step === 0 && (
                <p className="text-white/40 w-full text-center mt-4">
                  Member of the team? <a href="/login" className="text-white hover:underline">Log in</a>
                </p>
              )}
            </div>
          </div>

        </motion.div>
      </div>
    </OnboardingLayout>
  )
}

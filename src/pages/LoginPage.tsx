import { useState, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import OnboardingLayout from '../components/onboarding/OnboardingLayout'
import { motion } from 'motion/react'
import { Eye, EyeOff, CheckCircle2, UploadCloud, FileText, Lock } from 'lucide-react'

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
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requiresPdfVerification = searchParams.get('kyb_approved') === 'true'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (requiresPdfVerification && !pdfFile) {
      setError('Please upload your downloaded KYB Certificate PDF to complete authentication.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('merchant', JSON.stringify(data.merchant))

      // Take merchant straight to Dashboard!
      navigate('/dashboard')
    } catch {
      setError('Network error — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingLayout showSteps={false}>
      <div className="flex-1 flex flex-col items-center justify-center py-12 lg:py-6 px-4 sm:px-12 lg:px-16 xl:px-24 overflow-y-auto lg:overflow-hidden w-full">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-md space-y-6"
        >
          {/* Header */}
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-medium tracking-tight text-white">Log in to Onyx</h2>
            <p className="text-white/40 text-sm">
              {requiresPdfVerification 
                ? 'Upload your downloaded KYB Certificate PDF to authenticate your first login.' 
                : 'Welcome back. Enter your corporate credentials.'}
            </p>
          </div>

          {requiresPdfVerification && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3.5 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              KYB Verification Completed! Upload your downloaded Certificate PDF below to log in.
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <InputGroup 
              label="Corporate Email" 
              type="email"
              placeholder="admin@company.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
            />

            <InputGroup 
              label="Password" 
              type="password"
              placeholder="••••••••" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
            />

            {/* KYB Certificate PDF Upload Box for First-Time Verification */}
            {requiresPdfVerification && (
              <div className="flex flex-col space-y-2 pt-1">
                <label className="text-sm font-medium text-white flex items-center justify-between">
                  <span>Attach KYB Certificate (PDF)</span>
                  <span className="text-xs text-white/40">.pdf format</span>
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.png,.jpg"
                  onChange={(e) => e.target.files?.[0] && setPdfFile(e.target.files[0])}
                  className="hidden"
                />

                {!pdfFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/10 hover:border-white/30 bg-brand-gray rounded-xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center gap-1.5"
                  >
                    <UploadCloud className="w-5 h-5 text-white/60" />
                    <span className="text-xs text-white/80 font-medium">Click to attach downloaded Certificate PDF</span>
                  </div>
                ) : (
                  <div className="bg-brand-gray border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="truncate">{pdfFile.name}</span>
                    </div>
                    <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-md">✓ Attached</span>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="text-sm text-red-400 text-center bg-red-400/10 py-2 rounded-lg">
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'Authenticating...' : 'Log In & Access Dashboard'}
            </button>
          </form>

          <div className="text-center text-sm text-white/40">
            Don't have an account?{' '}
            <Link to="/register" className="text-white hover:underline font-medium">
              Register your business
            </Link>
          </div>
        </motion.div>
      </div>
    </OnboardingLayout>
  )
}

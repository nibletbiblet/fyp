import logoIcon from '../../assets/logo-icon.png'

interface Step {
  label: string
  sublabel?: string
}

interface OnboardingLayoutProps {
  steps?: Step[]
  currentStep?: number
  children: React.ReactNode
  showSteps?: boolean
}

export default function OnboardingLayout({
  steps = [],
  currentStep = 0,
  children,
  showSteps = true,
}: OnboardingLayoutProps) {
  return (
    <div className="onboarding-wrapper">
      {/* Progress bar at top */}
      {showSteps && steps.length > 0 && (
        <div className="progress-bar-wrap">
          <div
            className="progress-bar-fill"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      )}

      {/* Left panel */}
      <aside className="onboarding-left">
        {/* Logo */}
        <div className="onboarding-left-logo">
          <img src={logoIcon} alt="ChainForge" />
          <div className="onboarding-left-logo-text">
            <span>ChainForge</span>
            <span>Payment Platform</span>
          </div>
        </div>

        {/* Step indicator */}
        {showSteps && steps.length > 0 && (
          <div className="step-indicator">
            {steps.map((step, i) => {
              let state = 'upcoming'
              if (i < currentStep) state = 'completed'
              else if (i === currentStep) state = 'active'

              return (
                <div key={i} className={`step-item ${state}`}>
                  <div className="step-circle">
                    {state === 'completed' ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 7L6 10L11 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <div>
                    <div className="step-label">{step.label}</div>
                    {step.sublabel && <div className="step-sublabel">{step.sublabel}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Decorative footer */}
        <div className="onboarding-left-decor">
          <p>
            <strong>Enterprise-grade</strong> payment infrastructure powered by
            MAS-licensed crypto payment providers. Secure, compliant, and
            production-ready.
          </p>
        </div>
      </aside>

      {/* Right panel */}
      <main className="onboarding-right">{children}</main>
    </div>
  )
}

import React from 'react'
import { Circle } from 'lucide-react'
import { motion } from 'motion/react'

interface Step {
  label: string
  sublabel?: string
}

interface OnboardingLayoutProps {
  steps?: Step[]
  currentStep?: number
  onStepClick?: (stepIndex: number) => void
  children: React.ReactNode
  showSteps?: boolean
}

function StepItem({ 
  number, 
  text, 
  active, 
  onClick 
}: { 
  number: number
  text: string
  active?: boolean
  onClick?: () => void 
}) {
  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 bg-white text-black border border-white px-4 py-3 rounded-xl shadow-lg transition-all cursor-pointer text-left"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-white text-xs font-semibold shrink-0">
          {number}
        </div>
        <span className="font-medium text-sm truncate">{text}</span>
      </button>
    )
  }
  
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-brand-gray text-white border-none px-4 py-3 rounded-xl opacity-80 hover:opacity-100 hover:bg-white/10 transition-all cursor-pointer text-left group"
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/20 text-white/50 group-hover:text-white text-xs font-medium shrink-0 transition-colors">
        {number}
      </div>
      <span className="font-medium text-sm text-white/70 group-hover:text-white transition-colors truncate">{text}</span>
    </button>
  )
}

export default function OnboardingLayout({
  steps = [],
  currentStep = 0,
  onStepClick,
  children,
  showSteps = true,
}: OnboardingLayoutProps) {
  return (
    <main className="flex min-h-screen w-full bg-black selection:bg-white/30 p-2 transition-all duration-500 lg:h-screen lg:overflow-hidden lg:p-4">
      {/* Left Column (Hero) */}
      <div className="hidden lg:flex w-[52%] relative flex-col items-center justify-end pb-32 px-12 rounded-3xl overflow-hidden shadow-2xl h-full">
        {/* Background Video */}
        <video
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4" type="video/mp4" />
        </video>

        {/* Hero Content Container */}
        <motion.div 
          className="z-10 w-full max-w-xs space-y-8"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { 
              opacity: 1, 
              transition: { staggerChildren: 0.15, delayChildren: 0.2 } 
            }
          }}
        >
          <motion.div variants={{ hidden: { y: 10, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.5 } } }} className="flex items-center gap-2">
            <Circle className="fill-white text-white w-6 h-6" />
            <span className="text-xl font-semibold tracking-tight text-white">Onyx</span>
          </motion.div>
          
          <motion.div variants={{ hidden: { y: 10, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.5 } } }}>
            <h1 className="text-4xl font-medium tracking-tight whitespace-nowrap text-white">Join Onyx</h1>
            <p className="text-white/60 text-sm leading-relaxed mt-2">
              Follow these 3 quick phases to activate your space.
            </p>
          </motion.div>

          {showSteps && steps.length > 0 && (
            <motion.div variants={{ hidden: { y: 10, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.5 } } }} className="space-y-3">
              {steps.map((step, index) => (
                <StepItem 
                  key={index} 
                  number={index + 1} 
                  text={step.label} 
                  active={currentStep === index} 
                  onClick={() => onStepClick?.(index)}
                />
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Right Column (Form Container) */}
      {children}
    </main>
  )
}

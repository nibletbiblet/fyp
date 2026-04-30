import { motion } from 'motion/react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { FadeUp } from './Animations'

const hashAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
const shortHash = `${hashAddress.slice(0, 6)}...${hashAddress.slice(-4)}`

export default function Hero() {
  return (
    <section
      id="home"
      className="relative overflow-hidden crt-shimmer"
      style={{ paddingTop: '108px', minHeight: '100vh', background: 'var(--bg)' }}
    >
      {/* Background video — full bleed, dimmed */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster="/images/hero_bg.jpeg"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'brightness(0.07) saturate(0.3)', zIndex: 0 }}
      >
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260307_083826_e938b29f-a43a-41ec-a153-3d4730578ab8.mp4"
          type="video/mp4"
        />
      </video>

      {/* Grid lines overlay */}
      <div className="absolute inset-0 grid-lines opacity-100 z-[1] pointer-events-none" />

      {/* Amber vertical accent line */}
      <div
        className="absolute left-[10%] top-0 bottom-0 w-px z-[2] pointer-events-none hidden lg:block"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--amber), transparent)', opacity: 0.15 }}
      />

      {/* Content wrapper — left-aligned, offset layout */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 pt-16 pb-20 lg:pt-24">

        {/* Top status row */}
        <FadeUp>
          <div className="flex items-center gap-6 mb-12">
            <div className="hash-chip flex items-center gap-2">
              <div className="live-dot" />
              <span>CONTRACT: {shortHash}</span>
            </div>
            <div
              className="hidden sm:flex items-center gap-2 text-xs"
              style={{ color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}
            >
              <span>NETWORK: MAINNET</span>
              <span className="opacity-30">|</span>
              <span>CHAIN ID: 1</span>
            </div>
          </div>
        </FadeUp>

        {/* Main headline — massive, left-aligned, breaking convention */}
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="font-heading font-bold text-white leading-none glitch"
              data-text="THE CHAIN"
              style={{
                fontSize: 'clamp(4rem, 13vw, 11rem)',
                letterSpacing: '-0.035em',
                lineHeight: 0.85,
              }}
            >
              THE CHAIN
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-end gap-6 mt-2"
          >
            <div
              className="font-heading font-bold leading-none"
              style={{
                fontSize: 'clamp(4rem, 13vw, 11rem)',
                letterSpacing: '-0.035em',
                color: 'var(--amber)',
                lineHeight: 0.85,
              }}
            >
              FORGED
            </div>
            <div
              className="hidden lg:block mb-3 text-sm font-heading font-light"
              style={{ color: 'var(--text-secondary)', maxWidth: '220px', lineHeight: 1.5 }}
            >
              Institutional-grade.<br />
              Trustless by design.<br />
              On-chain settlement.
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="font-heading font-light leading-none"
              style={{
                fontSize: 'clamp(4rem, 13vw, 11rem)',
                letterSpacing: '-0.035em',
                color: 'rgba(255,255,255,0.12)',
                lineHeight: 0.85,
              }}
            >
              ON-CHAIN
            </div>
          </motion.div>
        </div>

        {/* Bottom row: description + CTAs + metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-16 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

          {/* Description */}
          <FadeUp delay={0.4} className="lg:col-span-1">
            <p className="font-heading font-light text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Protocol-level infrastructure for the decentralized era.
              Deploy smart contracts, manage liquidity, and settle on-chain —
              all without intermediaries.
            </p>
          </FadeUp>

          {/* CTAs */}
          <FadeUp delay={0.5} className="flex items-center gap-4 lg:col-span-1 lg:justify-center">
            <a href="#cta" id="hero-cta-primary" className="btn-primary">
              Launch App <ArrowRight size={14} />
            </a>
            <a href="#protocol" id="hero-cta-secondary" className="btn-ghost">
              Read Docs <ExternalLink size={12} />
            </a>
          </FadeUp>

          {/* Live metrics */}
          <FadeUp delay={0.6} className="lg:col-span-1 flex flex-col gap-2">
            {[
              { label: 'TVL', value: '$4.2B', delta: '+12.4%' },
              { label: 'Daily TXs', value: '2.1M', delta: '+3.8%' },
              { label: 'Validators', value: '14,892', delta: 'Staked' },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="mono">{m.label}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono-custom text-xs font-bold text-white/80">{m.value}</span>
                  <span className="mono" style={{ color: m.delta.startsWith('+') ? '#22c55e' : 'var(--amber)' }}>{m.delta}</span>
                </div>
              </div>
            ))}
          </FadeUp>
        </div>
      </div>

      {/* Bottom separator */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px z-10"
        style={{ background: 'linear-gradient(90deg, transparent, var(--amber), transparent)', opacity: 0.3 }}
      />
    </section>
  )
}

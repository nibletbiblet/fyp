import { FadeUp } from './Animations'
import HlsVideo from './HlsVideo'
import { ArrowRight } from 'lucide-react'

export default function CtaFooter() {
  return (
    <section id="cta" className="relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Background video strip */}
      <div className="relative overflow-hidden" style={{ minHeight: '520px' }}>
        <HlsVideo
          src="https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'brightness(0.08) saturate(0.3)' }}
        />
        <div className="absolute inset-0 grid-lines" />

        {/* Left accent: vertical amber bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--amber), transparent)' }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 py-24 flex flex-col justify-center h-full" style={{ minHeight: '520px' }}>
          <FadeUp>
            <div className="mono-amber mb-6">// GET EARLY ACCESS</div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <h2
              className="font-heading font-bold text-white mb-8"
              style={{
                fontSize: 'clamp(2.5rem, 8vw, 6.5rem)',
                lineHeight: 0.88,
                letterSpacing: '-0.03em',
                maxWidth: '820px',
              }}
            >
              Your on-chain<br />
              future starts<br />
              <span style={{ color: 'var(--amber)' }}>now.</span>
            </h2>
          </FadeUp>

          <FadeUp delay={0.2}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start" style={{ maxWidth: '820px' }}>
              <div>
                <p className="font-heading font-light text-sm leading-relaxed mb-8" style={{ color: 'var(--text-secondary)' }}>
                  Deploy your first contract. Join 1.4M wallets already building
                  on the fastest finality layer in production. No seed phrase drama.
                  No gas wars. Just clean, fast, trustless infrastructure.
                </p>
                <div className="flex items-center gap-4 flex-wrap">
                  <a href="#" id="cta-primary" className="btn-primary">
                    Request Early Access <ArrowRight size={14} />
                  </a>
                  <a href="#" id="cta-secondary" className="btn-ghost">
                    View Tokenomics
                  </a>
                </div>
              </div>

              {/* Info panel */}
              <div className="panel">
                <div
                  className="px-5 py-3 mono-amber text-[10px]"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  EARLY ACCESS INCLUDES
                </div>
                {[
                  'Testnet & Mainnet access',
                  'Dedicated validator slot',
                  'Direct engineering support',
                  'Reduced protocol fees (90 days)',
                ].map((item, i) => (
                  <div key={i} className="data-row px-5">
                    <div className="flex items-center gap-3">
                      <span style={{ color: 'var(--amber)', fontSize: '10px', fontFamily: 'Space Mono' }}>→</span>
                      <span className="font-heading font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>
      </div>

      {/* Footer */}
      <footer
        className="border-t"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'var(--bg-raised)' }}
        id="footer"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <span className="font-heading font-bold text-white text-sm tracking-wide">CHAINFORGE</span>
            <span className="mono">© 2026 — BUILT ON-CHAIN — ALL RIGHTS RESERVED</span>
          </div>

          <div className="flex items-center gap-8 flex-wrap">
            {['Privacy', 'Terms', 'Docs', 'Discord', 'GitHub'].map((link) => (
              <a
                key={link}
                href="#"
                id={`footer-${link.toLowerCase()}`}
                className="mono hover:text-white transition-colors duration-150"
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </section>
  )
}

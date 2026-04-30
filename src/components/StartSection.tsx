import { FadeUp, Typewriter } from './Animations'
import HlsVideo from './HlsVideo'
import { ArrowRight } from 'lucide-react'

const steps = [
  {
    num: '01',
    title: 'Connect',
    desc: 'Link any EVM-compatible wallet. MetaMask, WalletConnect, Ledger. No KYC. No gatekeepers.',
    tag: 'PERMISSIONLESS',
  },
  {
    num: '02',
    title: 'Deploy',
    desc: 'Push your contract bytecode. Our validator set confirms in under 400ms. Finality, not probability.',
    tag: 'SUB-SECOND FINALITY',
  },
  {
    num: '03',
    title: 'Scale',
    desc: 'Protocol handles throughput. You focus on product. 50,000 TPS. No congestion auctions.',
    tag: '50K TPS',
  },
]

export default function StartSection() {
  return (
    <section id="protocol" className="relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Video strip — full bleed, heavily tinted */}
      <div className="relative h-[40vh] overflow-hidden">
        <HlsVideo
          src="https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'brightness(0.15) saturate(0.4) hue-rotate(200deg)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, rgba(8,8,8,0.95) 30%, rgba(8,8,8,0.4) 100%)' }}
        />
        <div className="absolute inset-0 grid-lines opacity-60" />

        {/* Overlay text on video strip */}
        <div className="absolute inset-0 flex items-center px-6 lg:px-12">
          <div className="max-w-2xl">
            <div className="mono-amber mb-3">// HOW IT WORKS</div>
            <h2
              className="font-heading font-bold text-white"
              style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', lineHeight: 0.9, letterSpacing: '-0.025em' }}
            >
              <Typewriter text="You propose." delay={200} />
              <br />
              <span style={{ color: 'var(--amber)' }}>
                <Typewriter text="The chain executes." delay={900} />
              </span>
            </h2>
          </div>
        </div>

        {/* Right: amber vertical rule */}
        <div
          className="absolute right-[15%] top-0 bottom-0 w-px hidden lg:block"
          style={{ background: 'var(--amber)', opacity: 0.12 }}
        />
      </div>

      {/* Steps — data-table layout */}
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          {steps.map((step, i) => (
            <FadeUp key={step.num} delay={i * 0.12}>
              <div className="flex flex-col gap-4 p-8 group hover:bg-white/[0.015] transition-colors duration-300">
                {/* Number + tag */}
                <div className="flex items-center justify-between">
                  <span
                    className="font-mono-custom font-bold"
                    style={{ color: 'var(--amber)', fontSize: '2rem', lineHeight: 1 }}
                  >
                    {step.num}
                  </span>
                  <span className="mono" style={{ color: 'var(--text-muted)' }}>{step.tag}</span>
                </div>

                {/* Title */}
                <h3
                  className="font-heading font-bold text-white"
                  style={{ fontSize: '1.5rem', letterSpacing: '-0.02em' }}
                >
                  {step.title}
                </h3>

                {/* Desc */}
                <p className="font-heading font-light text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {step.desc}
                </p>

                {/* Bottom amber rule on hover */}
                <div
                  className="h-px w-0 group-hover:w-full transition-all duration-500 mt-auto pt-4"
                  style={{ background: 'var(--amber)', opacity: 0.4 }}
                />
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp delay={0.4}>
          <div className="mt-8 pt-8 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="mono" style={{ color: 'var(--text-muted)' }}>
              AVERAGE DEPLOYMENT TIME: <span className="text-white">{'< 2 MIN'}</span>
            </span>
            <a href="#cta" className="btn-primary text-[11px] py-2 px-5">
              Start Building <ArrowRight size={13} />
            </a>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

import { FadeUp } from './Animations'
import { ExternalLink } from 'lucide-react'

const testimonials = [
  {
    id: 'review-1',
    index: 'R-001',
    quote: 'We migrated our entire DeFi protocol in 72 hours. Settlement speeds tripled. The security model is unlike anything else in production right now.',
    name: 'James Huang',
    role: 'CTO',
    company: 'NexusFi',
    metric: '3× faster',
    metricContext: 'settlement speed',
  },
  {
    id: 'review-2',
    index: 'R-002',
    quote: 'TVL up 6x in 90 days post-migration. That\'s not luck. That\'s what happens when your chain is built on real performance data.',
    name: 'Priya Nair',
    role: 'Head of DeFi',
    company: 'Arcline Protocol',
    metric: '6× TVL growth',
    metricContext: 'in 90 days',
  },
  {
    id: 'review-3',
    index: 'R-003',
    quote: 'They didn\'t just give us infrastructure. They gave us an edge. Institutional-grade with the agility of a startup. That\'s rare in Web3.',
    name: 'Lukas Brandt',
    role: 'Founder',
    company: 'Helix Capital DAO',
    metric: '$200M+ AUM',
    metricContext: 'managed on-chain',
  },
]

export default function Testimonials() {
  return (
    <section
      id="community"
      style={{ background: 'var(--bg-raised)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 lg:px-12 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="mono-amber">// COMMUNITY REPORTS</span>
        <span className="mono">VERIFIED ON-CHAIN</span>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
        {/* Large quote display */}
        <FadeUp>
          <div
            className="mb-12 pb-12 accent-left"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p
              className="font-heading font-light text-white/70"
              style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.6rem)', lineHeight: 1.4, maxWidth: '800px' }}
            >
              "The moment we went live on ChainForge, everything changed.
              <span style={{ color: 'var(--amber)' }}> Latency dropped 94%.</span> Our users noticed before we did."
            </p>
            <div className="mt-6 flex items-center gap-4">
              <div
                className="w-8 h-8 flex items-center justify-center font-mono-custom font-bold text-xs"
                style={{ background: 'var(--amber)', color: '#000' }}
              >
                MR
              </div>
              <div>
                <div className="font-heading font-medium text-white text-sm">Marcus Reid</div>
                <div className="mono">CTO, Vertex Protocol — $1.2B TVL</div>
              </div>
            </div>
          </div>
        </FadeUp>

        {/* Reviews table */}
        <div className="flex flex-col gap-0">
          {testimonials.map((t, i) => (
            <FadeUp key={t.id} delay={i * 0.1}>
              <div
                id={t.id}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-0 py-8 group"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                {/* Index */}
                <div className="lg:col-span-1 flex lg:flex-col justify-between lg:justify-start gap-2">
                  <span className="mono">{t.index}</span>
                  <span className="mono lg:hidden">{t.company}</span>
                </div>

                {/* Quote */}
                <div className="lg:col-span-6 lg:px-8">
                  <p className="font-heading font-light text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    "{t.quote}"
                  </p>
                </div>

                {/* Attribution */}
                <div className="lg:col-span-3 lg:px-8 flex flex-col justify-center">
                  <div className="font-heading font-semibold text-white text-sm">{t.name}</div>
                  <div className="mono mt-1">{t.role}, {t.company}</div>
                </div>

                {/* Metric */}
                <div className="lg:col-span-2 lg:pl-8 lg:border-l flex flex-col justify-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="font-mono-custom font-bold"
                    style={{ color: 'var(--amber)', fontSize: '1.1rem', lineHeight: 1 }}
                  >
                    {t.metric}
                  </div>
                  <div className="mono mt-1">{t.metricContext}</div>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>

        {/* View more */}
        <FadeUp delay={0.3}>
          <div className="mt-8 flex items-center gap-3">
            <a href="#" className="btn-ghost text-[11px] py-2 px-5">
              Read all case studies <ExternalLink size={12} />
            </a>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

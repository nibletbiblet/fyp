import { FadeUp } from './Animations'
import feature1 from '../assets/feature-1.gif'
import feature2 from '../assets/feature-2.gif'

const features = [
  {
    id: 'chess-1',
    index: '001',
    tag: 'CONSENSUS',
    title: 'Engineered to scale.\nHardened to survive.',
    body: 'Byzantine fault-tolerant consensus at 50,000 TPS. Every transaction achieves probabilistic finality in one block — not one confirmation. No sequencer. No trusted third party.',
    specs: [
      { label: 'BLOCK TIME', value: '0.4s' },
      { label: 'FINALITY', value: '1 BLOCK' },
      { label: 'TPS', value: '50,000' },
    ],
    gif: feature1,
    reverse: false,
  },
  {
    id: 'chess-2',
    index: '002',
    tag: 'ZK PROOFS',
    title: 'Verifiable.\nOn every state change.',
    body: 'Zero-knowledge proofs generated natively at the protocol layer. Privacy without sacrificing verifiability. Your transactions are provably correct — not just trusted.',
    specs: [
      { label: 'PROOF TIME', value: '< 200ms' },
      { label: 'PROOF SIZE', value: '2.1 KB' },
      { label: 'VERIFY COST', value: '21K GAS' },
    ],
    gif: feature2,
    reverse: true,
  },
]

export default function FeaturesChess() {
  return (
    <section id="chain" className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'var(--bg)' }}>

      {/* Section header — full-width bar */}
      <div
        className="flex items-center justify-between px-6 lg:px-12 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-raised)' }}
      >
        <div className="flex items-center gap-6">
          <span className="mono-amber">// CAPABILITIES</span>
          <span className="mono hidden sm:block">PROTOCOL FEATURES</span>
        </div>
        <span className="mono">v2.0.0-mainnet</span>
      </div>

      {/* Feature rows */}
      {features.map((feat) => (
        <FadeUp key={feat.id} delay={0.1}>
          <div
            id={feat.id}
            className={`grid grid-cols-1 lg:grid-cols-2 ${feat.reverse ? 'lg:grid-flow-col-dense' : ''}`}
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* Text column */}
            <div
              className={`flex flex-col justify-between p-8 lg:p-12 gap-8 ${feat.reverse ? 'lg:col-start-2' : ''}`}
              style={{ borderRight: feat.reverse ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
            >
              {/* Header */}
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-mono-custom font-bold" style={{ color: 'var(--amber)', fontSize: '1.5rem' }}>
                    {feat.index}
                  </span>
                  <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  <span className="mono">{feat.tag}</span>
                </div>

                <h3
                  className="font-heading font-bold text-white mb-4"
                  style={{ fontSize: 'clamp(1.6rem, 3vw, 2.8rem)', letterSpacing: '-0.02em', lineHeight: 1.05, whiteSpace: 'pre-line' }}
                >
                  {feat.title}
                </h3>
                <p className="font-heading font-light text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {feat.body}
                </p>
              </div>

              {/* Specs table */}
              <div className="panel" style={{ padding: '0' }}>
                {feat.specs.map((spec, si) => (
                  <div key={si} className="data-row px-5" style={{ gap: '0', justifyContent: 'space-between' }}>
                    <span className="mono">{spec.label}</span>
                    <span className="font-mono-custom font-bold text-xs text-white/80">{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* GIF column */}
            <div
              className={`relative overflow-hidden ${feat.reverse ? 'lg:col-start-1' : ''}`}
              style={{
                minHeight: '320px',
                borderLeft: feat.reverse ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}
            >
              <img
                src={feat.gif}
                alt={feat.title}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'saturate(0.2) brightness(0.7) contrast(1.1)' }}
              />
              {/* Amber scan line overlay */}
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(240,165,0,0.08) 0%, transparent 60%)',
                }}
              />
              {/* Corner bracket */}
              <div
                className="absolute top-4 right-4 w-8 h-8"
                style={{
                  borderTop: '2px solid rgba(240,165,0,0.5)',
                  borderRight: '2px solid rgba(240,165,0,0.5)',
                }}
              />
              <div
                className="absolute bottom-4 left-4 w-8 h-8"
                style={{
                  borderBottom: '2px solid rgba(240,165,0,0.5)',
                  borderLeft: '2px solid rgba(240,165,0,0.5)',
                }}
              />
            </div>
          </div>
        </FadeUp>
      ))}
    </section>
  )
}

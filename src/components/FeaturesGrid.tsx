import { FadeUp } from './Animations'

const capabilities = [
  {
    id: 'cap-finality',
    code: 'FIN',
    title: 'Single-Block Finality',
    detail: 'No probabilistic confirmation windows. Finality happens in one block, guaranteed by BFT consensus.',
    metric: '400ms',
    metricLabel: 'finality time',
  },
  {
    id: 'cap-zk',
    code: 'ZKP',
    title: 'Native ZK Proofs',
    detail: 'Privacy-preserving computation at the base layer. Prove state transitions without revealing inputs.',
    metric: '2.1KB',
    metricLabel: 'avg proof size',
  },
  {
    id: 'cap-yield',
    code: 'YLD',
    title: 'Protocol Yield',
    detail: 'Liquid staking built into the execution layer. Earn validator rewards without bridging or wrapping.',
    metric: '8.4%',
    metricLabel: 'annual yield',
  },
  {
    id: 'cap-audit',
    code: 'SEC',
    title: 'Independently Audited',
    detail: 'Trail of Bits + OpenZeppelin + Halborn. Ongoing bug bounty at $500K per critical vulnerability.',
    metric: '$500K',
    metricLabel: 'bug bounty cap',
  },
  {
    id: 'cap-evm',
    code: 'EVM',
    title: 'EVM Compatible',
    detail: 'Deploy existing Solidity contracts with zero rewrites. Full toolchain support: Hardhat, Foundry, ethers.js.',
    metric: '100%',
    metricLabel: 'evm compat.',
  },
  {
    id: 'cap-gas',
    code: 'GAS',
    title: 'Predictable Fees',
    detail: 'No EIP-1559 volatility spikes. Flat-rate gas model with optional fee delegation for dApp users.',
    metric: '<$0.01',
    metricLabel: 'avg tx fee',
  },
]

export default function FeaturesGrid() {
  return (
    <section
      id="ecosystem"
      style={{ background: 'var(--bg-raised)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-6 lg:px-12 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="mono-amber">// WHY CHAINFORGE</span>
        <span className="mono">6 MODULES</span>
      </div>

      {/* 2-column capability list */}
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          {/* Left column */}
          <div className="flex flex-col lg:pr-12 lg:border-r" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {capabilities.slice(0, 3).map((cap, i) => (
              <FadeUp key={cap.id} delay={i * 0.08}>
                <div
                  id={cap.id}
                  className="group flex items-start gap-6 py-6 border-b cursor-default"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  {/* Code tag */}
                  <div
                    className="flex-shrink-0 font-mono-custom font-bold text-xs py-1 px-2 mt-1"
                    style={{ background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid var(--amber-border)', minWidth: '44px', textAlign: 'center' }}
                  >
                    {cap.code}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="font-heading font-semibold text-white text-base group-hover:text-amber transition-colors" style={{ '--tw-text-opacity': '1' } as any}>
                        {cap.title}
                      </h3>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono-custom font-bold text-base" style={{ color: 'var(--amber)' }}>
                          {cap.metric}
                        </div>
                        <div className="mono" style={{ fontSize: '9px' }}>{cap.metricLabel}</div>
                      </div>
                    </div>
                    <p className="font-heading font-light text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {cap.detail}
                    </p>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>

          {/* Right column */}
          <div className="flex flex-col lg:pl-12">
            {capabilities.slice(3).map((cap, i) => (
              <FadeUp key={cap.id} delay={(i + 3) * 0.08}>
                <div
                  id={cap.id}
                  className="group flex items-start gap-6 py-6 border-b cursor-default"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  <div
                    className="flex-shrink-0 font-mono-custom font-bold text-xs py-1 px-2 mt-1"
                    style={{ background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid var(--amber-border)', minWidth: '44px', textAlign: 'center' }}
                  >
                    {cap.code}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="font-heading font-semibold text-white text-base">
                        {cap.title}
                      </h3>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono-custom font-bold text-base" style={{ color: 'var(--amber)' }}>
                          {cap.metric}
                        </div>
                        <div className="mono" style={{ fontSize: '9px' }}>{cap.metricLabel}</div>
                      </div>
                    </div>
                    <p className="font-heading font-light text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {cap.detail}
                    </p>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

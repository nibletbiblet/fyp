import { FadeUp, Counter } from './Animations'
import HlsVideo from './HlsVideo'

const stats = [
  { id: 'stat-tvl', value: '$4.2B', label: 'TOTAL VALUE LOCKED', sublabel: 'across all protocols' },
  { id: 'stat-uptime', value: '99.97%', label: 'NETWORK UPTIME', sublabel: '12-month rolling avg' },
  { id: 'stat-block', value: '0.4s', label: 'AVG BLOCK TIME', sublabel: 'finality, not confirm.' },
  { id: 'stat-wallets', value: '1.4M', label: 'ACTIVE WALLETS', sublabel: '30d unique signers' },
]

export default function Stats() {
  return (
    <section id="stats" className="relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* HLS Video — desaturated, very dim, used as ambient texture */}
      <div className="relative h-[380px] overflow-hidden">
        <HlsVideo
          src="https://stream.mux.com/NcU3HlHeF7CUL86azTTzpy3Tlb00d6iF3BmCdFslMJYM.m3u8"
          className="absolute inset-0 w-full h-full object-cover"
          desaturated
          style={{ filter: 'saturate(0) brightness(0.08)' }}
        />
        <div className="absolute inset-0 grid-lines" />

        {/* Horizontal amber lines */}
        {[25, 50, 75].map((pos) => (
          <div
            key={pos}
            className="absolute left-0 right-0 h-px pointer-events-none"
            style={{
              top: `${pos}%`,
              background: `rgba(240,165,0,${pos === 50 ? 0.06 : 0.03})`,
            }}
          />
        ))}

        {/* Stat numbers overlaid on video */}
        <div className="absolute inset-0 flex items-center">
          <div className="w-full max-w-7xl mx-auto px-6 lg:px-12">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-x"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              {stats.map((stat, i) => (
                <FadeUp key={stat.id} delay={i * 0.1}>
                  <div id={stat.id} className="flex flex-col gap-2 px-6 lg:px-8 first:pl-0">
                    <div
                      className="font-mono-custom font-bold"
                      style={{
                        fontSize: 'clamp(2rem, 4.5vw, 3.5rem)',
                        color: 'var(--amber)',
                        lineHeight: 1,
                        letterSpacing: '-0.02em',
                        textShadow: '0 0 30px rgba(240,165,0,0.4)',
                      }}
                    >
                      <Counter target={stat.value} />
                    </div>
                    <div className="mono text-[10px]">{stat.label}</div>
                    <div className="mono text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{stat.sublabel}</div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Below stats: data log panel */}
      <div
        className="max-w-7xl mx-auto px-6 lg:px-12 py-8"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <FadeUp>
          <div className="panel p-0 overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-raised)' }}>
              <span className="mono-amber">RECENT BLOCK LOG</span>
              <div className="flex items-center gap-2">
                <div className="live-dot" />
                <span className="mono">LIVE</span>
              </div>
            </div>
            {/* Log rows */}
            {[
              { block: '21,844,294', txs: '1,847', validator: '0x4f3b...a12c', reward: '0.0423 ETH', time: '2s ago' },
              { block: '21,844,293', txs: '2,103', validator: '0x8e1a...f77d', reward: '0.0389 ETH', time: '14s ago' },
              { block: '21,844,292', txs: '1,652', validator: '0x2c9e...b45f', reward: '0.0411 ETH', time: '26s ago' },
            ].map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-5 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                style={{ borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              >
                <span className="font-mono-custom text-xs" style={{ color: 'var(--amber)' }}>#{row.block}</span>
                <span className="mono">{row.txs} TXS</span>
                <span className="mono hidden sm:block">{row.validator}</span>
                <span className="mono hidden md:block">{row.reward}</span>
                <span className="mono text-right">{row.time}</span>
              </div>
            ))}
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

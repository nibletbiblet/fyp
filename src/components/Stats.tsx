import { motion } from 'motion/react'
import HlsVideo from './HlsVideo'
import BlurText from './BlurText'

const stats = [
  { value: '$4.2B', label: 'Total Value Locked' },
  { value: '99.97%', label: 'Uptime (12 months)' },
  { value: '0.3s', label: 'Avg. Block Time' },
  { value: '1.4M+', label: 'Active Wallets' },
]

export default function Stats() {
  return (
    <section id="stats" className="relative overflow-hidden py-4">
      {/* HLS Video Background — desaturated */}
      <HlsVideo
        src="https://stream.mux.com/NcU3HlHeF7CUL86azTTzpy3Tlb00d6iF3BmCdFslMJYM.m3u8"
        className="absolute inset-0 w-full h-full object-cover z-0"
        desaturated
      />

      {/* Cyan tint overlay */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{ background: 'rgba(0, 20, 40, 0.5)' }}
      />

      {/* Top gradient */}
      <div
        className="absolute top-0 left-0 right-0 z-[2] pointer-events-none"
        style={{
          height: '200px',
          background: 'linear-gradient(to bottom, black, transparent)',
        }}
      />
      {/* Bottom gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[2] pointer-events-none"
        style={{
          height: '200px',
          background: 'linear-gradient(to top, black, transparent)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 px-6 md:px-16 py-24">
        <div className="max-w-5xl mx-auto">
          {/* Section label */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center text-center mb-12"
          >
            <div className="liquid-glass rounded-full px-3.5 py-1 mb-6">
              <span className="text-xs font-medium text-white font-body tracking-wider uppercase">
                By the Numbers
              </span>
            </div>
            <BlurText
              text="Proof is on the chain."
              className="text-4xl md:text-5xl font-heading italic text-white tracking-tight leading-[0.9]"
              delay={70}
              splitBy="words"
            />
          </motion.div>

          {/* Stats card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="liquid-glass rounded-3xl p-10 md:p-14"
            id="stats-card"
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-10">
              {stats.map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  className="flex flex-col gap-2"
                  id={`stat-${i}`}
                >
                  <span
                    className="text-4xl md:text-5xl lg:text-6xl font-heading italic text-white neon-glow"
                    style={{ textShadow: '0 0 20px rgba(0,229,255,0.5), 0 0 40px rgba(0,229,255,0.2)' }}
                  >
                    {stat.value}
                  </span>
                  <span className="text-white/50 font-body font-light text-sm">
                    {stat.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

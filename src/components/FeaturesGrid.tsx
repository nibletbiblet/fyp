import { motion } from 'motion/react'
import { Zap, Lock, BarChart3, Shield } from 'lucide-react'
import BlurText from './BlurText'

const features = [
  {
    id: 'feature-speed',
    icon: Zap,
    title: 'Sub-Second Finality',
    body: 'Transactions confirm in under 400ms. Not eventually consistent. Truly final. Because latency is a liability in DeFi.',
  },
  {
    id: 'feature-privacy',
    icon: Lock,
    title: 'Zero-Knowledge Native',
    body: 'Privacy built into the base layer. ZK proofs verify without revealing. Your on-chain activity stays yours.',
  },
  {
    id: 'feature-yield',
    icon: BarChart3,
    title: 'Yield-Optimized',
    body: 'Stake, earn, and compound — all natively. Protocol-level yield mechanics designed to outperform centralized alternatives.',
  },
  {
    id: 'feature-security',
    icon: Shield,
    title: 'Audited & Immutable',
    body: 'Triple-audited by leading security firms. Bug bounties live on-chain. Every contract deployed is battle-hardened.',
  },
]

export default function FeaturesGrid() {
  return (
    <section id="ecosystem" className="py-24 px-6 md:px-16 bg-black">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="liquid-glass rounded-full px-3.5 py-1 mb-6"
            id="features-grid-badge"
          >
            <span className="text-xs font-medium text-white font-body tracking-wider uppercase">
              Why ChainForge
            </span>
          </motion.div>

          <BlurText
            text="The edge is everything."
            className="text-4xl md:text-5xl lg:text-6xl font-heading italic text-white tracking-tight leading-[0.9]"
            delay={70}
            splitBy="words"
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.id}
              id={feature.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="liquid-glass rounded-2xl p-6 flex flex-col gap-4 group hover:scale-[1.02] transition-transform duration-300"
            >
              {/* Icon */}
              <div className="liquid-glass-strong rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0">
                <feature.icon
                  size={18}
                  className="text-neon group-hover:scale-110 transition-transform duration-200"
                />
              </div>

              {/* Title */}
              <h3 className="text-white font-body font-semibold text-base leading-tight">
                {feature.title}
              </h3>

              {/* Body */}
              <p className="text-white/50 font-body font-light text-sm leading-relaxed">
                {feature.body}
              </p>

              {/* Bottom neon line */}
              <div
                className="h-px w-0 group-hover:w-full transition-all duration-500"
                style={{ background: 'linear-gradient(90deg, rgba(0,229,255,0.5), transparent)' }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

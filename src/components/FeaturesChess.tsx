import { motion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import BlurText from './BlurText'
import feature1 from '../assets/feature-1.gif'
import feature2 from '../assets/feature-2.gif'

const rows = [
  {
    id: 'chess-row-1',
    title: 'Engineered to scale. Hardened to survive.',
    body: 'Every transaction is final. Our consensus layer draws from the best EVM-compatible chains — then exceeds them. Your protocol doesn\'t just run. It outperforms.',
    cta: 'Explore the Architecture',
    gif: feature1,
    reverse: false,
  },
  {
    id: 'chess-row-2',
    title: 'It learns the chain. Automatically.',
    body: 'Your smart contracts evolve with the ecosystem. On-chain analytics track gas patterns, liquidity flows, and attack vectors — then harden your protocol in real time. Zero manual patching. Ever.',
    cta: 'See how it works',
    gif: feature2,
    reverse: true,
  },
]

export default function FeaturesChess() {
  return (
    <section id="chain" className="py-24 px-6 md:px-16 bg-black relative overflow-hidden">
      {/* Background hex pattern */}
      <div className="absolute inset-0 hex-pattern opacity-30 pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="liquid-glass rounded-full px-3.5 py-1 mb-6"
            id="features-chess-badge"
          >
            <span className="text-xs font-medium text-white font-body tracking-wider uppercase">
              Capabilities
            </span>
          </motion.div>

          <BlurText
            text="Pro-grade. Zero compromise."
            className="text-4xl md:text-5xl lg:text-6xl font-heading italic text-white tracking-tight leading-[0.9]"
            delay={70}
            splitBy="words"
          />
        </div>

        {/* Rows */}
        <div className="flex flex-col gap-24">
          {rows.map((row) => (
            <motion.div
              key={row.id}
              id={row.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className={`flex flex-col md:flex-row items-center gap-12 ${row.reverse ? 'md:flex-row-reverse' : ''}`}
            >
              {/* Text content */}
              <div className="flex-1 flex flex-col gap-6">
                <h3 className="text-3xl md:text-4xl font-heading italic text-white leading-tight">
                  {row.title}
                </h3>
                <p className="text-white/50 font-body font-light text-sm md:text-base leading-relaxed">
                  {row.body}
                </p>
                <div>
                  <a
                    href="#cta"
                    className="inline-flex items-center gap-2 liquid-glass-strong rounded-full px-5 py-2.5 text-sm font-body font-medium text-white hover:scale-105 transition-transform duration-200"
                  >
                    {row.cta}
                    <ArrowUpRight size={14} />
                  </a>
                </div>

                {/* Neon accent line */}
                <div
                  className="h-px w-24 mt-2"
                  style={{ background: 'linear-gradient(90deg, rgba(0,229,255,0.6), transparent)' }}
                />
              </div>

              {/* GIF */}
              <div className="flex-1">
                <div className="liquid-glass rounded-2xl overflow-hidden neon-border">
                  <img
                    src={row.gif}
                    alt={row.title}
                    className="w-full h-auto object-cover"
                    style={{ filter: 'hue-rotate(160deg) saturate(1.2) brightness(0.9)' }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

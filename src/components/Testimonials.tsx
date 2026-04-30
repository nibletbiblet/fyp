import { motion } from 'motion/react'
import BlurText from './BlurText'

const testimonials = [
  {
    id: 'testimonial-1',
    quote:
      'We migrated our entire DeFi protocol in 72 hours. Settlement speeds tripled. The security model is unlike anything else in production right now.',
    name: 'James Huang',
    role: 'CTO, NexusFi',
  },
  {
    id: 'testimonial-2',
    quote:
      "TVL up 6x in 90 days post-migration. That's not luck. That's what happens when your chain is built on real performance data.",
    name: 'Priya Nair',
    role: 'Head of DeFi, Arcline Protocol',
  },
  {
    id: 'testimonial-3',
    quote:
      "They didn't just give us infrastructure. They gave us an edge. Institutional-grade with the agility of a startup. That's rare in Web3.",
    name: 'Lukas Brandt',
    role: 'Founder, Helix Capital DAO',
  },
]

export default function Testimonials() {
  return (
    <section id="testimonials" className="py-24 px-6 md:px-16 bg-black relative">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(0,229,255,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="liquid-glass rounded-full px-3.5 py-1 mb-6"
            id="testimonials-badge"
          >
            <span className="text-xs font-medium text-white font-body tracking-wider uppercase">
              Community Voice
            </span>
          </motion.div>

          <BlurText
            text="Builders who shipped on-chain."
            className="text-4xl md:text-5xl lg:text-6xl font-heading italic text-white tracking-tight leading-[0.9]"
            delay={70}
            splitBy="words"
          />
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.id}
              id={t.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="liquid-glass rounded-2xl p-8 flex flex-col gap-6 hover:scale-[1.02] transition-transform duration-300 group"
            >
              {/* Quote marks */}
              <div
                className="text-4xl font-heading leading-none"
                style={{ color: 'rgba(0,229,255,0.3)' }}
              >
                "
              </div>

              <p className="text-white/70 font-body font-light text-sm italic leading-relaxed flex-1">
                {t.quote}
              </p>

              {/* Divider */}
              <div
                className="h-px w-full"
                style={{ background: 'linear-gradient(90deg, rgba(0,229,255,0.2), transparent)' }}
              />

              {/* Attribution */}
              <div className="flex flex-col gap-0.5">
                <span className="text-white font-body font-medium text-sm">{t.name}</span>
                <span className="text-white/40 font-body font-light text-xs">{t.role}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

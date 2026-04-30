import { motion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import HlsVideo from './HlsVideo'
import BlurText from './BlurText'

export default function StartSection() {
  return (
    <section
      id="protocol"
      className="relative overflow-hidden"
      style={{ minHeight: '700px' }}
    >
      {/* HLS Video Background */}
      <HlsVideo
        src="https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8"
        className="absolute inset-0 w-full h-full object-cover z-0"
        style={{ filter: 'brightness(0.3) hue-rotate(180deg) saturate(1.5)' }}
      />

      {/* Grid overlay for crypto feel */}
      <div className="absolute inset-0 grid-bg opacity-20 z-[1] pointer-events-none" />

      {/* Neon glow pulse */}
      <div
        className="absolute z-[1] pointer-events-none"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(0,229,255,0.06) 0%, transparent 70%)',
        }}
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
      <div
        className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-32"
        style={{ minHeight: '700px' }}
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="liquid-glass rounded-full px-3.5 py-1 mb-6"
          id="start-badge"
        >
          <span className="text-xs font-medium text-white font-body tracking-wider uppercase">
            How It Works
          </span>
        </motion.div>

        {/* Heading */}
        <BlurText
          text="You propose. The chain executes."
          className="text-4xl md:text-5xl lg:text-6xl font-heading italic text-white tracking-tight leading-[0.9] max-w-3xl mb-6"
          delay={80}
          splitBy="words"
        />

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-white/50 font-body font-light text-sm md:text-base max-w-lg mb-10 leading-relaxed"
          id="start-subtext"
        >
          Connect your wallet. Deploy your contract. The protocol handles consensus,
          settlement, and security — all in seconds, not days.
        </motion.p>

        {/* CTA */}
        <motion.a
          href="#cta"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="flex items-center gap-2 liquid-glass-strong rounded-full px-6 py-3 text-sm font-body font-medium text-white hover:scale-105 transition-transform duration-200"
          id="start-cta"
        >
          Start Building
          <ArrowUpRight size={16} />
        </motion.a>

        {/* Step indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="flex items-center gap-8 mt-16"
          id="start-steps"
        >
          {[
            { num: '01', label: 'Connect Wallet' },
            { num: '02', label: 'Deploy Contract' },
            { num: '03', label: 'Go Live On-Chain' },
          ].map((step, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <span className="text-neon font-heading italic text-2xl">{step.num}</span>
              <span className="text-white/40 text-xs font-body font-light tracking-wider uppercase">
                {step.label}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

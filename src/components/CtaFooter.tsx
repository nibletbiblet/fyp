import { motion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import HlsVideo from './HlsVideo'
import BlurText from './BlurText'

export default function CtaFooter() {
  return (
    <section id="cta" className="relative overflow-hidden">
      {/* HLS Video Background */}
      <HlsVideo
        src="https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8"
        className="absolute inset-0 w-full h-full object-cover z-0"
        style={{ filter: 'brightness(0.25) hue-rotate(180deg) saturate(1.8)' }}
      />

      {/* Grid overlay */}
      <div className="absolute inset-0 grid-bg opacity-25 z-[1] pointer-events-none" />

      {/* Neon center glow */}
      <div
        className="absolute z-[1] pointer-events-none"
        style={{
          bottom: '30%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '800px',
          height: '400px',
          background: 'radial-gradient(ellipse, rgba(0,229,255,0.08) 0%, transparent 70%)',
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
      <div className="relative z-10 px-6 md:px-16 pt-32 pb-16">
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="liquid-glass rounded-full px-3.5 py-1 mb-8"
            id="cta-badge"
          >
            <span className="text-xs font-medium text-white font-body tracking-wider uppercase">
              Join the Protocol
            </span>
          </motion.div>

          {/* Heading */}
          <BlurText
            text="Your on-chain future starts now."
            className="text-5xl md:text-6xl lg:text-7xl font-heading italic text-white leading-[0.85] mb-8"
            delay={70}
            splitBy="words"
          />

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-white/50 font-body font-light text-sm md:text-base max-w-lg mb-12 leading-relaxed"
            id="cta-subtext"
          >
            Get early access to the protocol. Deploy your first smart contract. No
            seed phrase drama. No gas wars. Just clean, fast, trustless infrastructure.
          </motion.p>

          {/* Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="flex items-center gap-4 flex-wrap justify-center"
            id="cta-buttons"
          >
            <a
              id="cta-primary"
              href="#"
              className="flex items-center gap-2 liquid-glass-strong rounded-full px-6 py-3 text-sm font-body font-medium text-white hover:scale-105 transition-transform duration-200"
            >
              Request Early Access
              <ArrowUpRight size={16} />
            </a>
            <a
              id="cta-secondary"
              href="#tokenomics"
              className="flex items-center gap-2 bg-white text-black rounded-full px-6 py-3 text-sm font-body font-semibold hover:bg-white/90 transition-all duration-200"
            >
              View Tokenomics
            </a>
          </motion.div>
        </div>

        {/* Footer bar */}
        <div
          className="mt-32 pt-8 flex flex-col md:flex-row items-center justify-between gap-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          id="footer-bar"
        >
          <p className="text-white/30 text-xs font-body font-light">
            © 2026 ChainForge. All rights reserved. Built on-chain.
          </p>
          <div className="flex items-center gap-6">
            {['Privacy', 'Terms', 'Docs', 'Discord'].map((link) => (
              <a
                key={link}
                href="#"
                id={`footer-${link.toLowerCase()}`}
                className="text-white/30 text-xs font-body font-light hover:text-white/60 transition-colors duration-200"
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

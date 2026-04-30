import { motion } from 'motion/react'
import { ArrowUpRight, Play } from 'lucide-react'
import BlurText from './BlurText'

const partners = ['Ethereum', 'Solana', 'Chainlink', 'Uniswap', 'Aave']

export default function Hero() {
  return (
    <section
      id="home"
      className="relative overflow-hidden"
      style={{ height: '1000px' }}
    >
      {/* Background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster="/images/hero_bg.jpeg"
        className="absolute left-0 w-full h-auto object-contain z-0"
        style={{ top: '20%' }}
      >
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260307_083826_e938b29f-a43a-41ec-a153-3d4730578ab8.mp4"
          type="video/mp4"
        />
      </video>

      {/* Crypto grid overlay */}
      <div className="absolute inset-0 grid-bg opacity-30 z-0 pointer-events-none" />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40 z-0" />

      {/* Neon accent glow - top left */}
      <div
        className="absolute z-0 pointer-events-none"
        style={{
          top: '15%',
          left: '5%',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)',
        }}
      />
      {/* Neon accent glow - bottom right */}
      <div
        className="absolute z-0 pointer-events-none"
        style={{
          bottom: '20%',
          right: '5%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)',
        }}
      />

      {/* Bottom gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[1] pointer-events-none"
        style={{
          height: '300px',
          background: 'linear-gradient(to bottom, transparent, black)',
        }}
      />

      {/* Content */}
      <div
        className="relative z-10 flex flex-col items-center text-center px-4"
        style={{ paddingTop: '150px' }}
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex items-center gap-2 liquid-glass rounded-full px-1 py-1 mb-8"
          id="hero-badge"
        >
          <span className="bg-white text-black rounded-full px-3 py-1 text-xs font-semibold font-body">
            Mainnet Live
          </span>
          <span className="text-white/70 text-sm font-body pr-2">
            Protocol v2 is now deployed on-chain.
          </span>
        </motion.div>

        {/* Main Heading */}
        <BlurText
          text="The Chain Built for What's Next"
          className="text-6xl md:text-7xl lg:text-[5.5rem] font-heading italic text-white leading-[0.85] max-w-3xl tracking-[-3px] mb-6"
          delay={100}
          splitBy="words"
          direction="bottom"
        />

        {/* Subtext */}
        <motion.p
          initial={{ filter: 'blur(10px)', opacity: 0, y: 20 }}
          animate={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-sm md:text-base text-white/60 font-body font-light leading-relaxed max-w-lg mb-10"
          id="hero-subtext"
        >
          Institutional-grade infrastructure. Trustless by design. On-chain settlement
          at the speed of thought — wildly reimagined for the decentralized era.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ filter: 'blur(10px)', opacity: 0, y: 20 }}
          animate={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.1 }}
          className="flex items-center gap-4"
          id="hero-ctas"
        >
          <a
            id="hero-cta-primary"
            href="#cta"
            className="flex items-center gap-2 liquid-glass-strong rounded-full px-5 py-2.5 text-sm font-body font-medium text-white hover:scale-105 transition-transform duration-200"
          >
            Launch App
            <ArrowUpRight size={16} />
          </a>
          <button
            id="hero-cta-secondary"
            className="flex items-center gap-2 text-sm font-body font-light text-white/70 hover:text-white transition-colors duration-200"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/20">
              <Play size={12} fill="white" />
            </div>
            Watch Demo
          </button>
        </motion.div>

        {/* Partners bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.4 }}
          className="mt-auto pt-20 pb-8 flex flex-col items-center gap-6"
          id="hero-partners"
        >
          <div className="liquid-glass rounded-full px-4 py-2">
            <span className="text-white/40 text-xs font-body font-light tracking-widest uppercase">
              Integrated with
            </span>
          </div>
          <div className="flex items-center gap-10 md:gap-14 flex-wrap justify-center">
            {partners.map((partner) => (
              <span
                key={partner}
                className="text-xl md:text-2xl font-heading italic text-white/30 hover:text-white/60 transition-colors duration-300"
              >
                {partner}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

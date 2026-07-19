import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Link } from 'react-router-dom'
import logoIcon from '../assets/logo-icon.png'

// Live block ticker data
const tickerItems = [
  { label: 'ETH/USD', value: '$3,241.88', change: '+2.14%', up: true },
  { label: 'BTC/USD', value: '$67,450.20', change: '+0.82%', up: true },
  { label: 'SOL/USD', value: '$148.30', change: '-0.44%', up: false },
  { label: 'LINK/USD', value: '$14.72', change: '+5.38%', up: true },
  { label: 'BLOCK HEIGHT', value: '#21,844,291', change: '', up: true },
  { label: 'GAS (GWEI)', value: '22', change: '↓ low', up: true },
  { label: 'ETH/USD', value: '$3,241.88', change: '+2.14%', up: true },
  { label: 'BTC/USD', value: '$67,450.20', change: '+0.82%', up: true },
  { label: 'SOL/USD', value: '$148.30', change: '-0.44%', up: false },
  { label: 'LINK/USD', value: '$14.72', change: '+5.38%', up: true },
  { label: 'BLOCK HEIGHT', value: '#21,844,291', change: '', up: true },
  { label: 'GAS (GWEI)', value: '22', change: '↓ low', up: true },
]

const navLinks = [
  { label: 'Protocol', href: '#protocol' },
  { label: 'Chain', href: '#chain' },
  { label: 'Ecosystem', href: '#ecosystem' },
  { label: 'Docs', href: '#docs' },
]

export default function Navbar() {
  const [blockHeight, setBlockHeight] = useState(21844291)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Simulate live block height
  useEffect(() => {
    const id = setInterval(() => {
      setBlockHeight(h => h + 1)
    }, 12000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Ticker tape */}
      <div className="ticker-wrap bg-raised py-2">
        <div className="ticker-inner">
          {tickerItems.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-3 px-8">
              <span className="mono text-muted-custom">{item.label}</span>
              <span className="font-mono-custom text-xs font-bold text-white/80">{item.value}</span>
              {item.change && (
                <span
                  className="font-mono-custom text-xs"
                  style={{ color: item.up ? '#22c55e' : '#ef4444' }}
                >
                  {item.change}
                </span>
              )}
              <span className="text-white/10 mx-2">|</span>
            </span>
          ))}
        </div>
      </div>

      {/* Main nav bar */}
      <nav
        className="flex items-center justify-between px-6 lg:px-12 py-4"
        style={{
          background: 'rgba(8,8,8,0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
        id="main-nav"
      >
        {/* Left: Logo + brand */}
        <div className="flex items-center gap-3">
          <img src={logoIcon} alt="ChainForge" className="h-7 w-7 object-contain" />
          <div className="flex flex-col leading-none">
            <span className="font-heading font-bold text-white text-sm tracking-wide uppercase">
              ChainForge
            </span>
            <span className="mono text-[9px]" style={{ color: 'var(--amber)' }}>
              MAINNET LIVE
            </span>
          </div>
        </div>

        {/* Center: nav links */}
        <div className="hidden md:flex items-center gap-0" id="desktop-nav">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              id={`nav-${link.label.toLowerCase()}`}
              className="px-5 py-2 mono text-muted-custom hover:text-white transition-colors duration-150 relative group"
            >
              {link.label}
              <span
                className="absolute bottom-0 left-0 w-0 h-px group-hover:w-full transition-all duration-300"
                style={{ background: 'var(--amber)' }}
              />
            </a>
          ))}
        </div>

        {/* Right: block height + CTA */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2">
            <div className="live-dot" />
            <span className="font-mono-custom text-xs" style={{ color: 'var(--text-secondary)' }}>
              #{blockHeight.toLocaleString()}
            </span>
          </div>
          <Link
            to="/login"
            id="nav-login"
            className="btn-ghost text-[11px] py-2 px-5"
          >
            Login
          </Link>
          <Link
            to="/register"
            id="nav-register"
            className="btn-primary text-[11px] py-2 px-5"
          >
            Register
          </Link>
          {/* Mobile toggle */}
          <button
            className="md:hidden text-white/60 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            id="mobile-toggle"
          >
            <div className="flex flex-col gap-1.5 w-5">
              <span
                className="h-px transition-all"
                style={{
                  background: 'currentColor',
                  transform: mobileOpen ? 'rotate(45deg) translateY(4px)' : 'none',
                }}
              />
              <span
                className="h-px transition-all"
                style={{
                  background: 'currentColor',
                  opacity: mobileOpen ? 0 : 1,
                }}
              />
              <span
                className="h-px transition-all"
                style={{
                  background: 'currentColor',
                  transform: mobileOpen ? 'rotate(-45deg) translateY(-4px)' : 'none',
                }}
              />
            </div>
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden"
            style={{ background: 'var(--bg-panel)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            id="mobile-nav"
          >
            <div className="flex flex-col px-6 py-4 gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="py-3 mono text-white/50 hover:text-white border-b border-white/5"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <Link to="/login" className="btn-ghost mt-4 justify-center" onClick={() => setMobileOpen(false)}>
                Login
              </Link>
              <Link to="/register" className="btn-primary justify-center" onClick={() => setMobileOpen(false)}>
                Register
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
